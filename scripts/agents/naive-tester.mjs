// naive-tester.mjs — Option B CI-native naive-tester (Playwright + Anthropic vision).
//
// Walks the live product as a first-time end-user: landing (desktop + mobile), a best-effort form
// login (which also exercises the auth path), and an authed surface. Then asks Claude to verdict the
// VISUALLY-ASSESSABLE NAIVE-method rubric checks from the screenshots, and records them via
// gate-check (source=naive-tester). Anything the screenshots can't decide → na (degrade-don't-fake).
//
// This is the cloud replacement for the gstack /naive-tester. v1 covers the visual/UX checks; the
// repo/config checks (#35/#36/#37/#40, voice integration internals) come from validation-probe +
// config-fixer, not the browser.
//
// Usage (CI): node naive-tester.mjs --slug <slug> --url <liveUrl> [--deployment <id>]
// Env: ANTHROPIC_API_KEY (required); TEST_USER_EMAIL + QA_USER_PASSWORD (optional, for the authed
//      surface); VERCEL_AUTOMATION_BYPASS_SECRET (optional, for preview SSO).

import { arg, launch, goto, shot, tryLogin, visionVerdicts, record } from './lib.mjs'

const slug = arg('slug')
const origin = arg('url').replace(/\/$/, '')
const deployment = arg('deployment')
const apiKey = process.env.ANTHROPIC_API_KEY

const CHECKS = [
  { code: '1', label: 'Explanatory header at the top of pages (what is this / what do I do / why it matters)' },
  { code: '2', label: 'Responsive — usable at mobile (390px) AND desktop (1280px) with no horizontal scroll or broken layout' },
  { code: '3', label: 'Touch targets look >=44px and body text >=16px on the mobile screenshot' },
  { code: '4', label: 'Navigation collapses to a hamburger/drawer on mobile (not a cut-off desktop menu)' },
  { code: '5', label: 'Landing page sells the concept — clear value proposition and an obvious primary CTA' },
  { code: '6', label: 'Emotional register matches the product — alive/intentional, not a dull grey utilitarian shell' },
  { code: '31', label: 'Irreversible / cost-incurring / outreach actions state their consequence and require confirm (if any are visible)' },
  { code: '32', label: 'Zero dead ends — every screen makes the next action obvious' },
  { code: '41', label: 'Human walkthrough overall — would a real first-time user say "I want that"' },
]

async function main() {
  if (!slug || !origin) { console.error('naive-tester: --slug and --url are required'); return 2 }
  if (!apiKey) { console.error("naive-tester: ANTHROPIC_API_KEY required — recording nothing (degrade-don't-fake)"); return 1 }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
  const { browser, ctx } = await launch({ bypass })
  try {
    const shots = []
    const desktop = await ctx.newPage()
    if (await goto(desktop, origin)) shots.push(await shot(desktop, 'landing — desktop 1280'))

    const mobile = await ctx.newPage()
    await mobile.setViewportSize({ width: 390, height: 844 })
    if (await goto(mobile, origin)) shots.push(await shot(mobile, 'landing — mobile 390'))

    const login = await tryLogin(desktop, origin, {
      email: process.env.QA_USER_EMAIL || process.env.TEST_USER_EMAIL || process.env.QA_TEST_EMAIL,
      password: process.env.QA_USER_PASSWORD || process.env.QA_TEST_PASSWORD,
    })
    if (login.ok) shots.push(await shot(desktop, 'authed surface (after login) — desktop'))

    if (!shots.length) { console.error('naive-tester: could not load any page — recording nothing'); return 1 }

    const verdicts = await visionVerdicts({ apiKey, persona: 'a naive first-time end-user', checks: CHECKS, shots })
    const n = await record(slug, 'naive-tester', verdicts, deployment)
    console.log(`naive-tester: recorded ${n} verdict(s) for ${slug} from ${shots.length} screenshot(s)`, login.ok ? '(incl. authed surface)' : `(login: ${login.note})`)
    return 0
  } finally {
    await browser.close()
  }
}

main().then((c) => { process.exitCode = c ?? 0 }).catch((e) => { console.error(`naive-tester error: ${e.message}`); process.exit(1) })
