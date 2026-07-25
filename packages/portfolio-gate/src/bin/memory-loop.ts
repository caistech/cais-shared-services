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
 *
 * Environment:
 *   MEMORY_LOOP_APP_URL | PORTFOLIO_GATE_PREVIEW_URL   the app origin (or --base-url)
 *   MEMORY_LOOP_UID | QA_TEST_USER_ID                  a real test user's id
 *   CONVAI_TOOL_SECRET | KIRA_TOOL_WEBHOOK_SECRET      tool-webhook secret, if the routes are guarded
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
    json: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--config') args.configPath = argv[++i] ?? null
    else if (a === '--base-url') args.baseUrl = argv[++i] ?? null
    else if (a === '--no-continuity') args.continuity = false
    else if (a === '--json') args.json = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(
      'portfolio-gate-memory-loop [--config <file>] [--base-url <url>] [--no-continuity] [--json]',
    )
    process.exit(0)
  }

  let config: MemoryLoopConfig = {}
  if (args.configPath) {
    try {
      config = JSON.parse(readFileSync(resolve(process.cwd(), args.configPath), 'utf8'))
    } catch (err) {
      console.error(`config error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(2)
    }
  }
  if (args.baseUrl) config.baseUrl = args.baseUrl
  if (!args.continuity) config.expectContinuity = false

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
