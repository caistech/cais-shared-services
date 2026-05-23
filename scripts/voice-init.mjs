#!/usr/bin/env node
// scripts/voice-init.mjs
// Interactive scaffold wizard for a product's voice agent surface. Asks ~5 questions,
// emits voice.config.ts into the target project, and prints the provisioning next-steps.
// Lives here (alongside onboard-new-project.sh) per the portfolio "automation lives in
// scripts/" rule; the pure config mapping it calls is unit-tested in the package.
//
// Usage (from the cais-shared-services repo root):
//   node scripts/voice-init.mjs --target ../my-product [--agent-id agent_xxx]
//
// Requires the package built first:
//   npm run build --workspace=packages/elevenlabs-convai

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildVoiceConfig,
  renderVoiceConfigModule,
  PLACEMENTS,
  MODES,
} from '../packages/elevenlabs-convai/dist/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function ask(rl, prompt, fallback, choices) {
  const ans = (await rl.question(`${prompt} (${fallback}): `)).trim() || fallback;
  if (choices && !choices.includes(ans)) {
    console.log(`  -> "${ans}" not valid; using "${fallback}".`);
    return fallback;
  }
  return ans;
}

async function main() {
  const targetDir = resolve(arg('target', process.cwd()));
  const agentId = arg('agent-id', 'REPLACE_WITH_PROVISIONED_AGENT_ID');

  let persona = null;
  const personaPath = join(repoRoot, 'voice-config.json');
  if (existsSync(personaPath)) {
    try { persona = JSON.parse(readFileSync(personaPath, 'utf8')).persona; } catch { /* ignore */ }
  }

  const rl = createInterface({ input, output });
  console.log('\nVoice agent scaffold — 5 quick questions.\n');

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

  const answers = {
    placement,
    mode,
    textFallback: textFallbackRaw.toLowerCase().startsWith('y'),
    clarifierFields: clarifierRaw.split(',').map((s) => s.trim()).filter(Boolean),
  };

  const config = buildVoiceConfig(agentId, answers);
  const moduleText = renderVoiceConfigModule(config, answers.clarifierFields);
  const outPath = join(targetDir, 'voice.config.ts');
  writeFileSync(outPath, moduleText, 'utf8');

  console.log(`\nWrote ${outPath}`);
  console.log('\nNext steps:');
  console.log('  1. Provision the agent (sets the real agentId) with provisionVoiceAgent()');
  console.log('     — pass voiceId from voice-config.json, your baseUrl, allowedOrigins, and');
  console.log('       createConversationTools(baseUrl).');
  console.log('  2. Replace agentId in voice.config.ts with the returned agent id.');
  console.log('  3. Mount <VoiceWidget {...voiceConfig} /> in your authenticated layout.');
  console.log('  4. Apply migration.sql (supabase db push) and wire createConvaiWebhookRoutes.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
