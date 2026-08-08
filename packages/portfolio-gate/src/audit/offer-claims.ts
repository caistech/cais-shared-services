/**
 * Offer-claims audit — does every price and trial length the site STATES agree with what the
 * product actually charges and grants?
 *
 * WHY THIS EXISTS. In one week, one pricing page on a REGULATED-tier client's live site carried:
 * a FAQ promising "the Essential plan free for 1 month", a plan badge promising "free for 1
 * month", a call-to-action claiming "card required at sign-up" when none is taken, and an
 * assistant that told anyone who asked about billing they were on a "60-day free trial". The
 * truth was 14 days, no card, every plan. Two of those had been live for months.
 *
 * ⚠️ THE REASON NOTHING CAUGHT IT is the whole design brief, and it is not carelessness. Every
 * other check in this package answers *"did a change break something?"* — they compare against a
 * previous state, a deployed SHA, a sibling repo. **This is the opposite defect: text that has sat
 * unchanged for months while the truth moved underneath it.** It never appears in a diff, so it is
 * never re-read, so a hundred careful reviews of that page sail past it. The fabricated social
 * proof on the same page survived for exactly the same reason.
 *
 * TWO DECISIONS CARRY THIS CHECK, and the obvious implementation gets both wrong.
 *
 * 1. **The config declares the truth and STRIPE VERIFIES THE CONFIG.** A check that compares the
 *    page against a hand-written JSON file has not verified anything — it has moved the lie into a
 *    second file that nobody re-reads either, and it will read green forever once that file goes
 *    stale. So when `verifyAgainstStripe` is set, the declared prices are checked against the live
 *    Stripe Price objects, and a config that disagrees with Stripe FAILS. The authority is the
 *    money, not the JSON.
 *
 * 2. **Comments are excluded from the scan.** This is not tidiness — it is earned. The
 *    social-proof audit matches raw lines, and the first attempt at a comment explaining a removed
 *    filler string *quoted the string*, so the check failed on its own explanation. Here the same
 *    shape would be worse: the honest way to remove a false claim is to leave a note saying what it
 *    used to be and why it went, and a checker that punished that would teach people to delete the
 *    explanation instead. A claim is something a VISITOR can read.
 *
 * WHAT IT DOES NOT DO. It cannot tell whether a price is a good idea, whether "normally $99" is
 * substantiated, or whether two sites *should* offer the same thing. It answers one question —
 * does the number on the page match the number in the system — and leaves judgement to people.
 *
 * SKIPS with no config: a product with no prices has nothing to assert. But a config whose
 * surfaces match NO files FAILS, because an assertion that has quietly stopped looking at anything
 * is indistinguishable from one that passes.
 */
import { join } from 'node:path'
import {
  loadConfigOptional,
  passedFromFindings,
  readFileOptional,
  relativeTo,
  walkFiles,
  type AuditFinding,
  type AuditResult,
} from './shared.js'

/** Marker attesting a line that legitimately states a figure outside the declared set. */
const ATTESTATION = '@offer-claim-ok:'

export interface DeclaredPrice {
  /** Human name, used only in failure messages. */
  plan: string
  /** Whole currency units, as displayed (49, not 4900). */
  amount: number
  currency?: string
  interval?: 'month' | 'year' | 'one-off'
  /** Stripe Price id. Required when verifyAgainstStripe is on — that is the point. */
  stripePriceId?: string
}

export interface OfferClaimsConfig {
  authority: {
    /** Free-trial length in days, as actually granted. */
    trialDays: number
    prices: DeclaredPrice[]
  }
  /** Directories to scan, relative to cwd. Defaults to the usual UI roots. */
  roots?: string[]
  /**
   * Verify the DECLARED prices against live Stripe. Requires a secret key in env.
   * When true and the key is absent this FAILS rather than skipping — a verification
   * that silently did not happen is the failure this whole check exists to end.
   */
  verifyAgainstStripe?: boolean
  /** Env var holding the Stripe secret key. Default STRIPE_SECRET_KEY. */
  stripeKeyEnv?: string
}

/** Words that make a nearby number a claim ABOUT THE OFFER rather than an arbitrary figure. */
const OFFER_CONTEXT = /\btrial\b|\bfree\b|\bat no cost\b/i

/** "14 days", "14-day", "1 month", "12 months". */
const DURATION = /(\d+)[\s-]*(day|days|month|months)\b/gi
/** Word-form durations that carry the same promise and dodge a digit-based regex entirely. */
const WORD_DURATION = /\b(a|one)[\s-](month|fortnight|week)\b/gi
/** A displayed price: $49, $1,910, $ 99. */
const MONEY = /\$\s?(\d[\d,]*)(?:\.(\d{2}))?/g

/**
 * A money figure is only a PRICE CLAIM where the surrounding text is selling something.
 *
 * ⚠️ Without this the check is unusable, and the first real run proved it: a product page
 * illustrating a saving on a build ("$485,000" vs "$445,000") produced two confident failures
 * about prices the product supposedly charges. Those are project costs in an example, not an
 * offer. A check that cries wolf on every dollar sign in the marketing copy gets switched off
 * within a week, and then it protects nothing at all.
 *
 * The window is the line plus two either side, because a price and its label are routinely on
 * different lines in JSX. The trade-off is stated rather than hidden: a bare figure with no
 * selling language anywhere near it is NOT flagged. That is the deliberate direction to err —
 * this check must never make noise it cannot justify.
 */
const PRICE_CONTEXT =
  /\bprice\b|\bpricing\b|\bplan\b|\btier\b|\bper (month|year|seat|user)\b|\/mo\b|\/month\b|\bmonthly\b|\bannual\b|\bbilled\b|\bsubscription\b|\bfrom \$|\bonly \$/i
const CONTEXT_WINDOW = 2

/**
 * Blank every comment in the file while KEEPING line numbers intact, so the check reads what a
 * VISITOR reads. See the header for why comments are excluded at all.
 *
 * ⚠️ This works on the WHOLE FILE, not line by line, and that is the entire point. The first
 * version stripped per line and therefore could not see a MULTI-LINE block — so a `{/* ... *\/}`
 * comment explaining why a false figure had been removed was itself reported as a false figure.
 * That happened four times in one day across this check and its sibling, always to the person
 * doing the right thing and writing down why. A checker that punishes the explanation teaches
 * people to delete the explanation.
 *
 * Newlines inside a stripped block are preserved so every reported line number still points at the
 * line a human would open.
 */
function blankComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

function daysFromWord(unit: string): number {
  const u = unit.toLowerCase()
  if (u.startsWith('week')) return 7
  if (u.startsWith('fortnight')) return 14
  return 30 // "a month" — approximate on purpose; see the comparison below
}

export async function runOfferClaimsAudit(
  options: { cwd?: string; configPath?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<AuditResult> {
  const started = Date.now()
  const cwd = options.cwd ?? process.cwd()
  const config = await loadConfigOptional<OfferClaimsConfig>(
    options.configPath ?? join(cwd, 'offer-claims.config.json'),
  )

  if (!config) {
    return {
      audit: 'offer-claims',
      rule: 'offer-claims-match-reality',
      passed: true,
      skipped: true,
      skipReason: 'no offer-claims.config.json — a product with no stated prices has nothing to assert',
      findings: [],
      durationMs: Date.now() - started,
    }
  }

  const findings: AuditFinding[] = []
  const trialDays = config.authority.trialDays
  const allowedAmounts = new Set(config.authority.prices.map((p) => p.amount))

  // 1. The config itself must be true. Otherwise this check just relocates the problem.
  if (config.verifyAgainstStripe) {
    const keyEnv = config.stripeKeyEnv ?? 'STRIPE_SECRET_KEY'
    const key = process.env[keyEnv]
    if (!key) {
      findings.push({
        severity: 'fail',
        message: `verifyAgainstStripe is on but ${keyEnv} is not set`,
        detail:
          'Refusing to report a verdict that was not established. Set the key, or turn ' +
          'verifyAgainstStripe off and accept that the declared prices are unverified.',
      })
    } else {
      const doFetch = options.fetchImpl ?? fetch
      for (const price of config.authority.prices) {
        if (!price.stripePriceId) {
          findings.push({
            severity: 'fail',
            message: `"${price.plan}" has no stripePriceId, so its declared $${price.amount} cannot be verified`,
            detail: 'With verifyAgainstStripe on, every declared price needs an id to check against.',
          })
          continue
        }
        try {
          const res = await doFetch(`https://api.stripe.com/v1/prices/${price.stripePriceId}`, {
            headers: { Authorization: `Bearer ${key}` },
          })
          const body = (await res.json()) as {
            unit_amount?: number
            currency?: string
            active?: boolean
            error?: { message?: string }
          }
          if (!res.ok) {
            findings.push({
              severity: 'fail',
              message: `Stripe rejected ${price.stripePriceId} for "${price.plan}": ${body.error?.message ?? res.status}`,
            })
            continue
          }
          const live = typeof body.unit_amount === 'number' ? body.unit_amount / 100 : null
          if (live !== null && live !== price.amount) {
            findings.push({
              severity: 'fail',
              message: `"${price.plan}" is declared $${price.amount} but Stripe charges $${live}`,
              detail:
                'The config is wrong, not the page. Fix the config first — every page assertion ' +
                'below is measured against it.',
            })
          }
          if (body.active === false) {
            findings.push({
              severity: 'warn',
              message: `"${price.plan}" (${price.stripePriceId}) is archived in Stripe but still declared`,
            })
          }
        } catch (err) {
          findings.push({
            severity: 'warn',
            message: `could not reach Stripe for "${price.plan}" — declared price unverified`,
            detail: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  // 2. What the pages actually say.
  const roots = config.roots ?? ['src/app', 'src/components', 'src/lib', 'app', 'components']
  const files: string[] = []
  for (const root of roots) {
    try {
      files.push(
        ...(await walkFiles(join(cwd, root), {
          extensions: ['.tsx', '.jsx', '.ts', '.js', '.mdx', '.md'],
        })),
      )
    } catch {
      // A repo without one of the default roots is normal. Finding NOTHING is handled below.
    }
  }

  let surfacesScanned = 0
  for (const file of files) {
    const content = await readFileOptional(file)
    if (!content) continue
    surfacesScanned += 1
    const rel = relativeTo(cwd, file)
    // Comments are blanked across the WHOLE file first, so a multi-line block cannot leak a
    // figure into the scan. Line numbers are preserved by keeping the newlines.
    const lines = blankComments(content).split(/\r?\n/)
    const rawLines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i += 1) {
      if (rawLines[i].includes(ATTESTATION)) continue
      const line = lines[i]
      if (!line.trim()) continue

      // Duration claims, but only where the line is talking about the offer.
      if (OFFER_CONTEXT.test(line)) {
        for (const m of line.matchAll(DURATION)) {
          const n = Number(m[1])
          const unit = m[2].toLowerCase()
          const claimed = unit.startsWith('month') ? n * 30 : n
          if (claimed !== trialDays) {
            findings.push({
              severity: 'fail',
              message: `States a ${m[0]} free period; the product grants ${trialDays} days`,
              file: rel,
              line: i + 1,
              detail:
                `"${line.trim().slice(0, 120)}"\n` +
                `Change the copy, or if this figure is deliberately different add:\n` +
                `    // ${ATTESTATION} <why this number is right, who confirmed it, when>`,
            })
          }
        }
        for (const m of line.matchAll(WORD_DURATION)) {
          const claimed = daysFromWord(m[2])
          if (claimed !== trialDays) {
            findings.push({
              severity: 'fail',
              message: `States "${m[0]}" free; the product grants ${trialDays} days`,
              file: rel,
              line: i + 1,
              detail:
                `"${line.trim().slice(0, 120)}"\n` +
                'A word-form duration is still a promise. This is the form that dodges a ' +
                'digit-based grep, which is how "free for 1 month" survived a search for "14".',
            })
          }
        }
      }

      // Price claims — every displayed amount must be one the product actually charges.
      // Only where the surrounding lines are selling something; see PRICE_CONTEXT.
      const window = lines
        .slice(Math.max(0, i - CONTEXT_WINDOW), i + CONTEXT_WINDOW + 1)
        .join(' ')
      if (!PRICE_CONTEXT.test(window)) continue
      for (const m of line.matchAll(MONEY)) {
        const amount = Number(m[1].replace(/,/g, ''))
        if (!Number.isFinite(amount) || amount === 0) continue
        if (!allowedAmounts.has(amount)) {
          findings.push({
            severity: 'fail',
            message: `Displays $${m[1]}, which is not a price the product charges`,
            file: rel,
            line: i + 1,
            detail:
              `"${line.trim().slice(0, 120)}"\n` +
              'Declared prices: ' +
              config.authority.prices.map((p) => `${p.plan} $${p.amount}`).join(', ') +
              `\nA comparison or "was" price is the usual reason for this, and it needs saying ` +
              `out loud — a struck-through figure nobody ever charged is a representation about ` +
              `savings:\n    // ${ATTESTATION} <what this figure is, and what substantiates it>`,
          })
        }
      }
    }
  }

  if (surfacesScanned === 0) {
    findings.push({
      severity: 'fail',
      message: 'config present but no files were scanned — the roots match nothing',
      detail:
        'A stale config reads green forever. Point `roots` at the surfaces that state prices.',
    })
  }

  return {
    audit: 'offer-claims',
    rule: 'offer-claims-match-reality',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - started,
  }
}
