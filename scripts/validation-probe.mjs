// validation-probe.mjs — Piece 2a: the REPO/URL producer for the validation orchestrator.
//
// Runs the deterministic checks the cockpit server can't (they need the product REPO checked out),
// then records each verdict to readiness_results via the existing gate-check.mjs seam (source=auto).
// Degrade-don't-fake: a check that can't be decided records `na`, never a fabricated pass.
//
// Covers: #35 (email sender = the verified subdomain), #36 (@caistech-first / consumes the hub),
// #37 (feature pre-flight manifest present). The BROWSER checks (naive-tester / voice-auditor) are
// NOT here — those are the agent job in validation-run.yml.
//
// Usage (from the product repo root, in CI):
//   node <shared>/scripts/validation-probe.mjs --slug <slug> --repo . --deployment <id|''> \
//        --gate-check <shared>/scripts/gate-check.mjs
// Needs the same Supabase env gate-check.mjs needs (service-role) to write.

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { checkVercelEnv } from './vercel-env-check.mjs'

function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const slug = arg('slug')
const repo = path.resolve(arg('repo', '.'))
const deployment = arg('deployment', '')
const gateCheck = arg('gate-check', path.join(path.dirname(new URL(import.meta.url).pathname), 'gate-check.mjs'))

if (!slug) { console.error('--slug required'); process.exit(1) }

// Read a repo file relative to the product repo, '' if absent.
function read(rel) {
  try { return fs.readFileSync(path.join(repo, rel), 'utf8') } catch { return '' }
}
function exists(rel) {
  try { return fs.existsSync(path.join(repo, rel)) } catch { return false }
}
// Shallow recursive grep of src/ for a regex (bounded), returns matching lines.
function grepSrc(re, max = 20) {
  const hits = []
  const walk = (dir, depth) => {
    if (depth > 6 || hits.length >= max) return
    let entries = []
    try { entries = fs.readdirSync(path.join(repo, dir), { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (hits.length >= max) return
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) { if (!/node_modules|\.next|\.git|dist/.test(e.name)) walk(rel, depth + 1) }
      else if (/\.(tsx?|jsx?|json|mjs|cjs)$/.test(e.name)) {
        const txt = read(rel)
        for (const line of txt.split('\n')) if (re.test(line)) { hits.push(`${rel}: ${line.trim().slice(0, 120)}`); if (hits.length >= max) return }
      }
    }
  }
  walk('src', 0)
  return hits
}

const results = [] // { code, status, evidence }

// #36 — @caistech-first: the repo CONSUMES the hub (deps), doesn't fork generic helpers.
const pkg = read('package.json')
let consumesHub = false
try { const j = JSON.parse(pkg || '{}'); consumesHub = Object.keys({ ...j.dependencies, ...j.devDependencies }).some((d) => d.startsWith('@caistech/')) } catch {}
results.push({ code: '36', status: consumesHub ? 'pass' : 'na', evidence: consumesHub ? 'package.json consumes @caistech/* (hub-first)' : 'no @caistech/* dependency detected — cannot assert fork-cleanliness from the repo alone' })

// #37 — feature pre-flight: a feature-manifests/ dir with at least one manifest.
const hasManifests = exists('feature-manifests') && (() => { try { return fs.readdirSync(path.join(repo, 'feature-manifests')).some((f) => f.endsWith('.json')) } catch { return false } })()
results.push({ code: '37', status: hasManifests ? 'pass' : 'fail', evidence: hasManifests ? 'feature-manifests/*.json present' : 'no feature-manifests/*.json found' })

// #35 — email SENDER is the verified subdomain, never the bare apex. Match only genuine SENDER
// contexts (a from:/"from": field, a noreply@ address, or a Resend send) and EXCLUDE the admin
// allowlist — `dennis@corporateaisolutions.com` in ADMIN_EMAILS is a LOGIN IDENTITY, not a sender.
// The old broad `email` keyword matched `ADMIN_EMAILS`, false-failing every product with an admin
// allowlist (sayfix 2026-06-15).
const senderCtx = (l) => /\bfrom\s*:|["'`]from["'`]\s*:|\bsender\b|noreply@|resend\.emails/i.test(l)
const adminAllowlist = (l) => /admin_?emails|allowlist|operator|isadmin/i.test(l)
const apexHits = grepSrc(/(?<!updates\.)corporateaisolutions\.com/i, 8).filter((l) => senderCtx(l) && !adminAllowlist(l))
const verifiedHits = grepSrc(/updates\.corporateaisolutions\.com/i, 8)
let emailStatus = 'na', emailEvidence = 'no hardcoded sender domain found in src/'
if (apexHits.length > 0) { emailStatus = 'fail'; emailEvidence = `bare-apex sender ref(s): ${apexHits[0]}` }
else if (verifiedHits.length > 0) { emailStatus = 'pass'; emailEvidence = `verified subdomain sender (${verifiedHits.length} ref(s))` }
results.push({ code: '35', status: emailStatus, evidence: emailEvidence })

// --- VT_D scaffold checks (the §8.5/§9.5 scaffold layer).
// VT_D1 (ADMIN_EMAILS) + VT_D4/D5/D6 (profiles table / trigger / RLS) are NOW OWNED SOLELY by the
// config-fixer (the config lane), which verifies them against LIVE infra (the Vercel env + the
// Supabase DB) and APPLIES the remediation. The repo-probe USED to also emit them from the repo
// (grep ADMIN_EMAILS / a profiles migration FILE), but: (a) the config-fixer applies the profiles
// migration straight to the DB — there is NO migration file in the product repo to grep — and (b)
// the ADMIN_EMAILS grep missed env-set operators. So the repo-probe's verdicts were FALSE FAILS that
// flip-flopped with the config-fixer's passes every round (both source=auto, latest-write-wins → the
// card oscillated). Removed here so the config-fixer is the SINGLE source of truth for these four.
// (D2/D3 remain na runtime cross-refs; D7 mirrors the repo-side #35 email-sender check, kept below.)

// VT_D7 — email infrastructure = the verified-subdomain sender (mirrors #35).
results.push({ code: 'VT_D7', status: emailStatus, evidence: `email sender: ${emailEvidence}` })

// VT_D2 / VT_D3 — runtime/browser, not repo-determinable → cross-referenced (na, never faked).
results.push({ code: 'VT_D2', status: 'na', evidence: 'test-user existence is runtime — verified by the user-tester login (VT_B), not the repo probe' })
results.push({ code: 'VT_D3', status: 'na', evidence: 'non-admin /admin block is browser-verified (= VT_B2), not the repo probe' })

// #39 — no secrets committed in src/ (a literal service-role JWT, Anthropic/Stripe key, or a
// hardcoded SERVICE_ROLE_KEY). Conservative + low-false-positive: example/placeholder lines excluded.
// (Was reverify-headless with no producer → permanently unknown; repo-grep is the right home.)
const secretHits = grepSrc(/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`]?eyJ|sk-ant-[A-Za-z0-9-]{20,}|sk_live_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{10,}/i, 8)
  .filter((l) => !/example|placeholder|your[-_]?(key|token)|xxxx|\.env\.example|process\.env\./i.test(l))
results.push({ code: '39', status: secretHits.length > 0 ? 'fail' : 'pass',
  evidence: secretHits.length > 0 ? `possible committed secret in src/: ${secretHits[0].slice(0, 90)}` : 'no hardcoded service-role JWT / API key found in src/' })

// #40 — Vercel env vars sensitive + prod/preview only. Verified live via the Vercel API when a
// VERCEL_TOKEN is on the runner (auto-discovers the team scope; resolves the project by deployment
// id, else by name=slug). Degrade-don't-fake to `na` when the token is absent or the project can't
// be resolved — never a guessed pass. This ends the permanent `na` that kept the HARD gate open.
const vercel = await checkVercelEnv({ token: process.env.VERCEL_TOKEN, slug, deploymentId: deployment })
results.push({ code: '40', status: vercel.status, evidence: vercel.evidence })

// P4 — the TOO-MUCH guard (THIN_MVP_RUBRIC). INFORMATIONAL + NON-BLOCKING + NEVER a regression
// signal: it flags when the repo has built SCALE INFRASTRUCTURE (billing/metering, multi-tenant/org,
// team-admin) — pre-GO, that is the "this product has built beyond the thin-MVP requirements"
// heads-up. A `fail` here does NOT mean strip features; the scorer files it under tooMuch (excluded
// from the HARD gate + the weighted score), the conductor never routes it to a fix lane, and the UI
// shows it as a warning, not a defect. `pass` = within thin-MVP scope (no scale-infra). This is the
// repo "scale-infra heuristic" the survey's P4 placeholder deferred to.
const p4Deps = (() => { try { const j = JSON.parse(pkg || '{}'); return Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}) }) } catch { return [] } })()
const scaleSignals = []
if (p4Deps.includes('stripe') || grepSrc(/\bstripe\b|checkout\.session|usage-?meter|per-seat|metered\b/i, 1).length) scaleSignals.push('billing/metering')
if (grepSrc(/organisation_members|\borganisations\b|tenant_id|multi-?tenant|white-?label/i, 1).length) scaleSignals.push('multi-tenant/org')
if (exists('src/app/admin') && grepSrc(/\binvite\b|\bmembers?\b|\brole\b/i, 1).length) scaleSignals.push('team-admin')
const p4Over = scaleSignals.length > 0
results.push({
  code: 'P4',
  status: p4Over ? 'fail' : 'pass',
  evidence: p4Over
    ? `Heads-up (non-blocking, NOT a regression signal): built beyond the thin-MVP requirements — scale-infra present in the repo: ${scaleSignals.join(', ')}.`
    : 'Within thin-MVP scope — no scale-infra (billing / multi-tenant / team-admin) detected in the repo.',
})

// --- Voice integration code checks (#11/#16/#17), CONDITIONAL on the product actually using
// ElevenLabs/convai. Only recorded when voice is present; otherwise left to the scorer's
// applies_when (na). These are the repo-grep CI producer for the voice CODE checks the local
// gstack voice-auditor used to record — so they re-verify automatically after a code-lane fix.
let pkgJson = {}; try { pkgJson = JSON.parse(pkg || '{}') } catch {}
const deps = Object.keys({ ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) })
const usesVoice = deps.includes('@caistech/elevenlabs-convai') || deps.includes('@11labs/client') ||
  exists('src/app/api/webhooks/elevenlabs') || grepSrc(/elevenlabs|convai/i, 1).length > 0
if (usesVoice) {
  const codeOf = (l) => l.slice(l.indexOf(': ') + 2) // grepSrc lines are "rel: <trimmed code>"
  const notComment = (c) => !/^\s*(\/\/|\*|\/\*)/.test(c)

  // #11 — consumes the @caistech hub AND no client-side key exposure.
  const hasHub = deps.includes('@caistech/elevenlabs-convai')
  const keyRefs = grepSrc(/NEXT_PUBLIC_ELEVENLABS_API_KEY/, 10).map(codeOf).filter(notComment)
  const keyExposed = keyRefs.length > 0
  results.push({
    code: '11',
    status: hasHub && !keyExposed ? 'pass' : 'fail',
    evidence: hasHub && !keyExposed
      ? 'consumes @caistech/elevenlabs-convai; no NEXT_PUBLIC_ELEVENLABS_API_KEY usage (server-side key)'
      : `${hasHub ? '' : 'no @caistech/elevenlabs-convai dep; '}${keyExposed ? `client key exposed: ${keyRefs[0].trim().slice(0, 70)}` : ''}`.trim(),
  })

  // collect the convai webhook route files
  const webhookFiles = []
  const walkWh = (dir) => {
    let ents = []; try { ents = fs.readdirSync(path.join(repo, dir), { withFileTypes: true }) } catch { return }
    for (const en of ents) {
      const r = path.join(dir, en.name)
      if (en.isDirectory()) { if (!/node_modules|\.next|\.git/.test(en.name)) walkWh(r) }
      else if (/route\.(t|j)sx?$/.test(en.name) && /webhooks?[\\/].*(elevenlabs|convai)/i.test(r)) webhookFiles.push(r)
    }
  }
  walkWh('src')

  // #17 — every convai webhook verifies HMAC.
  if (webhookFiles.length === 0) {
    results.push({ code: '17', status: 'na', evidence: 'no elevenlabs/convai webhook routes found' })
  } else {
    const unverified = webhookFiles.filter((f) => !/verifyWebhook|verifyElevenLabsWebhook|createHmac|timingSafeEqual|x-elevenlabs-signature/i.test(read(f)))
    results.push({
      code: '17',
      status: unverified.length === 0 ? 'pass' : 'fail',
      evidence: unverified.length === 0 ? `HMAC verify present in all ${webhookFiles.length} convai webhook(s)` : `no HMAC verify in ${unverified.length}/${webhookFiles.length} (e.g. ${unverified[0]})`,
    })
  }

  // #16 — identity server-derived, not read from client conversation metadata. SCOPED to the VOICE
  // files only: Stripe etc. legitimately read session.metadata.user_id — that's not the convai
  // identity issue, and grepping all of src/ false-fails on it.
  const voiceCodeFiles = []
  const walkVoice = (dir) => {
    let ents = []; try { ents = fs.readdirSync(path.join(repo, dir), { withFileTypes: true }) } catch { return }
    for (const en of ents) {
      const r = path.join(dir, en.name)
      if (en.isDirectory()) { if (!/node_modules|\.next|\.git/.test(en.name)) walkVoice(r) }
      else if (/\.(t|j)sx?$/.test(en.name) && /(^|[\\/])(voice|elevenlabs|convai)/i.test(r)) voiceCodeFiles.push(r)
    }
  }
  walkVoice('src')
  const badIdRead = voiceCodeFiles.find((f) => read(f).split('\n').some((ln) => /metadata.{0,3}(user_id|company_id)/i.test(ln) && notComment(ln.trim())))
  const serverBind = voiceCodeFiles.some((f) => /voice_sessions|conversation_id/i.test(read(f)))
  results.push({
    code: '16',
    status: badIdRead ? 'fail' : serverBind ? 'pass' : 'na',
    evidence: badIdRead
      ? `voice identity read from client metadata (${badIdRead})`
      : serverBind ? 'identity bound server-side (voice_sessions / conversation_id), not client metadata'
      : 'no voice identity-binding pattern found in voice files',
  })
}

// --- record each via gate-check.mjs record-readiness (the shared seam) ---
const checksArg = results.map((r) => `${r.code}=${r.status}`).join(',')
console.log('[validation-probe] results:', JSON.stringify(results, null, 2))
try {
  const a = [gateCheck, 'record-readiness', slug, '--source', 'auto', '--checks', checksArg]
  if (deployment) a.push('--deployment', deployment); else a.push('--no-deployment')
  execFileSync('node', a, { stdio: 'inherit' })
  console.log('[validation-probe] recorded', results.length, 'verdicts for', slug)
} catch (err) {
  console.error('[validation-probe] record failed:', err instanceof Error ? err.message : err)
  process.exit(1)
}
