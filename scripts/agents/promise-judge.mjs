// promise-judge.mjs — Option B CI producer for check #9 (THE central THIN-MVP test:
// "promise attributes present AND at quality bar"). Loads the product's ratified "X, not Y" quality
// bars (promise_attributes), screenshots the live build (landing + an authed surface), and asks
// Claude to judge each attribute against its exact bar. Rolls the per-attribute verdicts into #9 and
// records it via gate-check (source=judge).
//
// Honesty (degrade-don't-fake): an attribute the screenshots can't assess (e.g. "<3s p95 verdict",
// "tested on 5 deal types" — needs interaction/scale, not a screenshot) is `na`, never a guessed
// pass. #9 is `na` when NOTHING is assessable or the product has no ratified bars; `fail` if any
// assessable bar is clearly below bar; `pass` only when the assessable bars are met.
//
// Usage (CI): node promise-judge.mjs --slug <slug> --url <liveUrl> [--deployment <id>]
// Env: ANTHROPIC_API_KEY (required); QA_USER_EMAIL/QA_USER_PASSWORD (optional, authed surface);
//      VERCEL_AUTOMATION_BYPASS_SECRET (optional). Reads promise_attributes via the gate creds.

import { arg, launch, goto, shot, tryLogin, visionVerdicts, record } from './lib.mjs'
import { resolveGatesCreds } from '../gate-check.mjs'

const slug = arg('slug')
const origin = arg('url').replace(/\/$/, '')
const deployment = arg('deployment')
const apiKey = process.env.ANTHROPIC_API_KEY

async function loadBars(slug) {
  const { url, key } = resolveGatesCreds()
  const res = await fetch(`${url}/rest/v1/promise_attributes?product_slug=eq.${encodeURIComponent(slug)}&select=attribute,quality_bar,sort_order&order=sort_order.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return []
  return (await res.json()) || []
}

async function main() {
  if (!slug || !origin) { console.error('promise-judge: --slug and --url required'); return 2 }
  if (!apiKey) { console.error("promise-judge: ANTHROPIC_API_KEY required — recording nothing (degrade-don't-fake)"); return 1 }

  const bars = await loadBars(slug)
  if (!bars.length) {
    // No ratified promise bars → #9 is not judgeable for this product (na, with the reason).
    await record(slug, 'judge', [{ code: '9', status: 'na', evidence: `no ratified promise_attributes for ${slug} — #9 not scorable until the "X, not Y" bars are set` }], deployment)
    console.log(`promise-judge: no bars for ${slug} — recorded #9 na`)
    return 0
  }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
  const { browser, ctx } = await launch({ bypass })
  try {
    const shots = []
    const landing = await ctx.newPage()
    if (await goto(landing, origin)) shots.push(await shot(landing, 'landing — sells the promise'))
    const app = await ctx.newPage()
    const login = await tryLogin(app, origin, {
      email: process.env.QA_USER_EMAIL || process.env.TEST_USER_EMAIL,
      password: process.env.QA_USER_PASSWORD,
    })
    if (login.ok) shots.push(await shot(app, 'core product surface (authed) — the promise in action'))
    if (!shots.length) { console.error('promise-judge: could not load any page'); return 1 }

    // Judge each bar from the screenshots. na where a bar needs interaction/scale a screenshot can't show.
    const checks = bars.map((b, i) => ({ code: `A${i}`, label: `${b.attribute} — QUALITY BAR (pass ONLY if clearly met): ${b.quality_bar}` }))
    const verdicts = await visionVerdicts({
      apiKey,
      persona: 'a strict product judge scoring each promise attribute against its exact "X, not Y" quality bar — pass ONLY if the bar is clearly evidenced in the screenshots; fail if clearly below bar; na if the bar needs interaction/scale a screenshot cannot show',
      checks,
      shots,
    })

    const byCode = Object.fromEntries((verdicts || []).map((v) => [v.code, v]))
    const assessed = bars.map((b, i) => byCode[`A${i}`]?.status).filter((s) => s === 'pass' || s === 'fail')
    const anyFail = assessed.includes('fail')
    const met = assessed.filter((s) => s === 'pass').length
    let status, evidence
    if (assessed.length === 0) { status = 'na'; evidence = `${bars.length} promise bar(s) — none assessable from screenshots (need interaction/scale); ran a live judge` }
    else if (anyFail) { status = 'fail'; evidence = `${met}/${assessed.length} assessable bars met; below bar: ${bars.map((b, i) => byCode[`A${i}`]?.status === 'fail' ? b.attribute : null).filter(Boolean).slice(0, 3).join('; ')}` }
    else { status = 'pass'; evidence = `${met}/${assessed.length} assessable promise bars met at quality bar (${bars.length - assessed.length} na — not surface-assessable)` }

    const n = await record(slug, 'judge', [{ code: '9', status, evidence }], deployment)
    console.log(`promise-judge: recorded #9=${status} for ${slug} (${assessed.length}/${bars.length} bars assessable; login ${login.ok ? 'ok' : login.note})`)
    return n ? 0 : 1
  } finally {
    await browser.close()
  }
}

main().then((c) => { process.exitCode = c ?? 0 }).catch((e) => { console.error(`promise-judge error: ${e.message}`); process.exit(1) })
