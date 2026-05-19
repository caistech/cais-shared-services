#!/usr/bin/env node
/**
 * portfolio-gate-smoke-routes — CLI wrapper for the route smoke test.
 *
 * Usage:
 *   portfolio-gate-smoke-routes --config routes.config.json
 *   portfolio-gate-smoke-routes --config routes.config.ts --base-url https://preview.example.com
 *   portfolio-gate-smoke-routes --config routes.config.json --json
 *
 * Exit codes:
 *   0 — all routes returned an acceptable status
 *   1 — one or more failures
 *   2 — config / argument error
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  runRouteSmoke,
  loadRoutesConfigJson,
  formatRouteResult,
  type RouteSmokeConfig,
} from '../smoke/routes.js'

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
      'portfolio-gate-smoke-routes — route smoke test (Portfolio Standard R13)',
      '',
      'Usage:',
      '  portfolio-gate-smoke-routes --config <path> [--base-url <url>] [--json]',
      '',
      'Flags:',
      '  --config, -c <path>   Path to routes.config.json or routes.config.ts',
      '  --base-url <url>      Override config.baseUrl (e.g. preview URL from CI)',
      '  --json                Emit JSON result instead of human-readable text',
      '  --help, -h            Show this help',
      '',
      'Exit codes: 0 pass, 1 fail, 2 config error.',
      '',
    ].join('\n')
  )
}

async function loadConfig(configPath: string): Promise<RouteSmokeConfig> {
  const absolute = resolve(process.cwd(), configPath)
  if (absolute.endsWith('.json')) {
    return loadRoutesConfigJson(absolute)
  }
  // TS / JS / MJS — load via dynamic import so the consumer's build pipeline
  // resolves the module. Expect a default export OR a named `config` export.
  const mod = (await import(pathToFileURL(absolute).href)) as {
    default?: RouteSmokeConfig
    config?: RouteSmokeConfig
  }
  const config = mod.default ?? mod.config
  if (!config) {
    throw new Error(
      `routes config at ${configPath} must export a default or named 'config' object`
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

  let config: RouteSmokeConfig
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

  const result = await runRouteSmoke(config)
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatRouteResult(result)}\n`)
  }
  process.exit(result.passed ? 0 : 1)
}

main().catch((err: unknown) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(2)
})
