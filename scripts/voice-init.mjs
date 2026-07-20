#!/usr/bin/env node
// scripts/voice-init.mjs
// The SINGLE entry point for putting a voice agent on a product: it (optionally)
// provisions the ElevenLabs agent from the canonical persona AND emits voice.config.ts
// with the REAL agent id into the target project — one command, no id hand-carrying.
//
// Two modes:
//   • scaffold-only (default) — asks ~5 questions, writes voice.config.ts with a
//     placeholder (or --agent-id) agent id, prints provisioning next-steps.
//   • provision (--provision)  — additionally calls provisionVoiceAgent() with the
//     canonical persona (voice-config.json), takes the returned agent id, and writes
//     THAT into voice.config.ts. Requires ELEVENLABS_API_KEY (BYOK).
//
// The agent id is written into voice.config.ts (PRODUCT_STANDARDS §6) — never a
// hand-set NEXT_PUBLIC_* env. The pure config mapping it calls is unit-tested in the package.
//
// Usage (from the cais-shared-services repo root):
//   node scripts/voice-init.mjs --target ../my-product                 # scaffold-only
//   node scripts/voice-init.mjs --target ../my-product --provision \
//        --name "My Product" --base-url https://my-product.vercel.app  # provision + scaffold
//   node scripts/voice-init.mjs --target ../my-product --agent-id agent_xxx   # adopt a known id
//
// Requires the package built first:
//   npm run build --workspace=packages/elevenlabs-convai

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildVoiceConfig,
  renderVoiceConfigModule,
  provisionVoiceAgent,
  standardAllowlist,
  createConversationTools,
  PLACEMENTS,
  MODES,
} from '../packages/elevenlabs-convai/dist/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

async function ask(rl, prompt, fallback, choices) {
  const ans = (await rl.question(`${prompt} (${fallback}): `)).trim() || fallback;
  if (choices && !choices.includes(ans)) {
    console.log(`  -> "${ans}" not valid; using "${fallback}".`);
    return fallback;
  }
  return ans;
}

// Provision the ElevenLabs agent from the canonical persona; return the real agent id.
async function provisionAgent({ persona, style, displayName, baseUrl }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      '--provision requires ELEVENLABS_API_KEY in the environment (BYOK). ' +
      'Set it and re-run, or drop --provision to scaffold with a placeholder id.'
    );
  }
  if (!persona?.voiceId) {
    throw new Error('voice-config.json has no persona.voiceId — set the canonical voice ID before provisioning.');
  }

  const productName = displayName;
  const fill = (s) => (s || '').replace(/\{\{\s*productName\s*\}\}/g, productName);
  const hostname = (() => { try { return new URL(baseUrl).hostname; } catch { return baseUrl; } })();

  const config = {
    agentName: `${persona.name} (${productName})`, // stable + product-unique → idempotent
    voiceId: persona.voiceId,
    voiceModel: persona.voiceModel,
    llmModel: persona.llmModel,
    temperature: persona.temperature,
  };
  const systemPrompt = fill(style?.systemPromptPersonaBlock) ||
    `You are the voice assistant for ${productName}. Speak plainly and help the user act.`;
  const firstMessage = fill(style?.firstMessage) ||
    `Hi, I'm here to help with ${productName}. What would you like to do?`;

  const result = await provisionVoiceAgent(apiKey, {
    config,
    systemPrompt,
    firstMessage,
    language: persona.language || 'en',
    tools: createConversationTools(baseUrl),
    baseUrl,
    allowedOrigins: standardAllowlist(hostname),
  });
  return result;
}

async function main() {
  const targetDir = resolve(arg('target', process.cwd()));
  const displayName = arg('name', basename(targetDir));
  const baseUrl = arg('base-url', `https://${basename(targetDir)}.vercel.app`);
  const doProvision = flag('provision');
  let agentId = arg('agent-id', 'REPLACE_WITH_PROVISIONED_AGENT_ID');

  let persona = null;
  let style = null;
  const personaPath = join(repoRoot, 'voice-config.json');
  if (existsSync(personaPath)) {
    try {
      const parsed = JSON.parse(readFileSync(personaPath, 'utf8'));
      persona = parsed.persona;
      style = parsed.style;
    } catch { /* ignore */ }
  }

  const rl = createInterface({ input, output });
  console.log(`\nVoice agent scaffold${doProvision ? ' + provision' : ''} — 5 quick questions.\n`);

  const placement = await ask(rl, `1) Placement [${PLACEMENTS.join(' / ')}]`, 'floating', PLACEMENTS);
  const mode = await ask(rl, `2) Mode [${MODES.join(' / ')}]`, 'greeting', MODES);
  const textFallbackRaw = await ask(rl, '3) Text fallback when voice unavailable? (y/n)', 'y');
  const clarifierRaw = await rl.question('4) Clarifier fields (comma-separated, optional): ');
  const personaName = persona?.name || 'Corporate AI Solutions Assistant';
  const confirm = await ask(rl, `5) Use canonical persona "${personaName}" (voice ${persona?.voiceId || 'unset'})? (y/n)`, 'y');
  rl.close();

  if (confirm.toLowerCase().startsWith('n')) {
    console.log('\nPersona is a portfolio brand layer — edit voice-config.json to change it, then re-run.\n');
  }

  // Provision first (if asked) so the config carries the REAL id.
  let webhookSecret;
  let allowedOrigins;
  if (doProvision) {
    console.log(`\nProvisioning agent for "${displayName}" (${baseUrl})…`);
    const result = await provisionAgent({ persona, style, displayName, baseUrl });
    agentId = result.agentId;
    webhookSecret = result.webhookSecret;
    allowedOrigins = standardAllowlist((() => { try { return new URL(baseUrl).hostname; } catch { return baseUrl; } })());
    console.log(`  ${result.created ? 'Created' : 'Adopted'} agent ${agentId}`);
  }

  const answers = {
    placement,
    mode,
    textFallback: textFallbackRaw.toLowerCase().startsWith('y'),
    clarifierFields: clarifierRaw.split(',').map((s) => s.trim()).filter(Boolean),
    ...(allowedOrigins ? { allowedOrigins } : {}),
  };

  const config = buildVoiceConfig(agentId, answers);
  const moduleText = renderVoiceConfigModule(config, answers.clarifierFields);
  const outPath = join(targetDir, 'voice.config.ts');
  writeFileSync(outPath, moduleText, 'utf8');

  console.log(`\nWrote ${outPath}`);

  if (doProvision) {
    console.log('\nProvisioned + scaffolded. Remaining steps:');
    console.log('  1. Mount <VoiceWidget {...voiceConfig} /> in your authenticated layout');
    console.log("     (import { voiceConfig } from '@/voice.config').");
    if (webhookSecret) {
      console.log('  2. Set ELEVENLABS_WEBHOOK_SECRET (sensitive, prod+preview) to:');
      console.log(`       ${webhookSecret}`);
      console.log('     (shown once — store it now for verifyWebhookSignature.)');
    }
    console.log('  3. Apply migration.sql (supabase db push) and wire createConvaiWebhookRoutes.\n');
  } else {
    console.log('\nScaffolded with a placeholder id. To provision + fill the real id in one step, re-run with:');
    console.log(`  node scripts/voice-init.mjs --target ${arg('target', '.')} --provision --name "${displayName}" --base-url ${baseUrl}`);
    console.log('  (requires ELEVENLABS_API_KEY). Then mount <VoiceWidget {...voiceConfig} /> and wire the webhook routes.\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
