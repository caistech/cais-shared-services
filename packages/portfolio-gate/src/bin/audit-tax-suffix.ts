#!/usr/bin/env node
/**
 * portfolio-gate-audit-tax-suffix — does every displayed PRICE say what tax applies, exactly once?
 *
 * Usage:
 *   portfolio-gate-audit-tax-suffix --base-url https://example.com [--json]
 *
 * Checks every page marked `@public-route` for two things, and deliberately only two:
 *   - a DOUBLED qualifier ("$999 + GST + GST"), which is always wrong whatever the number is
 *   - a RECURRING price with no qualifier anywhere near it ("$999/month")
 *
 * A bare amount with no period is ignored on purpose: a valuation is not a price, and demanding
 * "+ GST" on what a business is worth is the false positive that gets a check switched off.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runTaxSuffixAudit } from '../audit/tax-suffix.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1]
  const inline = argv.find((a) => a.startsWith(`${name}=`))
  return inline ? inline.slice(name.length + 1) : undefined
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseAuditArgs(argv)
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-tax-suffix',
      rule: 'tax-qualifier',
      description:
        'Fails on a price rendered with its tax qualifier twice, or on a recurring price with no ' +
        'qualifier at all. Ignores bare amounts, because a valuation is not a price',
      configFile: '(none — the marker lives in the page file)',
    })
    process.exit(0)
  }

  const baseUrl =
    flagValue(argv, '--base-url') ??
    process.env.PORTFOLIO_GATE_PREVIEW_URL ??
    process.env.PUBLIC_ALIAS

  try {
    const result = await runTaxSuffixAudit({ rootDir: args.rootDir ?? undefined, baseUrl })
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    else process.stdout.write(`${formatAuditResult(result)}\n`)
    process.exit(result.passed ? 0 : 1)
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(2)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
})
