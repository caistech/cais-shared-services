#!/usr/bin/env node
/**
 * portfolio-gate-audit-explanatory-header — CLI wrapper for R3.
 *
 * Usage:
 *   portfolio-gate-audit-explanatory-header [--config explanatory-header.config.json] [--root .] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runExplanatoryHeaderAudit } from '../audit/explanatory-header.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-explanatory-header',
      rule: 'R3',
      description:
        'Explanatory header audit — every page.tsx needs <ExplanatoryHeader/> or `// @explanatory-header-exempt`',
      configFile: 'explanatory-header.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runExplanatoryHeaderAudit({
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
