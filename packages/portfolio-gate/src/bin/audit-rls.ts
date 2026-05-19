#!/usr/bin/env node
/**
 * portfolio-gate-audit-rls — CLI wrapper for the RLS audit (R9).
 *
 * Usage:
 *   portfolio-gate-audit-rls [--config rls.config.json] [--root .] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runRlsAudit } from '../audit/rls.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-rls',
      rule: 'R9',
      description: 'RLS audit — fails on USING (true) on data-bearing tables',
      configFile: 'rls.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runRlsAudit({
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
