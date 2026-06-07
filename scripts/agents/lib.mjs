// lib.mjs — shared driver for the CI-native browser test-agents (Option B of the validation
// orchestrator). The destination Dennis chose: a CI-native Playwright + Anthropic-vision agent that
// runs fully unattended on a plain GitHub runner (no gstack, no always-on machine). The agents walk
// a live URL, screenshot it (desktop + mobile, authed + unauthed), ask Claude to verdict the rubric
// checks it can OBSERVE, and record to readiness_results via the existing gate-check seam.
//
// Honesty contract (the whole point of this effort): a check the screenshots can't decide records
// `na` with that reason — never a guessed pass. The agent is a real, if shallow, replacement for the
// gstack naive-tester/voice-auditor; it starts narrower than gstack and widens over time. It does
// NOT fabricate a verdict.

import { chromium } from 'playwright'
import { recordReadiness } from '../gate-check.mjs'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = process.env.AGENT_VISION_MODEL || 'claude-sonnet-4-6'

export function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def
}
export const hasFlag = (name) => process.argv.includes(`--${name}`)

// Launch chromium with the Vercel deployment-protection bypass header when a secret is supplied
// (preview deploys are behind SSO otherwise). Default desktop viewport.
export async function launch({ bypass } = {}) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: bypass
      ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'samesitenone' }
      : {},
  })
  return { browser, ctx }
}

export async function goto(page, url, timeout = 45000) {
  try { await page.goto(url, { waitUntil: 'networkidle', timeout }); return true }
  catch { try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout }); return true } catch { return false } }
}

// Anthropic vision rejects any image dimension > 8000px. A full-page screenshot of a long page
// (especially a narrow mobile width that reflows very tall) blows past that — so clip tall pages to
// a safe height (top of the page, where the header/hero/nav/CTA the checks care about live).
const MAX_SHOT_PX = 7000
export async function shot(page, label) {
  const vw = (page.viewportSize?.() || {}).width || 1280
  let buf
  try {
    const h = await page
      .evaluate(() => Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0))
      .catch(() => 0)
    buf = h && h > MAX_SHOT_PX
      ? await page.screenshot({ clip: { x: 0, y: 0, width: Math.min(vw, MAX_SHOT_PX), height: MAX_SHOT_PX } })
      : await page.screenshot({ fullPage: true })
  } catch {
    try { buf = await page.screenshot() } catch { buf = Buffer.from('') }
  }
  return { label, b64: buf.toString('base64') }
}

// Best-effort form login (Mode A — also exercises the real auth path). Returns {ok, note}.
// A magic-link-only product (no password field) is reported, not faked.
export async function tryLogin(page, origin, { email, password }) {
  if (!email || !password) return { ok: false, note: 'no QA creds (TEST_USER_EMAIL/QA_USER_PASSWORD)' }
  for (const path of ['/login', '/pipeline/login', '/auth/login', '/signin']) {
    if (!(await goto(page, `${origin}${path}`))) continue
    const pw = page.locator('input[type=password]').first()
    if ((await pw.count().catch(() => 0)) === 0) continue
    const em = page.locator('input[type=email], input[name=email]').first()
    try {
      await em.fill(email)
      await pw.fill(password)
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
        page.locator('button[type=submit], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Sign In")').first().click(),
      ])
      // Heuristic: logged-in if we left the login URL.
      return { ok: !/login|signin/i.test(page.url()), note: page.url() }
    } catch (e) { return { ok: false, note: String(e.message || e).slice(0, 80) } }
  }
  return { ok: false, note: 'no password login form found (magic-link only?)' }
}

function buildPrompt(persona, checks) {
  return (
    `You are ${persona}, walking a LIVE web product through the screenshots above ` +
    `(labelled; includes desktop + mobile widths). Judge ONLY what the screenshots actually show. ` +
    `For EACH check below, return a verdict.\n\n` +
    `Return ONLY a JSON array — no prose, no markdown fences:\n` +
    `[{"code":"2","status":"pass|fail|na","evidence":"<=160 chars, concrete, cite what you saw"}]\n` +
    `Use "na" when the screenshots cannot determine the check (do NOT guess a pass). Checks:\n` +
    checks.map((c) => `- ${c.code}: ${c.label}`).join('\n')
  )
}

function parseJsonArray(text) {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try { return JSON.parse(m[0]) } catch { return [] }
}

// Ask Claude to verdict the checks from the screenshots. Throws on API error (the caller records
// nothing rather than a fake — degrade-don't-fake).
export async function visionVerdicts({ apiKey, persona, checks, shots }) {
  const content = []
  for (const s of shots) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: s.b64 } })
    content.push({ type: 'text', text: `^ screenshot: ${s.label}` })
  }
  content.push({ type: 'text', text: buildPrompt(persona, checks) })
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const text = (data.content || []).map((b) => b.text || '').join('')
  return parseJsonArray(text)
}

// Record verdicts via the shared gate-check seam (source = naive-tester | voice-auditor).
export async function record(slug, source, verdicts, deployment) {
  const checks = (verdicts || [])
    .filter((v) => v && v.code && ['pass', 'fail', 'na'].includes(v.status))
    .map((v) => ({ code: String(v.code), status: v.status, evidence: (v.evidence || '').slice(0, 300) }))
  if (!checks.length) return 0
  await recordReadiness({ slug, source, checks, deploymentId: deployment || null, recordedBy: source })
  return checks.length
}
