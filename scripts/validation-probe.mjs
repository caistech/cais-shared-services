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

// #35 — email sender is the verified subdomain, never the bare apex.
const apexHits = grepSrc(/(?<!updates\.)corporateaisolutions\.com/i, 8).filter((l) => /from|sender|noreply|email|resend/i.test(l))
const verifiedHits = grepSrc(/updates\.corporateaisolutions\.com/i, 8)
let emailStatus = 'na', emailEvidence = 'no hardcoded sender domain found in src/'
if (apexHits.length > 0) { emailStatus = 'fail'; emailEvidence = `bare-apex sender ref(s): ${apexHits[0]}` }
else if (verifiedHits.length > 0) { emailStatus = 'pass'; emailEvidence = `verified subdomain sender (${verifiedHits.length} ref(s))` }
results.push({ code: '35', status: emailStatus, evidence: emailEvidence })

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
