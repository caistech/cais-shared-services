#!/usr/bin/env node
/**
 * Portfolio-wide setup script — walks a fresh operator through every
 * vendor credential a portfolio product needs, validates each one,
 * and writes a complete .env.local.
 *
 * Run from the product's repo root:
 *   node ../cais-shared-services/scripts/setup-product-credentials.mjs
 * Or if the hub is npm-linked:
 *   npx setup-product-credentials
 *
 * The script reads a `setup-manifest.json` at the product's repo root
 * and processes each credential entry in order. The manifest is the
 * source of truth for which keys the product needs, where to sign up,
 * and how to validate. Each portfolio product owns its own manifest.
 *
 * Why this exists: BYOK products require the user to set up many
 * vendor accounts. Without automation that's a 30–60 minute stumble
 * through tabs, copy-paste, and "wait which key goes in which env
 * var". This script collapses that to ~5–10 minutes by walking the
 * user through each vendor, surfacing the signup deep-link, validating
 * the pasted value, and producing a complete .env.local.
 *
 * Adheres to:
 *   - PROJECT BOOTSTRAP AUTOMATION rule in global CLAUDE.md
 *   - VOICE AI STANDARD RULE — handles ElevenLabs agent provisioning
 *     programmatically when the manifest declares a voice agent
 *   - "Generate agents via API" feedback — never sends users to a
 *     vendor dashboard to click-create resources
 */

import { createInterface } from 'readline';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Manifest schema (informal — kept in JSON for portability)
// ---------------------------------------------------------------------------
//
// {
//   "product_name": "Community Question Responder",
//   "credentials": [
//     {
//       "key": "ANTHROPIC_API_KEY",                  // env var name
//       "vendor": "Anthropic",                        // display name
//       "description": "Claude API for classifier and drafter",
//       "signup_url": "https://console.anthropic.com/account/keys",
//       "format": { "prefix": "sk-ant-", "min_length": 40 },
//       "required": true,                             // false = optional
//       "alternative_to": "OPENROUTER_API_KEY",       // if either-or
//       "validate": "anthropic",                      // validation hook name (optional)
//       "post_action": null                           // e.g. "create_elevenlabs_agent"
//     }
//   ],
//   "post_actions": [                                 // run after all keys captured
//     { "type": "create_elevenlabs_agent", "agent_env": "ELEVENLABS_AGENT_ID" }
//   ]
// }

// ---------------------------------------------------------------------------
// Interactive prompt helpers
// ---------------------------------------------------------------------------
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '…' + value.slice(-4);
}

function colour(code, s) {
  // ANSI escape — degrades gracefully on terminals without colour support
  return `\x1b[${code}m${s}\x1b[0m`;
}
const bold = (s) => colour('1', s);
const dim = (s) => colour('2', s);
const green = (s) => colour('32', s);
const amber = (s) => colour('33', s);
const red = (s) => colour('31', s);
const cyan = (s) => colour('36', s);

// ---------------------------------------------------------------------------
// Format validation (cheap — no network call)
// ---------------------------------------------------------------------------
function validateFormat(value, format) {
  if (!format) return { ok: true };
  if (format.prefix && !value.startsWith(format.prefix)) {
    return { ok: false, reason: `must start with "${format.prefix}"` };
  }
  if (format.min_length && value.length < format.min_length) {
    return { ok: false, reason: `must be at least ${format.min_length} characters` };
  }
  if (format.regex && !new RegExp(format.regex).test(value)) {
    return { ok: false, reason: `must match ${format.regex}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vendor-specific validation hooks (network calls — optional per credential)
// Each returns { ok: boolean, reason?: string, info?: object }
// ---------------------------------------------------------------------------
const VALIDATORS = {
  async anthropic(value) {
    // Lightweight ping: HEAD /v1/messages is rejected, so we POST a tiny
    // request and look for 200/4xx (auth-related) vs network failure.
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': value,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: `Anthropic rejected key (HTTP ${r.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async openai(value) {
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { authorization: `Bearer ${value}` },
      });
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: `OpenAI rejected key (HTTP ${r.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async openrouter(value) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { authorization: `Bearer ${value}` },
      });
      if (!r.ok) return { ok: false, reason: `OpenRouter rejected key (HTTP ${r.status})` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async resend(value) {
    try {
      const r = await fetch('https://api.resend.com/domains', {
        headers: { authorization: `Bearer ${value}` },
      });
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: `Resend rejected key (HTTP ${r.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async hunter(value) {
    try {
      const r = await fetch(`https://api.hunter.io/v2/account?api_key=${value}`);
      if (r.status === 401) return { ok: false, reason: 'Hunter rejected key (HTTP 401)' };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async apollo(value) {
    try {
      const r = await fetch('https://api.apollo.io/v1/auth/health', {
        headers: { 'X-Api-Key': value },
      });
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: `Apollo rejected key (HTTP ${r.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async brave(value) {
    try {
      const r = await fetch('https://api.search.brave.com/res/v1/web/search?q=test', {
        headers: { 'X-Subscription-Token': value, accept: 'application/json' },
      });
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: `Brave rejected key (HTTP ${r.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async elevenlabs(value) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': value },
      });
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: `ElevenLabs rejected key (HTTP ${r.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async supabase_url(value) {
    if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(value)) {
      return {
        ok: false,
        reason: 'expected https://<20-char-ref>.supabase.co',
      };
    }
    return { ok: true };
  },

  async slack_user_token(value) {
    if (!value.startsWith('xoxp-')) {
      return { ok: false, reason: 'must start with xoxp- (user token, not bot)' };
    }
    try {
      const r = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { authorization: `Bearer ${value}` },
      });
      const j = await r.json();
      if (!j.ok) return { ok: false, reason: `Slack: ${j.error}` };
      return { ok: true, info: { team: j.team, user: j.user } };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },

  async discord_bot_token(value) {
    try {
      const r = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { authorization: `Bot ${value}` },
      });
      if (!r.ok) return { ok: false, reason: `Discord rejected token (HTTP ${r.status})` };
      const j = await r.json();
      return { ok: true, info: { username: j.username } };
    } catch (e) {
      return { ok: false, reason: `network: ${e.message}` };
    }
  },
};

// ---------------------------------------------------------------------------
// Post-actions (run after all credentials captured)
// Each receives the env object and may write additional keys back.
// ---------------------------------------------------------------------------
const POST_ACTIONS = {
  /**
   * Create the canonical ElevenLabs Conversational AI agent for this
   * product (per VOICE AI STANDARD RULE — programmatic provisioning, no
   * "go to the dashboard" steps). Writes the resulting agent_id to the
   * env var named in action.agent_env.
   *
   * The product's setup-manifest.json provides the agent config
   * (system prompt, voice_id, first_message) under
   * post_actions[].config.
   */
  async create_elevenlabs_agent(env, action) {
    const apiKey = env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.log(amber('  ⚠ ELEVENLABS_API_KEY not set — skipping agent provisioning'));
      return env;
    }
    if (env[action.agent_env]) {
      console.log(dim(`  · ${action.agent_env} already set — skipping (existing agent kept)`));
      return env;
    }

    const config = action.config ?? {};
    const payload = {
      name: config.name ?? `${action.product_name ?? 'Portfolio'} Agent`,
      conversation_config: {
        agent: {
          prompt: { prompt: config.system_prompt ?? 'You are a helpful assistant.' },
          first_message:
            config.first_message ?? `Hey, how can I help with ${action.product_name ?? 'this'}?`,
          language: config.language ?? 'en',
        },
        tts: {
          voice_id: config.voice_id ?? '21m00Tcm4TlvDq8ikWAM', // ElevenLabs default 'Rachel'
        },
      },
    };

    try {
      const r = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        console.log(red(`  ✗ ElevenLabs agent create failed: HTTP ${r.status} — ${t.slice(0, 200)}`));
        return env;
      }
      const j = await r.json();
      const agentId = j.agent_id ?? j.id;
      if (!agentId) {
        console.log(red('  ✗ ElevenLabs agent create returned no agent_id'));
        return env;
      }
      console.log(green(`  ✓ Created ElevenLabs agent — ${action.agent_env} = ${agentId}`));
      return { ...env, [action.agent_env]: agentId };
    } catch (e) {
      console.log(red(`  ✗ ElevenLabs agent create error: ${e.message}`));
      return env;
    }
  },
};

// ---------------------------------------------------------------------------
// .env.local read/write
// ---------------------------------------------------------------------------
async function readExistingEnv(envPath) {
  try {
    const raw = await fs.readFile(envPath, 'utf-8');
    const out = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

async function writeEnv(envPath, env, manifest) {
  const order = manifest.credentials.map((c) => c.key);
  // Preserve any extra keys already in .env.local that aren't in the manifest
  const extras = Object.keys(env).filter((k) => !order.includes(k));
  const allKeys = [...order, ...extras];
  const lines = [
    `# Generated by setup-product-credentials.mjs on ${new Date().toISOString()}`,
    `# Product: ${manifest.product_name}`,
    '',
  ];
  for (const k of allKeys) {
    const v = env[k] ?? '';
    lines.push(`${k}=${v}`);
  }
  await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('');
  console.log(bold(cyan('Portfolio product — credentials setup')));
  console.log('');

  const repoRoot = process.cwd();
  const manifestPath = path.join(repoRoot, 'setup-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  } catch (e) {
    console.error(red(`No setup-manifest.json in ${repoRoot}`));
    console.error(dim('  Each portfolio product owns its own manifest at the repo root.'));
    console.error(dim('  See cais-shared-services/scripts/setup-manifest.example.json for the schema.'));
    process.exit(1);
  }

  console.log(`Product: ${bold(manifest.product_name)}`);
  console.log(
    dim(
      `${manifest.credentials.length} credential${
        manifest.credentials.length === 1 ? '' : 's'
      } to capture. Existing values in .env.local are preserved unless you overwrite.`
    )
  );
  console.log('');

  const envPath = path.join(repoRoot, '.env.local');
  const env = await readExistingEnv(envPath);

  let captured = 0;
  let skipped = 0;
  let failed = 0;

  for (const cred of manifest.credentials) {
    console.log(bold(`[${cred.vendor}] ${cred.key}`));
    if (cred.description) console.log(`  ${dim(cred.description)}`);
    if (cred.signup_url) console.log(`  Sign up / find key: ${cyan(cred.signup_url)}`);

    const existing = env[cred.key];
    if (existing) {
      console.log(`  ${dim(`current value: ${mask(existing)}`)}`);
      const keep = await ask(`  Keep existing? [Y/n]: `);
      if (keep.toLowerCase() !== 'n') {
        console.log(green('  ✓ kept'));
        console.log('');
        skipped++;
        continue;
      }
    }

    const alt = cred.alternative_to;
    if (alt && env[alt]) {
      console.log(dim(`  Alternative ${alt} already set — skipping.`));
      console.log('');
      skipped++;
      continue;
    }

    if (!cred.required && !existing) {
      const ans = await ask(`  Optional — skip? [y/N]: `);
      if (ans.toLowerCase() === 'y') {
        console.log(dim('  · skipped'));
        console.log('');
        skipped++;
        continue;
      }
    }

    while (true) {
      const value = await ask(`  Paste value: `);
      if (!value && !cred.required) {
        console.log(dim('  · left empty'));
        break;
      }
      if (!value) {
        console.log(red('  value required — try again'));
        continue;
      }

      const fmt = validateFormat(value, cred.format);
      if (!fmt.ok) {
        console.log(red(`  ✗ ${fmt.reason}`));
        continue;
      }

      let netCheck = { ok: true };
      if (cred.validate && VALIDATORS[cred.validate]) {
        process.stdout.write(dim('  validating with vendor... '));
        netCheck = await VALIDATORS[cred.validate](value);
        if (netCheck.ok) {
          process.stdout.write(green('ok'));
          if (netCheck.info) process.stdout.write(dim(` (${JSON.stringify(netCheck.info)})`));
          process.stdout.write('\n');
        } else {
          process.stdout.write(red(`failed: ${netCheck.reason}\n`));
          const retry = await ask('  Retry? [Y/n]: ');
          if (retry.toLowerCase() !== 'n') continue;
        }
      }

      env[cred.key] = value;
      console.log(green(`  ✓ captured ${mask(value)}`));
      captured++;
      if (!netCheck.ok) failed++;
      break;
    }
    console.log('');
  }

  // Persist before running post-actions so even partial-failure leaves
  // the captured credentials on disk
  await writeEnv(envPath, env, manifest);
  console.log(green(`Wrote ${envPath}`));
  console.log('');

  // Post-actions (programmatic resource provisioning per VOICE AI rule etc.)
  if (manifest.post_actions?.length) {
    console.log(bold('Provisioning resources:'));
    for (const action of manifest.post_actions) {
      const handler = POST_ACTIONS[action.type];
      if (!handler) {
        console.log(amber(`  ⚠ unknown post-action: ${action.type} — skipping`));
        continue;
      }
      const next = await handler(env, { ...action, product_name: manifest.product_name });
      Object.assign(env, next);
    }
    await writeEnv(envPath, env, manifest);
    console.log(green('Re-wrote .env.local with provisioned resource IDs'));
    console.log('');
  }

  console.log(bold('Summary'));
  console.log(`  captured: ${green(captured)}`);
  console.log(`  kept existing / skipped: ${dim(skipped)}`);
  if (failed) console.log(`  validation failures (saved anyway): ${red(failed)}`);
  console.log('');
  console.log(dim('Next: review .env.local, then run your product\'s dev / deploy command.'));
  rl.close();
}

main().catch((e) => {
  console.error(red(`FAILED: ${e.message}`));
  rl.close();
  process.exit(1);
});
