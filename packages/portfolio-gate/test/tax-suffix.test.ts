/**
 * Regression tests for the tax-qualifier audit.
 *
 * The doubled-qualifier cases are the defect that shipped to a live payment page. The valuation
 * cases matter more: they are the reason this check is usable at all. A product whose entire job
 * is printing large currency figures would drown in false positives under a naive "every dollar
 * amount needs + GST" rule, and the fix for that noise is always to switch the check off.
 */
import { describe, expect, it } from 'vitest'
import { findPriceDefects } from '../src/audit/tax-suffix.js'

const kinds = (t: string) => findPriceDefects(t).map((d) => d.kind)

describe('doubled qualifiers — always a defect, whatever the number is', () => {
  it('catches the exact string that shipped to a live payment page', () => {
    const d = findPriceDefects('at the end of each month you pay $999 + GST + GST for the month just finished')
    expect(d).toHaveLength(1)
    expect(d[0]?.kind).toBe('doubled')
    expect(d[0]?.text).toBe('$999 + GST + GST')
  })

  it('catches a doubled VAT on a non-AU price', () => {
    expect(kinds('£499 + VAT + VAT /month')).toContain('doubled')
  })

  it('does NOT flag a correctly qualified price', () => {
    expect(findPriceDefects('$999 + GST per month')).toHaveLength(0)
  })
})

describe('recurring prices must state the tax', () => {
  it('flags a per-month price with no qualifier', () => {
    const d = findPriceDefects('Just $999/month for everything.')
    expect(d).toHaveLength(1)
    expect(d[0]?.kind).toBe('unqualified')
  })

  it('flags a per-year price written in words', () => {
    expect(kinds('A$149 per year, billed annually')).toContain('unqualified')
  })

  it('accepts a qualifier written any of the usual ways', () => {
    expect(findPriceDefects('$999 incl. GST per month')).toHaveLength(0)
    expect(findPriceDefects('$999 excluding VAT per month')).toHaveLength(0)
    expect(findPriceDefects('$999 plus GST a month')).toHaveLength(0)
    expect(findPriceDefects('$999 a month + GST')).toHaveLength(0)
  })
})

describe('a valuation is NOT a price — the false positives that would kill this check', () => {
  // Kira prints these on every result page. Demanding "+ GST" on what a business is worth is
  // nonsense, and the noise would get the audit disabled inside a week.
  it('ignores a business valuation', () => {
    expect(findPriceDefects('Worth today: $874,000, about 2.6× SDE')).toHaveLength(0)
  })

  it('ignores the value gap, the number the whole product is built on', () => {
    expect(findPriceDefects('Value locked in your head: $147,000')).toHaveLength(0)
  })

  it('ignores a walk-away range and an equipment figure', () => {
    expect(findPriceDefects('Walk away: $152,000–$228,000 against $380,000 of gear')).toHaveLength(0)
  })

  it('ignores turnover and profit figures', () => {
    expect(findPriceDefects('$2.4 million turnover, $340k SDE')).toHaveLength(0)
  })

  it('matches a price whose qualifier sits BETWEEN the amount and the period', () => {
    // Kira's live landing: "Plans run from$499 + GST to $4,999 + GST /month". The first version
    // required the amount to be followed directly by the period, so this matched nothing at all —
    // the audit examined zero prices on the one page that has them and reported PASS.
    expect(findPriceDefects('Plans run from$499 + GST to $4,999 + GST /month')).toHaveLength(0)
    expect(kinds('Plans run from $499 to $4,999 /month')).toContain('unqualified')
  })

  it('still catches a real recurring price sitting in the SAME paragraph as a valuation', () => {
    const d = findPriceDefects(
      'Your gap is $147,000. Kira costs $999/month and pays for itself in a quarter.',
    )
    expect(d).toHaveLength(1)
    expect(d[0]?.text).toContain('999')
  })
})
