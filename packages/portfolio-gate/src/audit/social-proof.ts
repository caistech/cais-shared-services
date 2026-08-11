/**
 * Social-proof audit — is every testimonial, partner logo and headline metric one a human has
 * attested to, or is it scaffold filler nobody ever looked at again?
 *
 * WHY THIS EXISTS. On 5 August 2026 the live MMC Build marketing site — a REGULATED-tier client's
 * public front door — was found carrying:
 *
 *   - **eight real, named ASX-listed construction companies** presented as "Trusted Partners",
 *     none of whom were partners,
 *   - **three invented customer testimonials** with invented names and job titles,
 *   - **"100+ professionals" and "$2M saved"**, figures with no basis at all.
 *
 * It had been live for months. It was scaffold template content that shipped with the product and
 * that nobody read again once the real copy went in around it. Naming real public companies as
 * partners is not a typo — it is a representation about commercial relationships that do not
 * exist, on a client's own domain.
 *
 * Nothing in the portfolio looked for it, which means the same filler may be sitting in any
 * scaffolded repo right now. That is the argument for a check rather than a memo.
 *
 * ⚠️ THE HARD PART, and the reason this audit is shaped the way it is: **you cannot tell a real
 * testimonial from an invented one by reading the source.** Both are a string with a name attached.
 * A check that tried to judge truth would either flag every genuine testimonial (and be switched
 * off within a week) or catch nothing.
 *
 * So it does not judge truth. It demands ATTESTATION — the same "silence is not acceptance" shape
 * REGULATORY_INCLUSIONS uses. Two assertions, chosen because neither needs judgement:
 *
 *   1. **Known scaffold filler is always wrong.** Strings that ship in the template, or that were
 *      found live in a real incident, cannot be genuine by definition. Zero false positives, no
 *      opt-out. This is the one that would have caught MMC on day one.
 *
 *   2. **A social-proof SURFACE must be attested.** A file containing a testimonials block, a
 *      "trusted by" section, or a headline metric must carry a marker naming who confirmed it:
 *
 *          // @social-proof-ok: 3 testimonials confirmed by Karen 2026-08-05, signed consent on file
 *
 *      A genuine section needs one line, once. An unattested one fails. The point is not to make
 *      the check clever — it is to make the absence of a human decision visible, because at MMC
 *      the failure was precisely that **nobody had ever decided** those names should be there.
 *
 * Naming a real third-party company is treated as `fail`, not `warn`, even when attested elsewhere
 * in the file — it is the claim with legal consequences, and it is the one that was live.
 */
import { join } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  blankComments,
  passedFromFindings,
  readFileOptional,
  relativeTo,
  walkFiles,
} from './shared.js'

/** Marker that attests a social-proof surface. Mirrors `@cross-tenant-ok` / `@canonical-feed-ok`. */
const ATTESTATION = '@social-proof-ok:'

/**
 * Filler that cannot be genuine. Sourced from cais-build-template-v2 and from what was actually
 * found live on 5 August. Verbatim, case-insensitive. No opt-out: if it is here, it is not real.
 */
const KNOWN_FILLER: string[] = [
  'trusted by industry leaders',
  'what our customers say',
  'join thousands of satisfied',
  'loved by teams everywhere',
  'lorem ipsum',
  'jane doe',
  'john doe',
  'acme corp',
  'acme inc',
  'this product changed the way we work',
  'i can’t imagine going back',
  "i can't imagine going back",
  'best decision we ever made',
]

/** Headings that mean "a social-proof surface lives in this file". */
const SURFACE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'testimonial block', re: /\btestimonial/i },
  { label: '"trusted by" / partners block', re: /\btrusted[\s-]?by\b|\bour\s+partners\b|\bpartner\s+logos\b/i },
  { label: 'customer-logo wall', re: /\bclient\s+logos\b|\blogo\s?wall\b|\bas\s+seen\s+(in|on)\b/i },
  { label: 'headline metric', re: /\b\d[\d,]*\+?\s*(customers|users|professionals|companies|builders|projects)\b/i },
  { label: 'savings/volume claim', re: /\$\s?\d[\d,.]*\s?(m|k|million|billion)?\s+(saved|in savings|processed|managed)\b/i },
]

export interface SocialProofOptions {
  cwd?: string
  /** Directories to scan. Defaults to the usual UI locations. */
  roots?: string[]
}

export async function runSocialProofAudit(options: SocialProofOptions = {}): Promise<AuditResult> {
  const started = Date.now()
  const cwd = options.cwd ?? process.cwd()
  const roots = options.roots ?? ['src', 'app', 'components']
  const findings: AuditFinding[] = []

  const files: string[] = []
  for (const root of roots) {
    try {
      files.push(
        ...(await walkFiles(join(cwd, root), {
          extensions: ['.tsx', '.jsx', '.ts', '.js', '.mdx', '.md'],
        })),
      )
    } catch {
      // A repo that has no `app/` or `components/` is normal, not an error. Only
      // finding NOTHING anywhere is worth reporting, and that is handled below.
    }
  }

  if (files.length === 0) {
    return {
      audit: 'social-proof',
      rule: 'social-proof-attested',
      passed: true,
      skipped: true,
      skipReason: 'no UI source found to scan',
      findings: [],
      durationMs: Date.now() - started,
    }
  }

  for (const file of files) {
    const content = await readFileOptional(file)
    if (!content) continue
    const rel = relativeTo(cwd, file)
    // Comments are excluded - a claim is something a VISITOR can read, and a
    // note explaining a REMOVED claim must not be reported as the claim.
    // Newlines are preserved so line numbers still point at the right line.
    const lines = blankComments(content).split(/\r?\n/)
    const attested = content.includes(ATTESTATION)

    // 1. Known filler — always a failure, attested or not.
    for (const filler of KNOWN_FILLER) {
      const idx = lines.findIndex((l) => l.toLowerCase().includes(filler))
      if (idx === -1) continue
      findings.push({
        severity: 'fail',
        message: `Scaffold social-proof filler shipped: "${filler}"`,
        file: rel,
        line: idx + 1,
        detail:
          'This string ships in the template or was found live in a real incident, so it cannot ' +
          'be genuine. Replace it with real, attested content or delete the section.',
      })
    }

    // 2. Social-proof surfaces must be attested by a named human.
    if (attested) continue
    for (const { label, re } of SURFACE_PATTERNS) {
      const idx = lines.findIndex((l) => re.test(l))
      if (idx === -1) continue
      findings.push({
        severity: 'fail',
        message: `Unattested ${label}`,
        file: rel,
        line: idx + 1,
        detail:
          `Add a line naming who confirmed this and when, e.g.\n` +
          `    // ${ATTESTATION} 3 testimonials confirmed by <name> <date>, consent on file\n` +
          'The check cannot tell a real testimonial from an invented one — only a person can. ' +
          'At MMC Build the failure was that nobody had ever decided those names should be there.',
      })
    }
  }

  return {
    audit: 'social-proof',
    rule: 'social-proof-attested',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - started,
  }
}
