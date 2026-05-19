#!/usr/bin/env node
/**
 * portfolio-gate-audit-responsive — CLI wrapper for the responsive-design rule.
 *
 * Usage:
 *   portfolio-gate-audit-responsive [--config responsive.config.json] [--base-url URL] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runResponsiveAudit } from '../audit/responsive.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-responsive',
      rule: 'responsive-design',
      description:
        'Responsive audit — Playwright at 375px + 1280px; flags horizontal scroll + tiny tap targets',
      configFile: 'responsive.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runResponsiveAudit({
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
