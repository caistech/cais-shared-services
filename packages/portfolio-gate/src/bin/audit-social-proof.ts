#!/usr/bin/env node
/**
 * portfolio-gate-audit-social-proof — is every testimonial, partner logo and headline metric one a
 * human has attested to?
 *
 * Usage:
 *   portfolio-gate-audit-social-proof [--root .] [--json]
 *
 * A REGULATED-tier client's live site carried eight real ASX-listed builders as "Trusted Partners",
 * three invented testimonials, and "100+ professionals / $2M saved" — scaffold filler that had been
 * public for months because nobody read it again after the real copy went in around it.
 *
 * The audit does NOT judge whether a testimonial is true; that cannot be read from source. It fails
 * known scaffold filler outright, and requires any social-proof surface to carry
 *
 *     // @social-proof-ok: <who confirmed it, when>
 *
 * because the actual failure was that nobody had ever decided those names should be there.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runSocialProofAudit } from '../audit/social-proof.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseAuditArgs(argv)
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-social-proof',
      rule: 'social-proof-attested',
      description:
        'Fails scaffold testimonial/partner filler outright, and fails any testimonials, ' +
        '"trusted by" block or headline metric that carries no @social-proof-ok attestation ' +
        'naming who confirmed it',
      configFile: '(none — the attestation lives beside the content)',
    })
    process.exit(0)
  }

  try {
    const result = await runSocialProofAudit({ cwd: args.rootDir ?? undefined })
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
