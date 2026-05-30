#!/usr/bin/env node
/**
 * portfolio-gate-smoke-session — Authenticated route smoke test.
 *
 * Usage:
 *   portfolio-gate-smoke-session --config session.config.json
 *   portfolio-gate-smoke-session --config session.config.json --base-url https://preview.com
 */

import { resolve } from 'node:path'
import {
  runAuthSessionSmoke,
  loadSessionConfigJson,
  formatSessionResult,
} from '../smoke/session.js'

interface CliArgs {
  configPath: string | null
  baseUrlOverride: string | null
  json: boolean
  help: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    configPath: null,
    baseUrlOverride: null,
    json: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--config' || a === '-c') {
      args.configPath = argv[++i] ?? null
    } else if (a === '--base-url') {
      args.baseUrlOverride = argv[++i] ?? null
    } else if (a === '--json') {
      args.json = true
    } else if (a === '--help' || a === '-h') {
      args.help = true
    }
  }
  return args
}

function printHelp(): void {
  process.stdout.write(
    [
      'portfolio-gate-smoke-session — authenticated route smoke test',
      '',
      'Usage:',
      '  portfolio-gate-smoke-session --config <path> [--base-url <url>] [--json]',
      '',
      'Flags:',
      '  --config, -c <path>   Path to session.config.json',
      '  --base-url <url>      Override config.baseUrl',
      '  --json                Emit JSON result',
      '  --help, -h            Show this help',
      '',
      'Exit codes: 0 pass, 1 fail, 2 config error.',
      '',
    ].join('\n')
  )
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  if (!args.configPath) {
    process.stderr.write('error: --config <path> is required\n\n')
    printHelp()
    process.exit(2)
  }

  let config
  try {
    config = await loadSessionConfigJson(resolve(process.cwd(), args.configPath))
  } catch (err) {
    process.stderr.write(`error: failed to load config: ${err}\n`)
    process.exit(2)
  }

  if (args.baseUrlOverride) {
    config = { ...config, baseUrl: args.baseUrlOverride }
  }

  const result = await runAuthSessionSmoke(config)

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatSessionResult(result)}\n`)
  }

  process.exit(result.passed ? 0 : 1)
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err}\n`)
  process.exit(2)
})
