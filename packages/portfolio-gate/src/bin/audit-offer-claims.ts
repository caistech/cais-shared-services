#!/usr/bin/env node
/**
 * portfolio-gate-audit-offer-claims — does the page state a price and a trial length the product
 * actually charges and grants?
 *
 * Usage:
 *   portfolio-gate-audit-offer-claims [--config offer-claims.config.json] [--json]
 *
 * Born from one pricing page that, in a single week, promised "free for 1 month" in a FAQ,
 * "free for 1 month" on a plan badge, "card required at sign-up" beside every button, and a
 * "60-day free trial" through the assistant — while the product granted 14 days, took no card at
 * sign-up, and had no one-month offer anywhere in Stripe.
 *
 * Every other audit here asks "did a change break something?". This asks the opposite question:
 * has the truth moved while the copy stood still? That defect never appears in a diff, which is
 * why review after review walks past it.
 *
 * SKIPS with no `offer-claims.config.json`. FAILS when a config is present but matches no files —
 * an assertion that has stopped looking at anything must not read as green.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runOfferClaimsAudit } from '../audit/offer-claims.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseAuditArgs(argv)
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-offer-claims',
      rule: 'offer-claims-match-reality',
      description:
        'Fails when a displayed price or free-trial length contradicts what the product actually ' +
        'charges and grants. The config declares the truth; Stripe verifies the config, so a ' +
        'stale declaration cannot quietly become the new authority',
      configFile: 'offer-claims.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runOfferClaimsAudit({
      cwd: args.rootDir ?? undefined,
      configPath: args.configPath,
    })
    process.stdout.write(
      args.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatAuditResult(result)}\n`,
    )
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
