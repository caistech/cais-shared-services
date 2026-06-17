// auth-tester.mjs — §2 / §8.5 AUTH-pattern agent (Playwright + Anthropic vision).
//
// Screenshots the PUBLIC auth pages (no login) and judges the auth-pattern checks VT_C1–VT_C4:
// signup, login + password visibility toggle, forgot-password, magic-link. Records via gate-check.
//
// The actual EMAIL delivery (confirm / reset / magic link) isn't CI-verifiable without a mailbox, so
// each check judges the on-page AFFORDANCE (the form + control is present) — a missing affordance is
// a FAIL; a present one is a PASS (live delivery is the §3 auth smoke-test's job, noted in evidence).
//
// Usage (CI): node auth-tester.mjs --slug <slug> --url <liveUrl> [--deployment <id>]
// Env: ANTHROPIC_API_KEY (required); VERCEL_AUTOMATION_BYPASS_SECRET (optional).

import { arg, launch, goto, shot, resolveSurfaces, visionVerdicts, record } from './lib.mjs'

const slug = arg('slug')
const origin = arg('url').replace(/\/$/, '')
const deployment = arg('deployment')
const apiKey = process.env.ANTHROPIC_API_KEY

const CHECKS = [
  { code: 'VT_C1', label: 'Signup: a signup form is reachable (a "Sign up" / "Create account" tab or page) with email + password fields. A product with an auth gate MUST offer signup. Missing → FAIL.' },
  { code: 'VT_C2', label: 'Login + password visibility toggle: the login form has a password field WITH a visibility (eye / show-password) toggle next to it (§2). No eye toggle on the password field → FAIL.' },
  { code: 'VT_C3', label: 'Forgot-password: a "Forgot password?" link / flow is present on the login surface (§2). Missing → FAIL. (Email delivery is verified separately; here the on-page affordance must exist.)' },
  { code: 'VT_C4', label: 'Magic-link: a passwordless "magic link" / "email me a sign-in link" option is offered on the login/auth surface (§2). Missing → FAIL.' },
]

async function main() {
  if (!slug || !origin) { console.error('auth-tester: --slug and --url are required'); return 2 }
  if (!apiKey) { console.error("auth-tester: ANTHROPIC_API_KEY required — recording nothing (degrade-don't-fake)"); return 1 }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
  const { browser, ctx } = await launch({ bypass })
  try {
    const page = await ctx.newPage()
    // Resolve the REAL auth surfaces (landing-CTA discovery + 404-aware probe) instead of guessing
    // `/login` etc. — a 404 at a guessed path no longer gets screenshotted/judged as the auth page
    // (the VT_C1-C4 false-negative class on products with non-default routes, e.g. /pipeline/login).
    const surfaces = await resolveSurfaces(page, origin)
    const shots = []
    if (surfaces.loginUrl && (await goto(page, surfaces.loginUrl))) shots.push(await shot(page, `login page (${surfaces.loginUrl})`))
    if (surfaces.signupUrl && (await goto(page, surfaces.signupUrl))) shots.push(await shot(page, `signup page (${surfaces.signupUrl})`))
    if (surfaces.forgotUrl && (await goto(page, surfaces.forgotUrl))) shots.push(await shot(page, `forgot/reset password page (${surfaces.forgotUrl})`))

    if (!shots.length) {
      const why = `NEEDS-YOU: no real auth surface (login/signup/forgot) discovered for ${origin} (resolved: login=${surfaces.loginUrl || '∅'} signup=${surfaces.signupUrl || '∅'} forgot=${surfaces.forgotUrl || '∅'}). Confirm the product's auth routes, then re-run.`
      const verdicts = CHECKS.map((c) => ({ code: c.code, status: 'na', evidence: why }))
      const n = await record(slug, 'naive-tester', verdicts, deployment)
      console.log(`auth-tester: no auth surface reachable — recorded ${n} na verdict(s) for ${slug}`)
      return 0
    }

    const verdicts = await visionVerdicts({ apiKey, persona: 'an auth-pattern QA tester checking the login / signup / reset pages for the required §2 affordances', checks: CHECKS, shots })
    const n = await record(slug, 'naive-tester', verdicts, deployment)
    console.log(`auth-tester: recorded ${n} verdict(s) for ${slug} from ${shots.length} screenshot(s)`)
    return 0
  } finally {
    await browser.close()
  }
}

main().then((c) => { process.exitCode = c ?? 0 }).catch((e) => { console.error(`auth-tester error: ${e.message}`); process.exit(1) })
