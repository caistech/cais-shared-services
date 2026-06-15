// user-tester.mjs — dual-portal §8.5 USER-portal agent (Playwright + Anthropic vision).
//
// The dual-portal §8.5 user half (the twin of admin-tester). Logs in as the dedicated USER-AGENT
// (dennis@factory2key.com.au / QA_USER_PASSWORD — a real NON-admin account, NEVER in ADMIN_EMAILS)
// and walks the user-portal checks VT_B1–VT_B5. Records via gate-check (source=naive-tester — the
// dual-portal walk is part of the naive-tester coverage).
//
// §43 FACADE RULE: the user flow MUST reach a real authenticated user home distinct from /admin. A
// signup/login that bounces into the /admin gate or dead-ends is a FAIL (VT_B1), not na.
// §8.5 CROSS-ACCESS: a non-admin reaching /admin is a security FAIL (VT_B2).
//
// Usage (CI): node user-tester.mjs --slug <slug> --url <liveUrl> [--deployment <id>]
// Env: ANTHROPIC_API_KEY (required); QA_USER_EMAIL (default dennis@factory2key.com.au);
//      QA_USER_PASSWORD (the user-agent password); VERCEL_AUTOMATION_BYPASS_SECRET (optional).

import { arg, launch, goto, shot, tryLogin, visionVerdicts, record } from './lib.mjs'

const slug = arg('slug')
const origin = arg('url').replace(/\/$/, '')
const deployment = arg('deployment')
const apiKey = process.env.ANTHROPIC_API_KEY
const userEmail = process.env.QA_TEST_USER_EMAIL || process.env.QA_USER_EMAIL || process.env.TEST_USER_EMAIL || 'dennis@factory2key.com.au'
const userPw = process.env.QA_TEST_USER_PASSWORD || process.env.QA_USER_PASSWORD

const CHECKS = [
  { code: 'VT_B1', label: 'User portal access: after this user logs in, a REAL authenticated user home / functional product UI renders — NOT a login page, NOT a 404, and NOT the admin control panel. (§43: a user flow that dead-ends or bounces into /admin is a FAIL, never na.)' },
  { code: 'VT_B2', label: 'Non-admin BLOCKED from /admin: navigating to /admin as this non-admin user shows a login wall, a 403/forbidden, or a redirect AWAY from the admin panel. If the admin control console actually renders for a non-admin user, mark FAIL (a cross-access security hole).' },
  { code: 'VT_B3', label: 'User settings: a settings page renders for the user with profile / password / notification controls that look saveable.' },
  { code: 'VT_B4', label: 'User sign-out: a Sign Out control is visible in the authenticated chrome (persistent nav / header / menu).' },
  { code: 'VT_B5', label: 'User feature navigation: the core product surfaces load (no error / blank screen) and a persistent nav lets the user move between the main features — zero dead ends.' },
]

async function main() {
  if (!slug || !origin) { console.error('user-tester: --slug and --url are required'); return 2 }
  if (!apiKey) { console.error("user-tester: ANTHROPIC_API_KEY required — recording nothing (degrade-don't-fake)"); return 1 }
  if (!userPw) { console.error('user-tester: QA_USER_PASSWORD (user-agent password) not set — recording nothing'); return 1 }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
  const { browser, ctx } = await launch({ bypass })
  try {
    const page = await ctx.newPage()
    // User login (the user portal gates at /login, NOT /admin/login — never use the admin path here).
    const login = await tryLogin(page, origin, {
      email: userEmail,
      password: userPw,
      paths: ['/login', '/pipeline/login', '/auth/login', '/signin'],
    })

    // Couldn't authenticate as the user-agent → we can't distinguish "no user area" from
    // "account not provisioned here", so record na with the exact fix (degrade-don't-fake).
    if (!login.ok) {
      const why = `NEEDS-YOU: user-agent login failed (${login.note}). Provision ${userEmail} on this product (Supabase dashboard, email-confirmed) as a NON-admin account (it must NOT be in ADMIN_EMAILS), then re-run.`
      const verdicts = CHECKS.map((c) => ({ code: c.code, status: 'na', evidence: why }))
      const n = await record(slug, 'naive-tester', verdicts, deployment)
      console.log(`user-tester: user login failed (${login.note}) — recorded ${n} na verdict(s) for ${slug}`)
      return 0
    }

    const shots = []
    // VT_B1 + VT_B4 + VT_B5 — the user home (wherever login landed) shows the authed area + chrome/nav.
    shots.push(await shot(page, `user home after login — landed at ${page.url()} (authenticated user area + chrome)`))
    // VT_B2 — navigate to /admin as the non-admin user; it MUST be blocked.
    await goto(page, `${origin}/admin`)
    await page.waitForTimeout(1200)
    shots.push(await shot(page, `/admin requested as a NON-admin user — final url: ${page.url()} (expect a block: login wall / 403 / redirect away)`))
    // VT_B3 — user settings (the shared /settings the user uses).
    for (const p of ['/settings', '/account', '/pipeline/settings']) {
      if (await goto(page, `${origin}${p}`)) { shots.push(await shot(page, `user settings (${p})`)); break }
    }

    if (!shots.length) { console.error('user-tester: no screenshots — recording nothing'); return 1 }

    const verdicts = await visionVerdicts({ apiKey, persona: 'a non-admin end-user QA tester (logged in as a regular user, NOT an admin)', checks: CHECKS, shots })
    const n = await record(slug, 'naive-tester', verdicts, deployment)
    console.log(`user-tester: recorded ${n} verdict(s) for ${slug} from ${shots.length} screenshot(s) (user login: ${login.ok ? 'ok' : login.note})`)
    return 0
  } finally {
    await browser.close()
  }
}

main().then((c) => { process.exitCode = c ?? 0 }).catch((e) => { console.error(`user-tester error: ${e.message}`); process.exit(1) })
