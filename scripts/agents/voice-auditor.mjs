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
// Integration-shape aware (PRODUCT_STANDARDS §6): "voice present" is ANY of these, and the agent is
// told ALL of them count so it never false-negatives an SDK widget against the CDN signature:
//   - the hub SDK widget — a launcher with a class CONTAINING convai (e.g. .convai-launch,
//     .convai-launch--inline, .convai-btn, .convai-panel), OR a coach launcher showing a named
//     avatar + a "Begin" / "Start a conversation" / "Talk it through" button + a 🎙️/mic affordance
//     (this is the @caistech/elevenlabs-convai React VoiceWidget shape — e.g. SayFix's "Morgan");
//   - the raw CDN <elevenlabs-convai> custom element.
// The 2026-05/06 sayfix false-negatives came from (a) only screenshotting the bare landing (where a
// product-scoped coach does NOT render) and (b) selectors that matched only the exact .convai-launch
// class, missing the BEM variants + the avatar/"Begin"/mic shape. Both are fixed below.
//
// Usage (CI): node voice-auditor.mjs --slug <slug> --url <liveUrl> [--voice-url <surfaceWhereVoiceRenders>] [--deployment <id>]
//   --voice-url: the surface where the voice agent actually mounts when it is NOT on the bare landing
//   (e.g. a product-scoped welcome like /welcome?product=<slug>, or a post-action coach surface).
//   Without it, the auditor only sees the landing — and a product whose coach is param/auth-gated
//   will read as "no voice" even though it has one. Pass this for any param/gated voice surface.
// Env: ANTHROPIC_API_KEY (required); QA_TEST_USER_EMAIL + QA_TEST_USER_PASSWORD (canonical creds for
//      the authed surface; legacy QA_USER_*/TEST_USER_* still accepted as fallback);
//      VERCEL_AUTOMATION_BYPASS_SECRET (optional).

import { arg, launch, goto, shot, tryLogin, visionVerdicts, record } from './lib.mjs'

const slug = arg('slug')
const origin = arg('url').replace(/\/$/, '')
const voiceUrl = (arg('voice-url') || '').replace(/\/$/, '')
const deployment = arg('deployment')
const apiKey = process.env.ANTHROPIC_API_KEY

const CHECKS = [
  { code: '10', label: 'Voice agent reachable from the chrome — a visible launcher/FAB <=3 clicks. ANY of these counts: a class containing "convai" (.convai-launch / .convai-launch--inline / .convai-btn / .convai-panel), an "Ask about this"/"Talk to" control, a named-coach avatar with a "Begin"/"Start a conversation"/"Talk it through" button + a 🎙️/mic affordance (the SDK VoiceWidget shape), OR a raw <elevenlabs-convai> element. Do NOT require the literal CDN element — the SDK widget counts.' },
  { code: '12', label: 'Voice agent is proactive / stage-aware — it greets or invites (e.g. a named coach saying "tap Begin and tell me…"), not just a silent dormant button' },
  { code: '13', label: 'Voice present on the key value surface (the place a user actually needs help), not only the landing page. If a --voice-url surface was screenshotted, judge presence from THAT surface, not the bare landing.' },
]

// Try to open the voice widget so the panel is in a screenshot. Best-effort across known shapes.
async function openVoice(page) {
  const selectors = [
    // SDK widget — match the class PREFIX so BEM variants (.convai-launch--inline, .convai-btn, …) hit,
    // not just the exact .convai-launch the old list missed.
    '[class*="convai-launch"]', '[class*="convai-btn"]', '[class*="convai"] button', 'elevenlabs-convai',
    // Coach launcher text shapes (the @caistech VoiceWidget "Morgan" UI + common variants).
    'button:has-text("Start a conversation")', 'button:has-text("Begin")', 'button:has-text("Talk it through")',
    'button:has-text("Ask about this")', 'button:has-text("Talk to")',
    // Mic / voice affordances by aria + emoji.
    '[aria-label*="voice" i]', '[aria-label*="microphone" i]', '[aria-label*="talk" i]',
    'button:has-text("🎙️")', 'button:has-text("🎤")', '[class*="voice" i] button',
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

    // The voice surface is often NOT the bare landing — it can be param-scoped (e.g. a SayFix
    // /welcome?product=<slug> coach) or behind a click. When the caller points us at it, screenshot
    // THERE so a param/gated coach isn't read as "no voice" (the sayfix false-negative). This is the
    // surface the #13 "key value surface" verdict should judge.
    if (voiceUrl && voiceUrl !== origin) {
      const vp = await ctx.newPage()
      if (await goto(vp, voiceUrl)) {
        shots.push(await shot(vp, 'voice surface (--voice-url) — looking for a voice launcher'))
        const opened = await openVoice(vp)
        if (opened) shots.push(await shot(vp, `voice panel opened on voice surface via ${opened}`))
      }
    }

    // The key value surface is usually behind auth — log in and look there too.
    const app = await ctx.newPage()
    const login = await tryLogin(app, origin, {
      // Canonical QA creds first (QA_TEST_USER_*), then the legacy fallbacks. Reading only the old
      // names silently failed login (creds undefined) → the auditor saw ONLY the public landing and
      // false-negatived voice that lives behind auth (the pipeline coach #10 false-negative).
      email: process.env.QA_TEST_USER_EMAIL || process.env.QA_USER_EMAIL || process.env.TEST_USER_EMAIL || process.env.QA_TEST_EMAIL,
      password: process.env.QA_TEST_USER_PASSWORD || process.env.QA_USER_PASSWORD || process.env.QA_TEST_PASSWORD,
    })
    if (login.ok) {
      shots.push(await shot(app, 'key value surface (authed) — looking for voice'))
      const opened = await openVoice(app)
      if (opened) shots.push(await shot(app, `voice panel on authed surface via ${opened}`))
      // The voice/coach surface is often BEHIND AUTH and NOT the authed root — e.g. pipeline's intake
      // coach at /pipeline/new-ideas. Visit the --voice-url surface on the AUTHED page too, so a gated
      // coach isn't read as "no voice" (the bare unauthed --voice-url visit above only gets the login wall).
      if (voiceUrl && voiceUrl !== origin && (await goto(app, voiceUrl))) {
        shots.push(await shot(app, 'voice surface (--voice-url) AUTHED — looking for voice'))
        const o2 = await openVoice(app)
        if (o2) shots.push(await shot(app, `voice panel on authed voice surface via ${o2}`))
      }
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
