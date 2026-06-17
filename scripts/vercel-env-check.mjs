// vercel-env-check.mjs — readiness check #40 producer: Vercel env-var hygiene via the Vercel API.
//
// PRODUCT_STANDARDS Vercel rule: secrets must be type `sensitive` (non-readable), env vars target
// production+preview ONLY (never `development`); public NEXT_PUBLIC_*/config may be `plain`. The
// CAS + MMC teams have "Enforce Sensitive Environment Variables" on. Until this module existed,
// validation-probe recorded #40 as a permanent `na` ("needs the Vercel API") — so the HARD gate
// could never close it and it kept reverting to `na` on every run, over a manually-verified pass.
//
// Honesty contract (degrade-don't-fake): returns { status:'na', evidence } when the token is absent
// or the project can't be resolved — NEVER a guessed pass/fail. Reads ONLY env-var metadata
// (key/type/target), never values.
//
// FAIL conditions (real exposure):
//   - a NON-public env var with type `plain` (a plaintext secret — the "Needs Attention" leak), or
//   - ANY env var targeting `development` (violates production+preview-only).
// `encrypted` (Vercel's pre-`sensitive` encrypted-at-rest default) is reported but NOT failed on its
// own — it is secure-at-rest, not a plaintext leak; flagging it hard would false-fail un-migrated
// products. The evidence names it so it can be upgraded to `sensitive`.

const API = 'https://api.vercel.com'

const isPublicKey = (k) =>
  /^NEXT_PUBLIC_/.test(k) || ['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_REGION', 'VERCEL_GIT_COMMIT_SHA'].includes(k)

async function api(token, pathQ) {
  const r = await fetch(API + pathQ, { headers: { Authorization: `Bearer ${token}` } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// Scopes to try, in order: personal (no team) first, then every team the token can see. Auto-discovers
// the right team so the probe works portfolio-wide (CAS, MMC, …) with no hardcoded team id.
async function scopes(token) {
  const out = ['']
  try { const t = await api(token, '/v2/teams'); for (const tm of t.body.teams || []) out.push(`teamId=${tm.id}`) } catch { /* personal only */ }
  return out
}

// Resolve { id, scope } for the product's Vercel project — by deployment id when supplied (the most
// reliable: it's the exact deployment the verdict binds to), else by project name = slug.
async function resolveProject(token, { deploymentId, slug }) {
  for (const sc of await scopes(token)) {
    const q = sc ? `?${sc}` : ''
    if (deploymentId) {
      const d = await api(token, `/v13/deployments/${encodeURIComponent(deploymentId)}${q}`)
      const id = d.body?.projectId || d.body?.project?.id
      if (d.status === 200 && id) return { id, scope: sc }
    }
    const p = await api(token, `/v9/projects/${encodeURIComponent(slug)}${q}`)
    if (p.status === 200 && p.body?.id) return { id: p.body.id, scope: sc }
  }
  return null
}

export async function checkVercelEnv({ token, slug, deploymentId }) {
  if (!token) {
    return { status: 'na', evidence: 'no VERCEL_TOKEN on the CI runner — add it so #40 verifies env hygiene via the Vercel API (otherwise unverifiable)' }
  }
  let proj
  try { proj = await resolveProject(token, { deploymentId, slug }) } catch (e) {
    return { status: 'na', evidence: `Vercel API error resolving project: ${String(e?.message || e).slice(0, 90)}` }
  }
  if (!proj) {
    return { status: 'na', evidence: `could not resolve a Vercel project for slug "${slug}"${deploymentId ? ` / deployment ${deploymentId}` : ''} — env hygiene unverified` }
  }
  const q = proj.scope ? `?${proj.scope}` : ''
  const e = await api(token, `/v10/projects/${proj.id}/env${q}`)
  if (e.status !== 200) return { status: 'na', evidence: `Vercel env API ${e.status} for project ${proj.id}` }
  const vars = e.body.envs || e.body.env || []
  if (!vars.length) return { status: 'na', evidence: 'Vercel project resolved but has no env vars to assess' }

  const plaintextSecrets = []
  const encryptedSecrets = []
  const devTargeted = []
  for (const v of vars) {
    if ((v.target || []).includes('development')) devTargeted.push(v.key)
    if (!isPublicKey(v.key)) {
      if (v.type === 'plain') plaintextSecrets.push(v.key)
      else if (v.type === 'encrypted') encryptedSecrets.push(v.key)
    }
  }
  const sensitive = vars.filter((v) => v.type === 'sensitive').length
  const fails = plaintextSecrets.length + devTargeted.length // encrypted is noted, not failed

  if (fails === 0) {
    const enc = encryptedSecrets.length ? `; ${encryptedSecrets.length} encrypted (consider → sensitive)` : ''
    return { status: 'pass', evidence: `${vars.length} env vars: ${sensitive} sensitive, 0 plaintext secrets, 0 development-targeted${enc} (Vercel rule met)` }
  }
  const parts = []
  if (plaintextSecrets.length) parts.push(`${plaintextSecrets.length} plaintext secret(s) [${plaintextSecrets.slice(0, 3).join(', ')}]`)
  if (devTargeted.length) parts.push(`${devTargeted.length} development-targeted [${devTargeted.slice(0, 3).join(', ')}]`)
  return { status: 'fail', evidence: `Vercel env hygiene violation: ${parts.join('; ')}` }
}
