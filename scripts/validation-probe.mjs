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

// --- VT_D scaffold checks (the §8.5/§9.5 scaffold layer). D1/D4/D5/D6/D7 are determinable from the
// repo + migrations; D2/D3 are runtime/browser → left to the user-tester (VT_B), na here with the
// cross-reference (degrade-don't-fake). Built 2026-06-15 — these had NO producer before, so they sat
// `unknown` forever and the gate could never go green.
function readMigrations() {
  const dir = 'supabase/migrations'
  let out = ''
  try { for (const f of fs.readdirSync(path.join(repo, dir)).sort()) if (f.endsWith('.sql')) out += '\n' + read(path.join(dir, f)) } catch {}
  return out
}
const migrations = readMigrations()
const mig = (re) => re.test(migrations)

// VT_D1 — ADMIN_EMAILS includes the two operator identities (§9.5).
const adminEmailsHits = grepSrc(/ADMIN_EMAILS/i, 8).join('\n')
const hasOps = /dennis@corporateaisolutions\.com/i.test(adminEmailsHits) && /mcmdennis@gmail\.com/i.test(adminEmailsHits)
results.push({ code: 'VT_D1', status: !adminEmailsHits ? 'fail' : (hasOps ? 'pass' : 'fail'),
  evidence: !adminEmailsHits ? 'no ADMIN_EMAILS reference found in src/' : (hasOps ? 'ADMIN_EMAILS references both operator identities' : 'ADMIN_EMAILS present but an operator identity is missing') })

// VT_D4 — profiles table defined in migrations.
const hasProfiles = mig(/create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?["']?profiles["']?/i)
results.push({ code: 'VT_D4', status: !migrations ? 'na' : (hasProfiles ? 'pass' : 'fail'),
  evidence: !migrations ? 'no supabase/migrations — cannot verify the profiles table from the repo' : (hasProfiles ? 'profiles table created in migrations' : 'no `create table profiles` found in migrations') })

// VT_D5 — on_auth_user_created trigger fires on signup.
const hasTrigger = mig(/on_auth_user_created/i)
results.push({ code: 'VT_D5', status: !migrations ? 'na' : (hasTrigger ? 'pass' : 'fail'),
  evidence: !migrations ? 'no migrations' : (hasTrigger ? 'on_auth_user_created trigger present' : 'no on_auth_user_created trigger in migrations') })

// VT_D6 — RLS on the profiles table (own-row).
const hasRls = mig(/["']?profiles["']?\s+enable\s+row\s+level\s+security/i) || (/create\s+policy/i.test(migrations) && /on\s+(public\.)?["']?profiles/i.test(migrations))
results.push({ code: 'VT_D6', status: !migrations ? 'na' : (hasRls ? 'pass' : 'fail'),
  evidence: !migrations ? 'no migrations' : (hasRls ? 'RLS enabled / policy on profiles' : 'no RLS or policy on profiles in migrations') })

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

// #40 — Vercel env vars sensitive + prod/preview only. NOT repo-determinable (needs the Vercel API),
// so na here with the reason; it's produced by the pipeline's headless rescore (which has Vercel
// access), never faked.
results.push({ code: '40', status: 'na', evidence: 'Vercel env-var sensitivity needs the Vercel API — produced by the cockpit headless rescore, not the repo probe' })

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
