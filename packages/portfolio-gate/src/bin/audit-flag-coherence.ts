#!/usr/bin/env node
/**
 * portfolio-gate-audit-flag-coherence — is the live site entirely in ONE mode, or half-flipped?
 *
 * Usage:
 *   portfolio-gate-audit-flag-coherence [--config flag-coherence.config.json] [--json]
 *
 * A feature flag can only switch the surfaces somebody remembered to wire to it, and there is no
 * error for the one they forgot. MMC Build opened for business by setting one variable: eight
 * surfaces changed, two did not, and the homepage hero went on offering a waitlist on a site that
 * had started selling — with a green build, a correct flag and 200 on every page.
 *
 * Detects which mode the live site is in and fails on anything from another mode still showing.
 * See src/audit/flag-coherence.ts for why it detects rather than being told.
 *
 * SKIPS with no `flag-coherence.config.json` — a product with no user-visible mode flags genuinely
 * has nothing to assert.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runFlagCoherenceAudit } from '../audit/flag-coherence.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseAuditArgs(argv)
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-flag-coherence',
      rule: 'flag-coherence',
      description:
        'Fails when the live site is half-flipped — copy from one mode of a feature flag still ' +
        'showing while the site is in another. Detects the active mode rather than being told it, ' +
        'so it needs no edit at flip time and catches a rollback as well as a flip',
      configFile: 'flag-coherence.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runFlagCoherenceAudit({
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
