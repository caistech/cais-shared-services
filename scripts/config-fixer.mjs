#!/usr/bin/env node
/**
 * config-fixer.mjs — the CONFIG-lane remediation dispatcher (FIXER_LANES.md §3).
 *
 * The config analog of design-build (code lane) + validation-probe (the producer). Given a
 * product's failing CONFIG-lane readiness checks, it routes each to an idempotent infra handler,
 * runs it (DRY-RUN by default; --apply to mutate), and records the new verdict to
 * `readiness_results` via the gate-check seam — so the card reflects the fix.
 *
 * THE CONTRACT (every handler honours it — FIXER_LANES.md §3):
 *   1. Idempotent — safe to re-run; converges to the desired state.
 *   2. Dry-run → confirm → execute. Nothing mutates without --apply.
 *   3. Verify the target ref/project FIRST and print it (multiple live DBs/projects exist).
 *   4. Additive / non-destructive by default; never a silent DROP/destructive ALTER.
 *   5. Never pipes secret VALUES through logs — only the management token is handled.
 *   6. Reports a verdict to readiness_results (source=auto), bound to the live deployment.
 *
 * THE GOLDEN RULE: a check the machine cannot complete (missing BYOK key, no resolvable ref)
 * is recorded as `fail` with evidence `NEEDS-YOU: <what to do>` — never a silent na, never a
 * fake pass. The card renders those in its "Needs you" lane.
 *
 * Usage:
 *   node config-fixer.mjs --slug deal-findrs                 # dry-run, auto-pick failing config checks
 *   node config-fixer.mjs --slug deal-findrs --checks 40,35  # dry-run, specific checks
 *   node config-fixer.mjs --slug deal-findrs --apply         # MUTATE (idempotent)
 *   node config-fixer.mjs --slug deal-findrs --apply --only 40   # one handler, live
 *
 * Cred resolution (local-run friendly; a handler with no resolvable cred → needs-you):
 *   - product env:  <PORTFOLIO_BASE>/<slug>/.env.local  (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                   ELEVENLABS_API_KEY, NEXT_PUBLIC_ELEVENLABS_AGENT_*, ADMIN_EMAILS, ...)
 *   - manifest:     portfolio-manifest.yaml (vercel_project_id, supabase_project_ref)
 *   - tokens:       VERCEL_TOKEN | ~/.vercel-token ;  SUPABASE_MANAGEMENT_TOKEN|SUPABASE_ACCESS_TOKEN | ~/.supabase-token
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { recordReadiness, getLiveProductionDeployment, resolveGatesCreds } from './gate-check.mjs'

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))
const HUB_ROOT = resolvePath(SCRIPTS_DIR, '..')
const PORTFOLIO_BASE = process.env.PORTFOLIO_BASE ?? resolvePath(HUB_ROOT, '..')
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID ?? 'team_hwN7IFtd2Fo3DCj9C67ZwI1t'

// The CONFIG-lane checks this dispatcher knows how to handle (FIXER_LANES.md §3 map).
// Each maps to a handler below. Anything config-lane WITHOUT a handler still surfaces as
// needs-you (never silently skipped).
const CONFIG_CHECKS = new Set(['40', '35', '18', '19', '28', 'VT_D1', 'VT_D2', 'VT_D3', 'VT_D4', 'VT_D5', 'VT_D6', 'VT_D7'])

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def
}
const has = (name) => process.argv.includes(`--${name}`)

const slug = arg('slug')
const apply = has('apply')
const only = arg('only') // run a single check code
const explicitChecks = arg('checks') // comma list
let deployment = arg('deployment')

if (!slug) { console.error('config-fixer: --slug <product> required'); process.exit(2) }

// ---------------------------------------------------------------------------
// cred + context resolution
// ---------------------------------------------------------------------------
function parseEnvFile(file) {
  const out = {}
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      out[m[1]] = v
    }
  } catch { /* absent */ }
  return out
}

function vercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN.trim()
  try { return readFileSync(join(homedir(), '.vercel-token'), 'utf8').trim() } catch { return null }
}
function supabaseMgmtToken() {
  return (
    process.env.SUPABASE_MANAGEMENT_TOKEN ||
    process.env.SUPABASE_ACCESS_TOKEN ||
    (() => { try { return readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim() } catch { return null } })()
  )
}

// manifest lookup (vercel_project_id, supabase_project_ref) — dependency-free YAML peek.
function manifestEntry(slug) {
  const file = join(HUB_ROOT, 'portfolio-manifest.yaml')
  let txt = ''
  try { txt = readFileSync(file, 'utf8') } catch { return {} }
  const lines = txt.split('\n')
  const i = lines.findIndex((l) => new RegExp(`^\\s*-\\s*name:\\s*["']?${slug}["']?\\s*$`).test(l))
  if (i < 0) return {}
  const out = {}
  for (let j = i + 1; j < lines.length && !/^\s*-\s*name:/.test(lines[j]); j++) {
    const m = lines[j].match(/^\s*([a-z_]+):\s*["']?([^"'\n]+?)["']?\s*$/)
    if (m && ['vercel_project_id', 'supabase_project_ref'].includes(m[1])) out[m[1]] = m[2]
  }
  return out
}

// Resolve the product repo dir: --repo-dir override, else PORTFOLIO_BASE/<slug>, else a
// case-insensitive / de-hyphenated scan (slug "deal-findrs" → dir "DealFindrs").
function resolveRepoDir(slug) {
  const override = arg('repo-dir')
  if (override) return override
  const direct = join(PORTFOLIO_BASE, slug)
  if (existsSync(direct)) return direct
  try {
    const want = slug.replace(/[-_]/g, '').toLowerCase()
    const hit = readdirSync(PORTFOLIO_BASE, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .find((e) => e.name.replace(/[-_]/g, '').toLowerCase() === want)
    if (hit) return join(PORTFOLIO_BASE, hit.name)
  } catch { /* fall through */ }
  return direct
}

// Pull a product's env from its Vercel project using the workspace token — so the fixer runs in
// CI / from the phone, not just where the local .env.local lives. Recovers PLAIN vars (the list
// endpoint returns their values): NEXT_PUBLIC_* URLs, agent ids, ADMIN_EMAILS. SENSITIVE vars are
// non-readable by design (that's the point) and are NOT returned — the genuinely-secret values come
// from the Supabase Management API (service key) or a workspace CI secret (ELEVENLABS_API_KEY).
async function pullVercelEnv(projectId, token) {
  const out = {}
  if (!token) return out
  try {
    const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env?teamId=${VERCEL_TEAM_ID}&decrypt=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return out
    const { envs } = await res.json()
    for (const e of envs || []) if (typeof e.value === 'string' && e.value.length) out[e.key] = e.value
  } catch { /* best-effort */ }
  return out
}

// Fetch a project's CURRENT service_role key from the Supabase Management API (workspace token).
// More reliable than a possibly-stale .env.local copy — this is what auto-fixes the deal-findrs
// VT_D2/D3 failure (its committed legacy key was disabled when Supabase rotated to sb_secret_).
async function fetchSupabaseServiceKey(ref, mgmtToken) {
  if (!ref || !mgmtToken) return ''
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: { Authorization: `Bearer ${mgmtToken}` } })
    if (!res.ok) return ''
    const keys = await res.json()
    const svc = Array.isArray(keys) ? keys.find((k) => k.name === 'service_role') : null
    return svc?.api_key || ''
  } catch { return '' }
}

async function resolveContext(slug) {
  const repoDir = resolveRepoDir(slug)
  const repoPresent = existsSync(repoDir)
  let env = parseEnvFile(join(repoDir, '.env.local'))
  const mani = manifestEntry(slug)
  const vToken = vercelToken()
  const projectId = mani.vercel_project_id || slug

  // Cloud / phone path: pull product env from Vercel when asked, when the local repo isn't here,
  // or when the local .env.local didn't yield the Supabase URL. Local .env.local wins where present.
  let pulledFrom = repoPresent ? 'local .env.local' : 'none'
  if (has('pull-vercel') || !repoPresent || !env.NEXT_PUBLIC_SUPABASE_URL) {
    const pulled = await pullVercelEnv(projectId, vToken)
    if (Object.keys(pulled).length) {
      env = { ...pulled, ...env } // local takes precedence over pulled
      pulledFrom = repoPresent ? 'local .env.local + Vercel pull' : 'Vercel pull'
    }
  }

  let supabaseRef = mani.supabase_project_ref || ''
  if (!supabaseRef && env.NEXT_PUBLIC_SUPABASE_URL) {
    const m = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)
    if (m) supabaseRef = m[1]
  }

  const sbToken = supabaseMgmtToken()
  // Operator-maintained local key first (authoritative on the operator's machine); fall back to the
  // CURRENT key from the Management API (the cloud/no-local path, and handles the common rotated-key
  // case). For a product migrated to the new sb_secret_ format whose legacy key is disabled, BOTH may
  // be the dead key — the handler then records an honest needs-you (never a fake pass).
  let supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || ''
  if (!supabaseServiceKey) supabaseServiceKey = await fetchSupabaseServiceKey(supabaseRef, sbToken)

  return {
    slug,
    repoDir,
    repoPresent,
    pulledFrom,
    env,
    vercelProjectId: projectId,
    supabaseRef,
    supabaseServiceKey,
    // EL key: product BYOK key (plain/public mirror is readable via pull) or a workspace CI secret.
    elevenKey: env.ELEVENLABS_API_KEY || env.NEXT_PUBLIC_ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || '',
    elevenAgents: Object.entries(env).filter(([k]) => /ELEVENLABS_AGENT/i.test(k)).map(([, v]) => v).filter(Boolean),
    adminEmails: env.ADMIN_EMAILS || '',
    vercelToken: vToken,
    supabaseToken: sbToken,
  }
}

// ---------------------------------------------------------------------------
// readiness state (which config checks are failing) — via the cockpit ledger
// ---------------------------------------------------------------------------
async function rest(path, opts = {}) {
  const { url, key } = resolveGatesCreds()
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const t = await res.text()
  let j; try { j = t ? JSON.parse(t) : null } catch { j = t }
  if (!res.ok) throw new Error(`REST ${res.status}: ${typeof j === 'string' ? j : JSON.stringify(j)}`)
  return j
}

async function failingConfigChecks(slug) {
  const [crit, results] = await Promise.all([
    rest('readiness_criteria?select=code,check_label,fixer,tier'),
    rest(`readiness_results?product_slug=eq.${encodeURIComponent(slug)}&select=check_code,status,scored_at&order=scored_at.desc`),
  ])
  const latest = new Map()
  for (const r of results) if (!latest.has(r.check_code)) latest.set(r.check_code, r.status)
  const configCrit = crit.filter((c) => c.fixer === 'config')
  // failing OR unknown (no pass recorded) — both want remediation.
  return configCrit
    .filter((c) => latest.get(c.code) !== 'pass')
    .map((c) => ({ code: c.code, label: c.check_label, tier: c.tier, status: latest.get(c.code) || 'unknown' }))
}

// ---------------------------------------------------------------------------
// Vercel helpers (token-only ops; never decrypts values)
// ---------------------------------------------------------------------------
async function vercel(path, ctx, opts = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://api.vercel.com${path}${sep}teamId=${VERCEL_TEAM_ID}`, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${ctx.vercelToken}`, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const t = await res.text()
  let j; try { j = t ? JSON.parse(t) : null } catch { j = t }
  if (!res.ok) throw new Error(`Vercel ${res.status}: ${typeof j === 'string' ? j : JSON.stringify(j)}`)
  return j
}

// ---------------------------------------------------------------------------
// handlers — each returns { status:'pass'|'fail'|'needs-you', evidence }
// They MUST NOT mutate unless `apply` is true.
// ---------------------------------------------------------------------------

// #40 — Vercel env hygiene: secrets must be `sensitive` (not `encrypted`), and NO var may
// target `development`. Dropping the development target needs no value (PATCH targets).
// Converting encrypted→sensitive requires delete+recreate (value needed) — done only when the
// value is available in the product .env.local; otherwise that var is surfaced as needs-you.
async function fix_40(ctx) {
  if (!ctx.vercelToken) return { status: 'needs-you', evidence: 'NEEDS-YOU: no VERCEL_TOKEN (set VERCEL_TOKEN or ~/.vercel-token) to harden Vercel env.' }
  const { envs } = await vercel(`/v9/projects/${encodeURIComponent(ctx.vercelProjectId)}/env`, ctx)
  const all = envs || []
  const devTargeted = all.filter((e) => Array.isArray(e.target) && e.target.includes('development'))
  const looseSecrets = all.filter((e) => e.type === 'encrypted') // should be 'sensitive'
  if (devTargeted.length === 0 && looseSecrets.length === 0) {
    return { status: 'pass', evidence: `Vercel env clean: 0 development-targeted, 0 non-sensitive secrets (${all.length} vars).` }
  }
  const plan = `Plan: drop development target from ${devTargeted.length} var(s); convert ${looseSecrets.length} encrypted→sensitive.`
  if (!apply) return { status: 'fail', evidence: `${plan} (dry-run — re-run with --apply)` }

  let droppedDev = 0, converted = 0, unconvertible = []
  for (const e of devTargeted) {
    const target = e.target.filter((t) => t !== 'development')
    if (target.length === 0) continue // a dev-only row: leave to the convert/delete pass below
    await vercel(`/v10/projects/${encodeURIComponent(ctx.vercelProjectId)}/env/${e.id}`, ctx, { method: 'PATCH', body: { target } })
    droppedDev++
  }
  for (const e of looseSecrets) {
    const value = ctx.env[e.key]
    if (!value) { unconvertible.push(e.key); continue }
    await vercel(`/v9/projects/${encodeURIComponent(ctx.vercelProjectId)}/env/${e.id}`, ctx, { method: 'DELETE' })
    await vercel(`/v10/projects/${encodeURIComponent(ctx.vercelProjectId)}/env`, ctx, {
      method: 'POST',
      body: { key: e.key, value, type: 'sensitive', target: ['production', 'preview'] },
    })
    converted++
  }
  if (unconvertible.length) {
    return { status: 'needs-you', evidence: `NEEDS-YOU: dropped ${droppedDev} dev target(s), converted ${converted}; cannot convert ${unconvertible.length} secret(s) without their value (not in .env.local): ${unconvertible.join(', ')}. Add them to .env.local or recreate as sensitive in Vercel.` }
  }
  return { status: 'pass', evidence: `Hardened: dropped ${droppedDev} dev target(s), converted ${converted} secret(s)→sensitive.` }
}

// VT_D1 — ADMIN_EMAILS present, sensitive, prod+preview, with the standard operators.
async function fix_VT_D1(ctx) {
  if (!ctx.vercelToken) return { status: 'needs-you', evidence: 'NEEDS-YOU: no VERCEL_TOKEN to set ADMIN_EMAILS.' }
  const { envs } = await vercel(`/v9/projects/${encodeURIComponent(ctx.vercelProjectId)}/env`, ctx)
  const row = (envs || []).find((e) => e.key === 'ADMIN_EMAILS')
  const STANDARD = 'dennis@corporateaisolutions.com,mcmdennis@gmail.com,dennis+qaadmin@factory2key.com.au'
  // ENSURE the standard accounts (esp. the admin-AGENT that runs the admin checks) are present.
  // UNION with any known custom admins — do NOT just preserve the existing value: preserving left
  // the agent out of ADMIN_EMAILS on every product, so VT_A1 (admin portal access) failed forever
  // and the gated admin checks (VT_A5/A6) could never even run. Vercel sensitive values are
  // non-readable, so when we can't see the current value we (re)set the union to GUARANTEE the agent.
  const existing = (ctx.adminEmails || '').split(',').map((s) => s.trim()).filter(Boolean)
  const value = Array.from(new Set([...existing, ...STANDARD.split(',')])).join(',')
  const includesAllStandard = existing.length > 0 && STANDARD.split(',').every((e) => existing.includes(e))
  const okMeta = row && row.type === 'sensitive' && Array.isArray(row.target) && row.target.includes('production') && row.target.includes('preview') && !row.target.includes('development')
  if (row && okMeta && includesAllStandard) return { status: 'pass', evidence: `ADMIN_EMAILS present, sensitive, prod+preview, includes the standard admin accounts (incl. the admin-AGENT).` }
  if (!apply) return { status: 'fail', evidence: `Plan: ${row ? 'recreate' : 'create'} ADMIN_EMAILS sensitive/prod+preview. (dry-run — --apply)` }
  if (row) await vercel(`/v9/projects/${encodeURIComponent(ctx.vercelProjectId)}/env/${row.id}`, ctx, { method: 'DELETE' })
  await vercel(`/v10/projects/${encodeURIComponent(ctx.vercelProjectId)}/env`, ctx, { method: 'POST', body: { key: 'ADMIN_EMAILS', value, type: 'sensitive', target: ['production', 'preview'] } })
  return { status: 'pass', evidence: `ADMIN_EMAILS set (sensitive, prod+preview). Redeploy to take effect.` }
}

// #35 / VT_D7 — email infra: brand the 5 Supabase auth templates (Resend) via the generic script.
async function fix_email(ctx) {
  if (!ctx.supabaseRef) return { status: 'needs-you', evidence: 'NEEDS-YOU: no Supabase ref resolvable (manifest or product .env.local NEXT_PUBLIC_SUPABASE_URL) — cannot configure email templates.' }
  if (!ctx.supabaseToken) return { status: 'needs-you', evidence: 'NEEDS-YOU: no Supabase management token (~/.supabase-token or SUPABASE_MANAGEMENT_TOKEN) to configure email templates.' }
  const display = ctx.slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const script = join(SCRIPTS_DIR, 'configure-email-templates.sh')
  const args = [script, display, ctx.supabaseRef]
  if (!apply) args.push('--dry-run')
  try {
    const out = execFileSync('bash', args, { encoding: 'utf8', env: { ...process.env, SUPABASE_MANAGEMENT_TOKEN: ctx.supabaseToken } })
    return { status: 'pass', evidence: `Email templates ${apply ? 'configured' : 'dry-run planned'} on ${ctx.supabaseRef}: ${out.trim().split('\n').slice(-1)[0].slice(0, 100)}` }
  } catch (e) {
    return { status: 'fail', evidence: `configure-email-templates failed: ${(e.stderr || e.message || '').toString().slice(0, 160)}` }
  }
}

// VT_D2 / VT_D3 — standard QA accounts via the manifest-driven provisioner.
async function fix_qa_accounts(ctx) {
  const script = join(SCRIPTS_DIR, 'provision-qa-accounts.mjs')
  const args = [script, '--slug', ctx.slug]
  if (!apply) args.push('--dry-run')
  if (ctx.supabaseServiceKey) args.push('--service-key', ctx.supabaseServiceKey)
  // spawnSync so we capture BOTH streams — the provisioner exits 0 even on per-account failures, and
  // the "Invalid API key" detail prints across stdout/stderr (degrade-don't-fake: inspect, never trust 0).
  const r = spawnSync('node', args, { encoding: 'utf8', env: { ...process.env } })
  const out = `${r.stdout || ''}\n${r.stderr || ''}`
  const errMatch = out.match(/Errors:\s*([1-9]\d*)/)
  if (r.status !== 0 && !errMatch) {
    return { status: 'needs-you', evidence: `NEEDS-YOU: QA account provisioning could not run: ${(r.stderr || out).toString().trim().slice(0, 140)}` }
  }
  if (errMatch || /Invalid API key|401/i.test(out)) {
    const why = /Invalid API key/i.test(out)
      ? 'the product Supabase service_role key is invalid/disabled (this project migrated to sb_secret_ keys) — set SUPABASE_SERVICE_ROLE_KEY in the product .env.local (or its Vercel env) to the new secret key, then re-run'
      : `${errMatch ? errMatch[1] : 'some'} account(s) failed`
    return { status: 'needs-you', evidence: `NEEDS-YOU: QA accounts could not be provisioned — ${why}.` }
  }
  return { status: 'pass', evidence: `QA accounts ${apply ? 'provisioned' : 'dry-run planned'}: ${out.trim().split('\n').filter(Boolean).slice(-1)[0].slice(0, 100)}` }
}

// #28 / VT_D4–D6 — standard profiles table + trigger + RLS, applied via the Supabase mgmt query API.
const PROFILES_SQL = `
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text, last_name text, phone text, company text, job_title text,
  email_marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update using (auth.uid() = id);
  end if;
end $$;
-- Distinct fn name so we never replace a product's own handler.
create or replace function public.cais_handle_new_user_profiles() returns trigger language plpgsql security definer set search_path = public as $fn$
begin insert into public.profiles (id) values (new.id) on conflict (id) do nothing; return new; end; $fn$;
-- Only add our trigger if the product has NO existing insert trigger on auth.users (never clobber a live signup flow).
do $$ begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on t.tgrelid=c.oid join pg_namespace n on c.relnamespace=n.oid
    where n.nspname='auth' and c.relname='users' and not t.tgisinternal
  ) then
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.cais_handle_new_user_profiles();
  end if;
end $$;
`

// VT_D4/D5/D6 ALL map to fix_profiles (one idempotent migration covers table + trigger + RLS). The
// remediation must run ONCE per ref per run and share its verdict across the three codes — otherwise
// the migration POSTs three times, the 2nd/3rd race the Supabase mgmt API, get a transient HTML error
// page, and VT_D5/D6 falsely `fail` while VT_D4 (the first POST) `pass`ed. Memoize + retry once on a
// transient, and clean the error text (it was dumping a raw <!DOCTYPE html> page into the evidence).
const _profilesApplied = new Map() // supabaseRef → result

async function applyProfilesOnce(ctx) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ctx.supabaseRef}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.supabaseToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: PROFILES_SQL }),
    })
    if (res.ok) {
      return { status: 'pass', evidence: `profiles table + on_auth_user_created trigger + own-row RLS applied to ${ctx.supabaseRef} (idempotent).` }
    }
    const body = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 130)
    if (attempt === 2) return { status: 'fail', evidence: `profiles scaffolding failed (HTTP ${res.status}): ${body || 'no body'}` }
    await new Promise((r) => setTimeout(r, 1500)) // transient (rate-limit / 5xx) — retry once
  }
}

async function fix_profiles(ctx) {
  if (!ctx.supabaseRef) return { status: 'needs-you', evidence: 'NEEDS-YOU: no Supabase ref resolvable — cannot apply the profiles scaffolding.' }
  if (!ctx.supabaseToken) return { status: 'needs-you', evidence: 'NEEDS-YOU: no Supabase management token to apply the profiles scaffolding migration.' }
  if (!apply) return { status: 'fail', evidence: `Plan: apply idempotent profiles table+trigger+RLS to ${ctx.supabaseRef}. (dry-run — --apply)` }
  // Apply once per ref/run; VT_D4/D5/D6 all read the same verdict (no duplicate racing POSTs).
  if (!_profilesApplied.has(ctx.supabaseRef)) {
    _profilesApplied.set(ctx.supabaseRef, await applyProfilesOnce(ctx))
  }
  return _profilesApplied.get(ctx.supabaseRef)
}

// Load the @caistech/elevenlabs-convai hub (built dist) — @caistech-first: reuse the canonical
// allowlist + webhook-bind logic, never re-fork the ElevenLabs API shapes here.
let _hub
async function loadHub() {
  if (_hub !== undefined) return _hub
  try {
    _hub = await import(pathToFileURL(join(HUB_ROOT, 'packages/elevenlabs-convai/dist/index.js')).href)
  } catch { _hub = null }
  return _hub
}
function prodHostname(ctx) {
  try { return ctx.env.NEXT_PUBLIC_SITE_URL ? new URL(ctx.env.NEXT_PUBLIC_SITE_URL).hostname : `${ctx.slug}.vercel.app` }
  catch { return `${ctx.slug}.vercel.app` }
}

// #18 — ElevenLabs Security allowlist on every public agent (hub setAllowlist + standardAllowlist).
async function fix_18(ctx) {
  if (!ctx.elevenKey) return { status: 'needs-you', evidence: 'NEEDS-YOU: no ELEVENLABS_API_KEY in the product .env.local — cannot set agent allowlists. Add the key (BYOK) or run where the product env is present.' }
  if (!ctx.elevenAgents.length) return { status: 'needs-you', evidence: 'NEEDS-YOU: no NEXT_PUBLIC_ELEVENLABS_AGENT_* ids found — provision the agents first, then re-run.' }
  const hub = await loadHub()
  if (!hub?.setAllowlist) return { status: 'needs-you', evidence: 'NEEDS-YOU: @caistech/elevenlabs-convai dist not built — run `npm run build` in packages/elevenlabs-convai, then re-run.' }
  const hostnames = hub.standardAllowlist(prodHostname(ctx)) // [prodHost, *.vercel.app, localhost:3000]
  if (!apply) return { status: 'fail', evidence: `Plan: set Security allowlist [${hostnames.join(', ')}] on ${ctx.elevenAgents.length} agent(s). (dry-run — --apply)` }
  let done = 0
  for (const agentId of ctx.elevenAgents) {
    try { await hub.setAllowlist(ctx.elevenKey, agentId, hostnames); done++ }
    catch (e) { return { status: 'fail', evidence: `allowlist failed after ${done}/${ctx.elevenAgents.length}: ${(e.message || e).toString().slice(0, 120)}` } }
  }
  return { status: 'pass', evidence: `Security allowlist [${hostnames.join(', ')}] set on ${done} agent(s).` }
}

// #19 — bind each agent to a workspace-scoped post-call webhook (hub bindWorkspaceWebhook — the
// non-deprecated workspace_overrides shape). Stores the returned signing secret sensitive in Vercel
// so the #17 HMAC-verify code has it.
async function fix_19(ctx) {
  if (!ctx.elevenKey) return { status: 'needs-you', evidence: 'NEEDS-YOU: no ELEVENLABS_API_KEY — cannot bind the workspace webhook. Add the key or run where the product env is present.' }
  if (!ctx.elevenAgents.length) return { status: 'needs-you', evidence: 'NEEDS-YOU: no agent ids found — provision the agents first, then re-run.' }
  const hub = await loadHub()
  if (!hub?.bindWorkspaceWebhook) return { status: 'needs-you', evidence: 'NEEDS-YOU: @caistech/elevenlabs-convai dist not built — run `npm run build` in packages/elevenlabs-convai.' }
  const base = (ctx.env.NEXT_PUBLIC_SITE_URL || `https://${ctx.slug}.vercel.app`).replace(/\/$/, '')
  const url = ctx.env.ELEVENLABS_WEBHOOK_URL || `${base}/api/webhooks/elevenlabs`
  if (!apply) return { status: 'fail', evidence: `Plan: bind ${ctx.elevenAgents.length} agent(s) → workspace post-call webhook ${url} (capture HMAC secret → store sensitive). (dry-run — --apply)` }
  let done = 0, secret
  for (const agentId of ctx.elevenAgents) {
    try { const r = await hub.bindWorkspaceWebhook(ctx.elevenKey, agentId, { name: `${ctx.slug} post-call`, url }); secret = r?.webhookSecret ?? secret; done++ }
    catch (e) { return { status: 'fail', evidence: `webhook bind failed after ${done}/${ctx.elevenAgents.length}: ${(e.message || e).toString().slice(0, 120)}` } }
  }
  let secretNote = ''
  if (secret && ctx.vercelToken) {
    try {
      const { envs } = await vercel(`/v9/projects/${encodeURIComponent(ctx.vercelProjectId)}/env`, ctx)
      const ex = (envs || []).find((e) => e.key === 'ELEVENLABS_WEBHOOK_SECRET')
      if (ex) await vercel(`/v9/projects/${encodeURIComponent(ctx.vercelProjectId)}/env/${ex.id}`, ctx, { method: 'DELETE' })
      await vercel(`/v10/projects/${encodeURIComponent(ctx.vercelProjectId)}/env`, ctx, { method: 'POST', body: { key: 'ELEVENLABS_WEBHOOK_SECRET', value: secret, type: 'sensitive', target: ['production', 'preview'] } })
      secretNote = ' Signing secret stored as ELEVENLABS_WEBHOOK_SECRET (sensitive, prod+preview) — redeploy + wire #17 HMAC verify.'
    } catch (e) { secretNote = ` (could not store signing secret: ${(e.message || e).toString().slice(0, 80)})` }
  }
  return { status: 'pass', evidence: `Bound ${done} agent(s) → workspace webhook ${url}.${secretNote}` }
}

const HANDLERS = {
  '40': fix_40,
  VT_D1: fix_VT_D1,
  '35': fix_email,
  VT_D7: fix_email,
  VT_D2: fix_qa_accounts,
  VT_D3: fix_qa_accounts,
  '28': fix_profiles,
  VT_D4: fix_profiles,
  VT_D5: fix_profiles,
  VT_D6: fix_profiles,
  '18': fix_18,
  '19': fix_19,
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const ctx = await resolveContext(slug)
  console.log(`config-fixer — ${slug}  [${apply ? 'APPLY (live mutations)' : 'DRY-RUN'}]`)
  console.log(`  vercel project: ${ctx.vercelProjectId}  | supabase ref: ${ctx.supabaseRef || '(unresolved)'}  | product env: ${ctx.pulledFrom}`)
  console.log(`  creds: vercel=${ctx.vercelToken ? 'yes' : 'NO'} supabase-mgmt=${ctx.supabaseToken ? 'yes' : 'NO'} service-key=${ctx.supabaseServiceKey ? 'yes' : 'NO'} eleven=${ctx.elevenKey ? 'yes' : 'NO'}`)

  // Which checks to run.
  let codes
  if (only) codes = [only]
  else if (explicitChecks) codes = explicitChecks.split(',').map((s) => s.trim()).filter(Boolean)
  else codes = (await failingConfigChecks(slug)).map((c) => c.code)
  codes = codes.filter((c) => CONFIG_CHECKS.has(c))
  if (codes.length === 0) { console.log('No failing CONFIG-lane checks to remediate.'); return 0 }
  console.log(`  config checks to remediate: ${codes.join(', ')}\n`)

  // Bind verdicts to the live prod deployment unless told otherwise.
  if (!deployment && !has('no-deployment')) {
    const d = await getLiveProductionDeployment(slug).catch(() => null)
    deployment = d?.deploymentId || ''
  }

  const outcomes = []
  for (const code of codes) {
    const handler = HANDLERS[code]
    let res
    if (!handler) res = { status: 'needs-you', evidence: `NEEDS-YOU: no config handler for #${code} — resolve manually (see FIXER_LANES.md).` }
    else {
      try { res = await handler(ctx) } catch (e) { res = { status: 'fail', evidence: `handler error: ${(e.message || e).toString().slice(0, 160)}` } }
    }
    outcomes.push({ code, ...res })
    console.log(`  #${code}: ${res.status.toUpperCase()} — ${res.evidence}`)
  }

  // Record verdicts. needs-you is recorded as fail (still unmet) with the NEEDS-YOU evidence so it
  // is NEVER silent; pass/fail recorded as-is. (Only --apply writes verdicts — a dry-run reports.)
  if (apply) {
    const checks = outcomes.map((o) => ({
      code: o.code,
      status: o.status === 'pass' ? 'pass' : 'fail',
      evidence: o.evidence,
    }))
    await recordReadiness({ slug, source: 'auto', checks, deploymentId: deployment || null, recordedBy: 'config-fixer' })
    console.log(`\nrecorded ${checks.length} verdict(s)${deployment ? ` bound to ${deployment.slice(0, 12)}…` : ' (no deployment bound)'}`)
  } else {
    console.log('\n(dry-run — nothing mutated, nothing recorded. Re-run with --apply to remediate + record.)')
  }

  const fixed = outcomes.filter((o) => o.status === 'pass').length
  const needsYou = outcomes.filter((o) => o.status === 'needs-you').length
  const failed = outcomes.filter((o) => o.status === 'fail').length
  console.log(`\nsummary: ${fixed} fixed · ${failed} still-failing · ${needsYou} needs-you`)
  return 0
}

main()
  .then((code) => { process.exitCode = code ?? 0; const t = setTimeout(() => process.exit(process.exitCode ?? 0), 300); t.unref() })
  .catch((e) => { console.error(`config-fixer error: ${e.message}`); process.exit(2) })
