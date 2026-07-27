#!/usr/bin/env node
/**
 * portfolio-gate-memory-loop — run the voice memory-loop probe against a deployed app.
 *
 * Add this to the shared gate workflow in EVERY repo. It skips cleanly (exit 0) where there is no
 * voice package, so it costs nothing in repos that don't have one — and it means a repo that DOES
 * have one can never again ship a silently-dead memory loop because nobody remembered to check.
 *
 * Usage:
 *   portfolio-gate-memory-loop --base-url https://app.example.com
 *   portfolio-gate-memory-loop --config memory-loop.config.json
 *   portfolio-gate-memory-loop --base-url ... --no-continuity   # only if there's no start route
 *   portfolio-gate-memory-loop --base-url ... --distil          # also assert transcript → distil
 *
 * `./memory-loop.config.json` is read automatically when --config is omitted, so a repo's recorded
 * `memoryLoop: false` opt-out cannot be bypassed by forgetting the flag.
 *
 * Environment:
 *   MEMORY_LOOP_APP_URL | PORTFOLIO_GATE_PREVIEW_URL   the app origin (or --base-url)
 *   MEMORY_LOOP_UID | QA_TEST_USER_ID                  a real test user's id
 *   CONVAI_TOOL_SECRET | KIRA_TOOL_WEBHOOK_SECRET      tool-webhook secret, if the routes are guarded
 *   ELEVENLABS_WEBHOOK_SECRET                          required by --distil (signs the payload)
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   for sentinel cleanup (optional)
 *
 * Exit codes:
 *   0 — passed, or not applicable to this repo
 *   1 — the loop is broken (or is unverifiable because config is missing)
 *   2 — argument / config error
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  runMemoryLoopGate,
  formatMemoryLoopResult,
  type MemoryLoopConfig,
} from '../smoke/memory-loop.js'

function parseArgs(argv: string[]) {
  const args = {
    configPath: null as string | null,
    baseUrl: null as string | null,
    continuity: true,
    distil: false,
    json: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--config') args.configPath = argv[++i] ?? null
    else if (a === '--base-url') args.baseUrl = argv[++i] ?? null
    else if (a === '--no-continuity') args.continuity = false
    else if (a === '--distil') args.distil = true
    else if (a === '--json') args.json = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(
      'portfolio-gate-memory-loop [--config <file>] [--base-url <url>] [--no-continuity] [--distil] [--json]',
    )
    process.exit(0)
  }

  // AUTO-DISCOVER ./memory-loop.config.json when --config is not given.
  //
  // The file holds `memoryLoop: false` — the one recorded opt-out for a product whose voice agent
  // legitimately has no cross-session memory loop to probe. Reading it only on an explicit --config
  // meant a bare `--base-url` run ignored the opt-out entirely and probed a product that had already
  // declared, on the record, that there was nothing there. SayFix was run three times that way and
  // failed correctly each time. An opt-out that depends on the caller remembering to point at it is
  // not an opt-out.
  const DEFAULT_CONFIG = 'memory-loop.config.json'
  let config: MemoryLoopConfig = {}
  const explicit = args.configPath !== null
  const configPath = args.configPath ?? DEFAULT_CONFIG
  try {
    config = JSON.parse(readFileSync(resolve(process.cwd(), configPath), 'utf8'))
    console.log(`memory-loop: using ${configPath}`)
  } catch (err) {
    // An explicitly-named config that cannot be read is an argument error. A missing DEFAULT one is
    // not — plenty of repos are configured entirely by flags and env.
    if (explicit) {
      console.error(`config error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(2)
    }
  }
  if (args.baseUrl) config.baseUrl = args.baseUrl
  if (!args.continuity) config.expectContinuity = false
  if (args.distil) config.expectDistil = true

  const result = await runMemoryLoopGate(config)

  if (args.json) console.log(JSON.stringify(result, null, 2))
  else console.log(formatMemoryLoopResult(result))

  // 'skipped' exits 0 — a repo without a voice agent is not a failing repo.
  process.exit(result.outcome === 'fail' ? 1 : 0)
}

main().catch((err) => {
  console.error(`memory-loop gate crashed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
