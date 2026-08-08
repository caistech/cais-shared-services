import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runOfferClaimsAudit } from '../src/audit/offer-claims.js'

// Written from the real defect: one live pricing page promising "free for 1 month" in a FAQ AND
// on a plan badge, "card required at sign-up" beside every button, and a "60-day free trial" via
// the assistant — while the product granted 14 days and took no card at sign-up.

const AUTHORITY = {
  trialDays: 14,
  prices: [
    { plan: 'Essential', amount: 49, currency: 'AUD', interval: 'month' as const },
    { plan: 'Professional', amount: 199, currency: 'AUD', interval: 'month' as const },
  ],
}

async function repo(
  files: Record<string, string>,
  config: Record<string, unknown> = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'offerclaims-'))
  await mkdir(join(dir, 'src', 'app'), { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, 'src', 'app', name), content, 'utf8')
  }
  await writeFile(
    join(dir, 'offer-claims.config.json'),
    JSON.stringify({ authority: AUTHORITY, roots: ['src/app'], ...config }),
    'utf8',
  )
  return dir
}

describe('trial length', () => {
  it('fails a month-long claim when the product grants 14 days', async () => {
    const dir = await repo({ 'p.tsx': `const faq = "Essential is free for 1 month"` })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(false)
    expect(r.findings.some((f) => /free period|free/i.test(f.message))).toBe(true)
  })

  it('catches the WORD form, which dodges a digit search', async () => {
    // "free for 1 month" was found only by accident; a grep for "14" would never have seen it,
    // and neither would one for "30". This is the form that hides.
    const dir = await repo({ 'p.tsx': `<p>Try it free for a month</p>` })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(false)
  })

  it('fails a stale 60-day claim', async () => {
    const dir = await repo({ 'p.tsx': `summary: "Currently a 60-day free trial then paid plans."` })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(false)
  })

  it('passes the correct length', async () => {
    const dir = await repo({ 'p.tsx': `<p>14 days free, all modules unlocked.</p>` })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(true)
  })

  it('ignores a duration with no offer context — not every number is a promise', async () => {
    const dir = await repo({ 'p.tsx': `<p>Reports are retained for 30 days.</p>` })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(true)
  })
})

describe('prices', () => {
  it('fails a figure the product never charges', async () => {
    const dir = await repo({ 'p.tsx': `const plan = { price: "$99", was: "$49" }` })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(false)
    expect(r.findings.some((f) => f.message.includes('$99'))).toBe(true)
  })

  it('accepts a was-price once someone says what substantiates it', async () => {
    const dir = await repo({
      'p.tsx': `const plan = { price: "$99" } // @offer-claim-ok: RRP before launch discount, confirmed by Karen 2026-08-09`,
    })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(true)
  })

  it('passes declared prices', async () => {
    const dir = await repo({ 'p.tsx': `const plan = { price: "$49" }` })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(true)
  })

  it('ignores money with no selling language near it', async () => {
    // The first real run failed on "$485,000" vs "$445,000" — an illustration of a saving on a
    // BUILD, not a price the product charges. A check that cries wolf on every dollar sign in
    // the marketing copy gets switched off, and then it protects nothing.
    const dir = await repo({
      'p.tsx': `<p className="text-2xl font-bold text-white">$485,000</p>
                <p className="text-2xl font-bold text-green-400">$445,000</p>`,
    })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(true)
  })

  it('still sees a price on a nearby line, not only the same one', async () => {
    // JSX routinely puts the label and the figure on different lines.
    const dir = await repo({
      'p.tsx': `<div className="plan-card">
                  <span>$99</span>
                </div>`,
    })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(false)
  })
})

describe('comments are not claims', () => {
  it('does not fail a comment explaining a claim that was REMOVED', async () => {
    // Earned the hard way on the sibling check: an honest note recording what a false string used
    // to say must not itself fail, or the lesson people learn is to delete the explanation.
    const dir = await repo({
      'p.tsx': `// Was: "free for 1 month" — nothing implemented it, removed 2026-08-09
                <p>14 days free.</p>`,
    })
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(true)
  })
})

describe('the config must not become the new lie', () => {
  it('fails when Stripe disagrees with the declared price', async () => {
    const dir = await repo(
      { 'p.tsx': `<span>$49</span>` },
      {
        verifyAgainstStripe: true,
        authority: {
          ...AUTHORITY,
          prices: [{ plan: 'Essential', amount: 49, stripePriceId: 'price_x' }],
        },
      },
    )
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ unit_amount: 9900, currency: 'aud', active: true }), {
        status: 200,
      })) as unknown as typeof fetch
    const r = await runOfferClaimsAudit({ cwd: dir, fetchImpl })
    delete process.env.STRIPE_SECRET_KEY
    expect(r.passed).toBe(false)
    expect(r.findings.some((f) => /Stripe charges \$99/.test(f.message))).toBe(true)
  })

  it('fails rather than skips when verification is requested and the key is missing', async () => {
    // A verification that silently did not happen is the failure this package exists to end.
    const dir = await repo({ 'p.tsx': `<span>$49</span>` }, { verifyAgainstStripe: true })
    const saved = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    const r = await runOfferClaimsAudit({ cwd: dir })
    if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved
    expect(r.passed).toBe(false)
    expect(r.findings.some((f) => /is not set/.test(f.message))).toBe(true)
  })
})

describe('skip and staleness', () => {
  it('skips a repo with no config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'offerclaims-none-'))
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.skipped).toBe(true)
    expect(r.passed).toBe(true)
  })

  it('fails a config whose roots match nothing, rather than passing vacuously', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'offerclaims-stale-'))
    await writeFile(
      join(dir, 'offer-claims.config.json'),
      JSON.stringify({ authority: AUTHORITY, roots: ['does/not/exist'] }),
      'utf8',
    )
    const r = await runOfferClaimsAudit({ cwd: dir })
    expect(r.passed).toBe(false)
    expect(r.findings.some((f) => /roots match nothing/.test(f.message))).toBe(true)
  })
})
