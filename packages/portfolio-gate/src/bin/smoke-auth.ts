#!/usr/bin/env node
/**
 * portfolio-gate-smoke-auth — CLI wrapper for the auth smoke test.
 *
 * Usage:
 *   portfolio-gate-smoke-auth --config auth.config.json
 *   portfolio-gate-smoke-auth --config auth.config.ts --base-url https://preview.example.com
 *   portfolio-gate-smoke-auth --config auth.config.json --json
 *
 * Exit codes:
 *   0 — all four legs (login, signup, forgot-password, magic-link) responded acceptably
 *   1 — one or more failures
 *   2 — config / argument error
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  runAuthSmoke,
  loadAuthConfigJson,
  formatAuthResult,
  type AuthSmokeConfig,
} from '../smoke/auth.js'

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
      'portfolio-gate-smoke-auth — four-leg auth smoke test (Portfolio Standard R1/R4)',
      '',
      'Usage:',
      '  portfolio-gate-smoke-auth --config <path> [--base-url <url>] [--json]',
      '',
      'Flags:',
      '  --config, -c <path>   Path to auth.config.json or auth.config.ts',
      '  --base-url <url>      Override config.baseUrl (e.g. preview URL from CI)',
      '  --json                Emit JSON result instead of human-readable text',
      '  --help, -h            Show this help',
      '',
      'Exit codes: 0 pass, 1 fail, 2 config error.',
      '',
    ].join('\n')
  )
}

async function loadConfig(configPath: string): Promise<AuthSmokeConfig> {
  const absolute = resolve(process.cwd(), configPath)
  if (absolute.endsWith('.json')) {
    return loadAuthConfigJson(absolute)
  }
  const mod = (await import(pathToFileURL(absolute).href)) as {
    default?: AuthSmokeConfig
    config?: AuthSmokeConfig
  }
  const config = mod.default ?? mod.config
  if (!config) {
    throw new Error(
      `auth config at ${configPath} must export a default or named 'config' object`
    )
  }
  return config
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

  let config: AuthSmokeConfig
  try {
    config = await loadConfig(args.configPath)
  } catch (err) {
    process.stderr.write(
      `error: failed to load config at ${args.configPath}: ${err instanceof Error ? err.message : String(err)}\n`
    )
    process.exit(2)
  }

  if (args.baseUrlOverride) {
    config = { ...config, baseUrl: args.baseUrlOverride }
  }

  const result = await runAuthSmoke(config)
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatAuthResult(result)}\n`)
  }
  process.exit(result.passed ? 0 : 1)
}

main().catch((err: unknown) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(2)
})
