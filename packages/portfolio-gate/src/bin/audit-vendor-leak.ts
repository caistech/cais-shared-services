#!/usr/bin/env node
/**
 * portfolio-gate-audit-vendor-leak — CLI wrapper for the vendor-leak audit (R11).
 *
 * Usage:
 *   portfolio-gate-audit-vendor-leak [--config vendor-leak.config.json] [--root .] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runVendorLeakAudit } from '../audit/vendor-leak.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-vendor-leak',
      rule: 'R11',
      description: 'Vendor identity leak audit — greps for personal identifiers',
      configFile: 'vendor-leak.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runVendorLeakAudit({
      rootDir: args.rootDir ?? undefined,
      configPath: args.configPath,
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
