#!/usr/bin/env node
/**
 * portfolio-gate-audit-unauth-endpoints — CLI wrapper for the unauth-endpoint
 * audit (R12).
 *
 * Usage:
 *   portfolio-gate-audit-unauth-endpoints --base-url https://preview.example.com \
 *     [--config unauth-endpoints.config.json] [--root .] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runUnauthEndpointsAudit } from '../audit/unauth-endpoints.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-unauth-endpoints',
      rule: 'R12',
      description: 'Unauth endpoint audit — curls every /api/* anonymously',
      configFile: 'unauth-endpoints.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runUnauthEndpointsAudit({
      rootDir: args.rootDir ?? undefined,
      configPath: args.configPath,
      baseUrlOverride: args.baseUrlOverride,
    })
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      process.stdout.write(`${formatAuditResult(result)}\n`)
    }
    process.exit(result.passed ? 0 : 1)
  } catch (err) {
    process.stderr.write(
      `error: ${err instanceof Error ? err.message : String(err)}\n`
    )
    process.exit(2)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(2)
})
