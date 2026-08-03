/**
 * Tax-qualifier audit — does every displayed PRICE say what tax applies, exactly once?
 *
 * WHY THIS EXISTS. Two products, same week, opposite halves of one rule:
 *
 *   - Kira shipped `$999 + GST + GST` on its live payment page, three inches under the button
 *     that saves a card. `price()` already appended the suffix and two call sites appended it
 *     again. The tester's reaction is the reason this is not a typo: *"that's the sentence that
 *     tells me how carefully these people handle numbers."*
 *   - ExecutorAI's landing said "free" while its terms said A$149/yr, with three contradictory
 *     commercial models live at once.
 *
 * The portfolio rule (PRODUCT_STANDARDS §9) is that every displayed price carries its tax
 * qualifier — "+ GST" in AU, VAT in the UK/EU, GST/HST in Canada, sales tax in the US — derived
 * from the buyer's currency rather than hardcoded. It had been given verbally more than once and
 * kept being missed, which is precisely the argument for a check rather than another reminder.
 *
 * ⚠️ THE HARD PART, and the reason this is not "flag every dollar figure": a VALUATION IS NOT A
 * PRICE. Kira's whole product prints large currency amounts — what a business is worth, the gap,
 * the walk-away figure — and those must NOT carry a tax suffix. A naive check would demand "+ GST"
 * on "your business is worth $874,000", which is nonsense, and the fix for the noise would be to
 * switch the check off.
 *
 * So the audit asserts two things, and only two, both chosen because they cannot produce that
 * false positive:
 *
 *   1. A DOUBLED qualifier is always wrong. "$999 + GST + GST" needs no judgement about whether
 *      the number is a price — nothing is ever taxed twice in one label. Zero false positives by
 *      construction, and it catches the exact defect that shipped.
 *   2. A PERIODIC price must carry a qualifier. "$999/month", "A$149 per year" — the period is
 *      what makes it a price rather than a figure, because a valuation is never quoted per month.
 *      That is the signal, and it is the buyer's own words rather than our guess.
 *
 * A bare amount with no period is deliberately IGNORED. It might be a price and it might be a
 * valuation, and this audit refuses to assert which — an unprovable finding is worse than a
 * missing one, because it teaches people the check is wrong.
 *
 * ⚠️ KNOWN LIMIT — IT ONLY SEES SERVER-RENDERED PRICES, and that matters more than it sounds.
 * This reads the HTML the server sends, so a price computed on the client is invisible to it.
 * Measured against Kira: the landing carries "$499 + GST to $4,999 + GST /month" and is checked,
 * while `/plan` and `/business-valuation` return ZERO currency amounts to a fetch because their
 * prices are rendered after hydration — and `/plan` is precisely where the original `+ GST + GST`
 * shipped. So this audit would NOT have caught the defect that motivated it, in situ.
 *
 * That is stated plainly rather than buried, because a check whose coverage is assumed to be
 * total is worse than one whose limit is known: it converts "we did not look there" into "there
 * is nothing there". Closing it means rendering the page in a browser, as the input-response
 * audit does — worth doing, and a deliberate follow-up rather than a silent gap. Until then, the
 * unit tests carry the defect strings themselves, so the PATTERNS are proven even where the
 * transport cannot reach.
 */
import { type AuditFinding, type AuditResult } from './shared.js'
import { findMarkedPublicRoutes, probePublicRoute } from './public-routes.js'
import { measureVisibleText } from './first-paint.js'

/**
 * Tax labels recognised as qualifiers, by jurisdiction.
 *
 * The label follows the BUYER, not our entity: it is VAT in the UK/EU/UAE, GST/HST in Canada,
 * sales tax in the US, GST in AU/NZ/Singapore/India. A product reachable from anywhere cannot
 * hardcode "GST", so the audit must accept any of them rather than enforce one.
 */
export const TAX_LABELS = ['GST', 'VAT', 'HST', 'QST', 'sales tax', 'TVA', 'IVA', 'tax']

const LABELS_ALT = TAX_LABELS.map((l) => l.replace(/ /g, '\\s+')).join('|')

/**
 * "+ GST", "incl. VAT", "excluding GST", "plus GST" — a qualifier in any of its usual clothes.
 *
 * LONGEST FORMS FIRST. Regex alternation is left-to-right, so putting `excl\.?` before
 * `excluding` lets it match "excl" out of "excluding" and then fail on "uding VAT" — a qualifier
 * that is plainly present, read as absent.
 */
const QUALIFIER = `(?:\\+|plus|including|incl\\.?|excluding|excl\\.?|ex)\\s*(?:${LABELS_ALT})`

/**
 * A currency amount.
 *
 * The prefix is an EXPLICIT list, not `[A-Z]{0,2}`. These regexes are case-insensitive (labels
 * appear as "GST" and "gst"), so a two-letter wildcard also matches lowercase letters — and
 * "…you p[ay $999]" duly matched, reporting the defect with two stray characters glued to the
 * front. The list cannot do that.
 */
const AMOUNT =
  '(?:(?:USD|AUD|GBP|EUR|NZD|CAD|SGD|A|NZ|US|C)\\s?)?[$£€¥]\\s?[\\d][\\d,.]*\\s*(?:k|m|bn|million|billion)?'

/** The same qualifier twice in a row — always a defect, whatever the number is. */
const DOUBLED = new RegExp(`(${AMOUNT})((?:\\s*${QUALIFIER}){2,})`, 'gi')

/**
 * A per-period price: an amount followed by /month, per year, a month …
 *
 * The qualifier is deliberately NOT part of this pattern. It was, and that made the match depend
 * on the qualifier sitting in one exact position relative to the period — so "$999 excluding VAT
 * per month" read as unqualified. Whether a qualifier is present is now answered by looking at the
 * text AROUND the price (see QUALIFIER_WINDOW), which is how a reader answers it too.
 */
const PERIODIC = new RegExp(
  // An optional qualifier may sit BETWEEN the amount and the period — Kira's landing reads
  // "$4,999 + GST /month". Without this the price is never matched at all, so the audit examines
  // nothing and reports clean: the vacuous pass that this whole package exists to prevent.
  // Whether a qualifier is actually present is still decided by the window below, not here.
  `${AMOUNT}(?:\\s*${QUALIFIER})?\\s*(?:\\/|\\s+per\\s+|\\s+a\\s+|\\s+each\\s+)\\s*` +
    `(?:month|mo\\b|year|yr\\b|annum|week|wk\\b|day)`,
  'gi',
)

/** How far either side of a price to look for its qualifier. */
const QUALIFIER_WINDOW = 40

export interface TaxSuffixOptions {
  rootDir?: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export interface PriceFinding {
  kind: 'doubled' | 'unqualified'
  text: string
}

/**
 * Find price defects in a page's visible text.
 *
 * Pure and exported so the pattern work is testable without a deployment — the regexes are the
 * whole risk surface here, and a regex that silently stops matching is a check that reports clean
 * forever.
 */
export function findPriceDefects(text: string): PriceFinding[] {
  const out: PriceFinding[] = []

  for (const m of text.matchAll(DOUBLED)) {
    out.push({ kind: 'doubled', text: `${m[1]}${m[2]}`.replace(/\s+/g, ' ').trim() })
  }

  // A periodic price whose qualifier is nowhere near it.
  //
  // The window is read either side, because English puts it on both: "$999 + GST per month" and
  // "$999 a month, plus GST" are the same statement and a reader accepts both.
  const seen = new Set<string>()
  const qualifierRe = new RegExp(QUALIFIER, 'i')
  for (const m of text.matchAll(PERIODIC)) {
    const whole = m[0].replace(/\s+/g, ' ').trim()
    if (seen.has(whole)) continue
    const at = m.index ?? 0
    const window = text.slice(
      Math.max(0, at - QUALIFIER_WINDOW),
      at + whole.length + QUALIFIER_WINDOW,
    )
    if (qualifierRe.test(window)) continue
    seen.add(whole)
    out.push({ kind: 'unqualified', text: whole })
  }

  return out
}

export async function runTaxSuffixAudit(options: TaxSuffixOptions = {}): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const findings: AuditFinding[] = []

  const marked = await findMarkedPublicRoutes(rootDir)

  if (marked.length === 0) {
    return {
      audit: 'tax-suffix',
      rule: 'R9',
      passed: true,
      skipped: true,
      skipReason:
        'No pages marked @public-route. Mark the pages a buyer sees a price on — an unqualified ' +
        'price reads to a business buyer as the amount that will leave their account, which in ' +
        'most jurisdictions it is not.',
      findings,
      durationMs: Date.now() - start,
    }
  }

  if (!options.baseUrl) {
    return {
      audit: 'tax-suffix',
      rule: 'R9',
      passed: false,
      findings: [
        {
          severity: 'fail',
          message: `${marked.length} route(s) marked @public-route but no base URL was supplied — no price was checked.`,
          detail: 'Pass --base-url, or PORTFOLIO_GATE_PREVIEW_URL / PUBLIC_ALIAS in the environment.',
        },
      ],
      durationMs: Date.now() - start,
    }
  }

  let measured = 0
  for (const route of marked) {
    const probe = await probePublicRoute(options.baseUrl, route.urlPath, route.file, {
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    })
    if (probe.error || probe.status !== 200) continue
    measured += 1

    // allText, not contentText: a price in a footer or a nav is still a price.
    const { allText } = measureVisibleText(probe.body)

    for (const defect of findPriceDefects(allText)) {
      if (defect.kind === 'doubled') {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} renders a price with the tax qualifier TWICE: "${defect.text}"`,
          file: route.file,
          detail:
            'Nothing is taxed twice in one label, so this is always a defect regardless of the ' +
            'number. It usually means a formatter already appends the suffix and a call site ' +
            'appends it again — fix the call site, then grep for siblings, because the one a ' +
            'report names is rarely the only one.',
        })
      } else {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} renders a recurring price with no tax qualifier: "${defect.text}"`,
          file: route.file,
          detail:
            'A per-period amount is a price, and an unqualified price is read by a business buyer ' +
            'as the amount that will leave their account. State the tax — and derive the label ' +
            'from the buyer\'s currency rather than hardcoding "GST", since it is VAT in the UK/EU, ' +
            'GST/HST in Canada and sales tax in the US. Valuation figures are NOT prices and must ' +
            'not gain a suffix; this audit only judges amounts quoted per period.',
        })
      }
    }
  }

  if (measured === 0) {
    findings.push({
      severity: 'fail',
      message: `No page could be read — ${marked.length} marked route(s), none answered 200.`,
      detail:
        'Nothing was checked, so nothing is established. Usually a protected preview or a bad ' +
        'base URL. Failing rather than passing: a check that read nothing must not look green.',
    })
  }

  return {
    audit: 'tax-suffix',
    rule: 'R9',
    passed: findings.every((f) => f.severity !== 'fail'),
    findings,
    durationMs: Date.now() - start,
  }
}
