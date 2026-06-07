// voice-auditor.mjs — Option B CI-native voice-auditor (Playwright + Anthropic vision).
//
// Closes the long-standing "voice-auditor writes NOTHING to readiness_results" gap (2c): it walks
// the live product, looks for the voice agent launcher, clicks it, screenshots the opened panel, and
// verdicts the BROWSER-OBSERVABLE voice checks via Claude — then records them via gate-check
// (source=voice-auditor). The behavioural memory-loop checks (#14 welcome-back recall, #15/#20
// memory internals) need a multi-session behavioural run and the repo; v1 records those as `na` with
// that reason rather than guessing. The voice-INTEGRATION checks (#11/#16/#17/#18/#19) are repo/config
// (validation-probe + config-fixer), not browser — not in scope here.
//
// Integration-shape aware (PRODUCT_STANDARDS §6): "voice present" = an SDK launcher renders
// (.convai-launch / .convai-btn / an "Ask about this" control) OR the raw CDN <elevenlabs-convai>
// element — either counts; the agent is told both shapes are valid so it doesn't false-negative an
// SDK widget against the CDN signature.
//
// Usage (CI): node voice-auditor.mjs --slug <slug> --url <liveUrl> [--deployment <id>]
// Env: ANTHROPIC_API_KEY (required); TEST_USER_EMAIL + QA_USER_PASSWORD (optional, authed surface);
//      VERCEL_AUTOMATION_BYPASS_SECRET (optional).

import { arg, launch, goto, shot, tryLogin, visionVerdicts, record } from './lib.mjs'

const slug = arg('slug')
const origin = arg('url').replace(/\/$/, '')
const deployment = arg('deployment')
const apiKey = process.env.ANTHROPIC_API_KEY

const CHECKS = [
  { code: '10', label: 'Voice agent reachable from the chrome — a visible launcher/FAB/"Ask about this" control, <=3 clicks (SDK .convai-launch/.convai-btn OR a raw <elevenlabs-convai> element both count)' },
  { code: '12', label: 'Voice agent is proactive / stage-aware — it greets or invites, not just a silent dormant button' },
  { code: '13', label: 'Voice present on the key value surface (the place a user actually needs help), not only the landing page' },
]

// Try to open the voice widget so the panel is in a screenshot. Best-effort across known shapes.
async function openVoice(page) {
  const selectors = [
    '.convai-launch', '.convai-btn', 'button:has-text("Ask about this")', 'button:has-text("Talk to")',
    '[aria-label*="voice" i]', 'elevenlabs-convai', '[class*="voice" i] button',
  ]
  for (const sel of selectors) {
    const el = page.locator(sel).first()
    if ((await el.count().catch(() => 0)) > 0) {
      try { await el.click({ timeout: 4000 }); await page.waitForTimeout(1200); return sel } catch { /* try next */ }
    }
  }
  return null
}

async function main() {
  if (!slug || !origin) { console.error('voice-auditor: --slug and --url are required'); return 2 }
  if (!apiKey) { console.error("voice-auditor: ANTHROPIC_API_KEY required — recording nothing (degrade-don't-fake)"); return 1 }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
  const { browser, ctx } = await launch({ bypass })
  try {
    const shots = []
    const landing = await ctx.newPage()
    if (await goto(landing, origin)) {
      shots.push(await shot(landing, 'landing — looking for a voice launcher'))
      const opened = await openVoice(landing)
      if (opened) shots.push(await shot(landing, `voice panel opened via ${opened}`))
    }

    // The key value surface is usually behind auth — log in and look there too.
    const app = await ctx.newPage()
    const login = await tryLogin(app, origin, {
      email: process.env.TEST_USER_EMAIL || process.env.QA_TEST_EMAIL,
      password: process.env.QA_USER_PASSWORD || process.env.QA_TEST_PASSWORD,
    })
    if (login.ok) {
      shots.push(await shot(app, 'key value surface (authed) — looking for voice'))
      const opened = await openVoice(app)
      if (opened) shots.push(await shot(app, `voice panel on authed surface via ${opened}`))
    }

    if (!shots.length) { console.error('voice-auditor: could not load any page — recording nothing'); return 1 }

    const verdicts = await visionVerdicts({ apiKey, persona: 'a voice-agent placement auditor', checks: CHECKS, shots })
    const n = await record(slug, 'voice-auditor', verdicts, deployment)
    console.log(`voice-auditor: recorded ${n} verdict(s) for ${slug} from ${shots.length} screenshot(s)`, login.ok ? '(incl. authed surface)' : `(login: ${login.note})`)
    return 0
  } finally {
    await browser.close()
  }
}

main().then((c) => { process.exitCode = c ?? 0 }).catch((e) => { console.error(`voice-auditor error: ${e.message}`); process.exit(1) })
