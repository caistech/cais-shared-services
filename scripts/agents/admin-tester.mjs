// admin-tester.mjs — Option B CI-native ADMIN-portal agent (Playwright + Anthropic vision).
//
// The dual-portal §8.5 admin half. Logs in as the dedicated ADMIN-AGENT
// (dennis+qaadmin@factory2key.com.au / QA_OWNER_PASSWORD — a real account in ADMIN_EMAILS, NEVER an
// operator account) and walks the SAFE, idempotent admin checks ONLY: VT_A1–VT_A4. It NEVER touches
// VT_A5 (Sign Out Everywhere) or VT_A6 (Delete Account) — those are destructive and operator-verified
// by hand (the §9.5 bounded-admin-agent rule). Records via gate-check (source=naive-tester — the
// dual-portal walk is part of the naive-tester coverage).
//
// MANDATORY-PORTAL RULE (§8.5): every product must ship an admin portal. If none renders, VT_A1 is a
// FAIL ("no admin portal — §8.5 requires one"), never `na`.
//
// Usage (CI): node admin-tester.mjs --slug <slug> --url <liveUrl> [--deployment <id>]
// Env: ANTHROPIC_API_KEY (required); QA_ADMIN_EMAIL (default dennis+qaadmin@factory2key.com.au);
//      QA_OWNER_PASSWORD (the admin-agent password — NOT an operator password);
//      VERCEL_AUTOMATION_BYPASS_SECRET (optional).

import { arg, launch, goto, shot, tryLogin, visionVerdicts, record } from './lib.mjs'

const slug = arg('slug')
const origin = arg('url').replace(/\/$/, '')
const deployment = arg('deployment')
const apiKey = process.env.ANTHROPIC_API_KEY
const adminEmail = process.env.QA_ADMIN_EMAIL || 'dennis+qaadmin@factory2key.com.au'
const adminPw = process.env.QA_OWNER_PASSWORD

// VT_A1–A4 ONLY (A5/A6 are operator-verified, never agent-run). The mandatory-portal rule is baked
// into VT_A1's instruction so the model fails (not na) when no admin control panel is present.
const CHECKS = [
  { code: 'VT_A1', label: 'Admin control panel renders at /admin with no auth block (a dashboard: members/metrics/management — NOT a login page or 404). Every product MUST ship an admin portal — if none is present, mark FAIL, never na.' },
  { code: 'VT_A2', label: 'Admin Settings → Profile: fields render and look saveable' },
  { code: 'VT_A3', label: 'Admin Settings → Password: a password field with a visibility (eye) toggle is present' },
  { code: 'VT_A4', label: 'Admin Settings → Notifications: at least one notification toggle is present' },
]

async function main() {
  if (!slug || !origin) { console.error('admin-tester: --slug and --url are required'); return 2 }
  if (!apiKey) { console.error("admin-tester: ANTHROPIC_API_KEY required — recording nothing (degrade-don't-fake)"); return 1 }
  if (!adminPw) { console.error('admin-tester: QA_OWNER_PASSWORD (admin-agent password) not set — recording nothing'); return 1 }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
  const { browser, ctx } = await launch({ bypass })
  try {
    const page = await ctx.newPage()
    // Admin login first (admin portals usually gate at /admin/login behind ADMIN_EMAILS).
    const login = await tryLogin(page, origin, {
      email: adminEmail,
      password: adminPw,
      paths: ['/admin/login', '/admin', '/login', '/pipeline/login'],
    })

    // If we couldn't authenticate as admin we CAN'T tell "no portal" (a real fail) from "portal
    // exists but the admin-agent account isn't provisioned here" — so record na with the exact fix,
    // never a false fail (degrade-don't-fake). The mandatory-portal FAIL only applies post-login.
    if (!login.ok) {
      const why = `NEEDS-YOU: admin-agent login failed (${login.note}). Provision ${adminEmail} on this product (Supabase dashboard, auto-confirm) AND add it to the product's ADMIN_EMAILS, then re-run.`
      const verdicts = CHECKS.map((c) => ({ code: c.code, status: 'na', evidence: why }))
      const n = await record(slug, 'naive-tester', verdicts, deployment)
      console.log(`admin-tester: admin login failed (${login.note}) — recorded ${n} na verdict(s) with provisioning instructions for ${slug}`)
      return 0
    }

    const shots = []
    if (await goto(page, `${origin}/admin`)) shots.push(await shot(page, 'admin dashboard (/admin)'))
    // Admin settings — try the common locations.
    for (const p of ['/admin/settings', '/settings']) {
      if (await goto(page, `${origin}${p}`)) { shots.push(await shot(page, `admin settings (${p})`)); break }
    }

    if (!shots.length) { console.error('admin-tester: could not load /admin — recording nothing'); return 1 }

    const verdicts = await visionVerdicts({ apiKey, persona: 'an admin-portal QA tester (logged in as an admin)', checks: CHECKS, shots })
    const n = await record(slug, 'naive-tester', verdicts, deployment)
    console.log(`admin-tester: recorded ${n} verdict(s) for ${slug} from ${shots.length} screenshot(s) (admin login: ${login.ok ? 'ok' : login.note})`)
    return 0
  } finally {
    await browser.close()
  }
}

main().then((c) => { process.exitCode = c ?? 0 }).catch((e) => { console.error(`admin-tester error: ${e.message}`); process.exit(1) })
