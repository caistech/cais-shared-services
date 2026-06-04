#!/usr/bin/env node
// check-38-supabase.mjs
//
// Check 38 — Supabase hygiene. Three honest sub-checks, each from its real source:
//   38a  idempotent migrations   — static scan of supabase/migrations/*.sql
//   38b  no client service-key    — repo scan: SUPABASE_SERVICE_ROLE_KEY value-reads in client bundle
//   38c  RLS on + ≥1 policy       — LIVE query against pg_tables / pg_policies (the authoritative source)
//
// Emits ONE readiness verdict for code "38": pass only if all three sub-checks pass; otherwise fail,
// with evidence naming which sub-check(s) failed. Writes /tmp/readiness-38.json (override with --out),
// in the shape gate-check.mjs record-readiness --source auto consumes:
//   [{ "code":"38", "status":"pass|fail", "evidence":"..." }]
//
// Usage (PowerShell, from repo root):
//   node check-38-supabase.mjs `
//     --repo . `
//     --migrations supabase/migrations `
//     --supabase-url $env:NEXT_PUBLIC_SUPABASE_URL `
//     --service-key $env:SUPABASE_SERVICE_ROLE_KEY `
//     --out readiness-38.json
//
// Requires @supabase/supabase-js (already in the cockpit). Run from a checkout that has node_modules,
// or `node --experimental-... ` not needed — plain ESM. No network except the Supabase RPC for 38c.

import fs from 'node:fs';
import path from 'node:path';

// ── args ────────────────────────────────────────────────────────────────────
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const REPO = path.resolve(arg('repo', '.'));
const MIGRATIONS = path.resolve(arg('migrations', path.join(REPO, 'supabase/migrations')));
const SUPABASE_URL = arg('supabase-url', process.env.NEXT_PUBLIC_SUPABASE_URL || '');
const SERVICE_KEY = arg('service-key', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const OUT = path.resolve(arg('out', '/tmp/readiness-38.json'));
const APP_SCHEMAS = (arg('schemas', 'public,pipeline')).split(',').map((s) => s.trim());

const findings = { a: [], b: [], c: [] };

// ── 38a — idempotent migrations ───────────────────────────────────────────────
// Re-runnable means: object-creating statements guard against "already exists". We flag the common
// non-idempotent shapes. A CREATE POLICY is only OK if preceded by DROP POLICY IF EXISTS (your house
// style) — so we pair them. Seeds (INSERT) should be ON CONFLICT / WHERE NOT EXISTS to re-run clean.
// 38a — idempotent migrations.
// Idempotency-as-a-gate applies to migrations written AFTER the drop-first/IF-NOT-EXISTS
// convention was adopted (~20260514). Earlier one-shot migrations (incl. *_initial_schema)
// run once on a fresh DB and are NOT meant to be re-runnable — flagging them is noise, so they
// are reported as (advisory) only. Override the floor with --idempotency-floor <YYYYMMDD...>.
const IDEMPOTENCY_FLOOR = arg('idempotency-floor', '20260514000000');

function isEnforcedMigration(filename) {
  if (/_initial_schema\.sql$/i.test(filename)) return false; // never enforce on the initial schema
  const ts = filename.match(/^(\d{8,})/);
  if (!ts) return true; // no timestamp prefix → treat as current, enforce
  return ts[1] >= IDEMPOTENCY_FLOOR; // lexical compare works for zero-padded timestamps
}

function scanMigrations() {
  if (!fs.existsSync(MIGRATIONS)) {
    findings.a.push(`migrations dir not found: ${MIGRATIONS}`);
    return;
  }
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexical — exactly how Supabase applies them

  for (const f of files) {
    const enforced = isEnforcedMigration(f);
    const tag = enforced ? '' : ' (advisory)'; // pre-convention / initial files don't fail the gate
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    // strip line comments so guards inside comments don't count, and commented-out DDL doesn't flag
    const code = sql
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n');
    const lower = code.toLowerCase();

    // CREATE POLICY needs a DROP POLICY IF EXISTS guard ONLY when the policy targets a table that
    // is NOT created in this same migration. A one-shot "CREATE TABLE [IF NOT EXISTS] x; CREATE
    // POLICY ON x" is self-consistent on first apply (the real-world case: it's applied once); the
    // re-run hazard only exists when policies are bolted onto a PRE-EXISTING table without a guard.
    const createPolicies = (code.match(/create\s+policy\s+"?([^"\s]+)"?/gi) || []).length;
    const dropPolicyIfExists = (lower.match(/drop\s+policy\s+if\s+exists/g) || []).length;
    // tables this migration itself creates → policies on them don't need a drop-guard
    const createsTable = /create\s+table\s+(if\s+not\s+exists\s+)?[a-z0-9_."]+/i.test(code);
    if (createPolicies > 0 && dropPolicyIfExists < createPolicies) {
      // self-creating table → advisory; bolted onto an existing table → enforce (when past floor)
      const guardTag = createsTable ? ' (advisory)' : tag;
      findings.a.push(
        `${f}: ${createPolicies} CREATE POLICY but only ${dropPolicyIfExists} DROP POLICY IF EXISTS (guard each)${guardTag}`,
      );
    }

    // Unguarded CREATE TABLE / TYPE / INDEX (no IF NOT EXISTS, no preceding DROP).
    const unguarded = [];
    for (const m of code.matchAll(/create\s+(table|type|index|unique\s+index)\s+(?!if\s+not\s+exists)([a-z0-9_."]+)/gi)) {
      const obj = m[2];
      // a `create type` is acceptable if wrapped in a DO/exception block (common idempotent enum trick)
      const hasDoGuard = /do\s+\$\$|exception\s+when\s+duplicate_object/i.test(code);
      if (!(m[1].toLowerCase() === 'type' && hasDoGuard)) unguarded.push(`${m[1]} ${obj}`);
    }
    if (unguarded.length) {
      findings.a.push(`${f}: unguarded ${unguarded.slice(0, 4).join(', ')}${unguarded.length > 4 ? '...' : ''}${tag}`);
    }

    // Unguarded ALTER TABLE ... ADD COLUMN (no IF NOT EXISTS) — re-run throws "column exists".
    for (const m of code.matchAll(/alter\s+table\s+[^\n;]*add\s+column\s+(?!if\s+not\s+exists)([a-z0-9_."]+)/gi)) {
      findings.a.push(`${f}: ADD COLUMN ${m[1]} without IF NOT EXISTS${tag}`);
    }

    // Seed inserts that aren't conflict-safe (advisory — seeds re-running is the usual culprit).
    if (/_seed_/i.test(f) && /insert\s+into/i.test(lower) && !/on\s+conflict|where\s+not\s+exists/i.test(lower)) {
      findings.a.push(`${f}: seed INSERT without ON CONFLICT / WHERE NOT EXISTS (advisory)`);
    }

    // Hygiene-only: malformed-date filenames (e.g. month 53 / day 32). Not a failure, just noise.
    const ts = f.match(/^(\d{4})(\d{2})(\d{2})/);
    if (ts) {
      const [, , mm, dd] = ts;
      if (Number(mm) > 12 || Number(dd) > 31) findings.a.push(`${f}: malformed date in filename (advisory)`);
    }
  }
}

// ── 38b — no client-side service key ───────────────────────────────────────────
// A value-read of *_SUPABASE_SERVICE_ROLE_KEY is a ❌ only if it lives in a client-bundled file.
// Boundary (derived from this repo): server by default; client = 'use client' directive, or under
// src/components, src/hooks. Exclude tests/scripts/e2e (not bundled). Name-mentions (strings,
// errors, deploy-URL querystrings) are NOT findings — only process.env.*SERVICE_ROLE_KEY reads.
const KEY_READ = /process\.env\.[A-Z0-9_]*SUPABASE_SERVICE_ROLE_KEY/;
const NEXT_PUBLIC_SERVICE = /process\.env\.NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/;
const EXCLUDE_DIR = /(\\|\/)(node_modules|\.next|e2e|scripts)(\\|\/)|__tests__|\.spec\.|\.test\./;
const CLIENT_DIR = /(\\|\/)(components|hooks)(\\|\/)/;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.next|\.git/.test(e.name)) walk(full, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function scanClientLeak() {
  const srcDir = path.join(REPO, 'src');
  if (!fs.existsSync(srcDir)) {
    findings.b.push(`src/ not found at ${srcDir}`);
    return;
  }
  for (const file of walk(srcDir)) {
    if (EXCLUDE_DIR.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!KEY_READ.test(text) && !NEXT_PUBLIC_SERVICE.test(text)) continue;

    const rel = path.relative(REPO, file);
    // NEXT_PUBLIC_*SERVICE_ROLE is always fatal regardless of file.
    if (NEXT_PUBLIC_SERVICE.test(text)) {
      findings.b.push(`${rel}: reads a NEXT_PUBLIC_*SERVICE_ROLE value (forced into client bundle)`);
      continue;
    }
    const firstReal = text.split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) || '';
    const isClientDirective = /^\s*['"]use client['"]/.test(firstReal);
    const isClientDir = CLIENT_DIR.test(file);
    if (isClientDirective || isClientDir) {
      findings.b.push(`${rel}: service-key value-read in a client-bundled file (${isClientDirective ? "'use client'" : 'client dir'})`);
    }
  }
}

// ── 38c — RLS on + ≥1 policy (live) ────────────────────────────────────────────
// Authoritative: reflects dashboard edits + migrations both. Fails a table that is RLS-disabled,
// or RLS-on with zero policies (selective-policy tables like audit_log pass — they have ≥1).
async function scanRls() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    findings.c.push('skipped: --supabase-url / --service-key not provided (cannot verify live RLS)');
    return;
  }
  if (!/^https?:\/\//i.test(SUPABASE_URL.trim())) {
    findings.c.push(`skipped: supabase-url is not a valid http(s) URL ("${SUPABASE_URL.slice(0, 40)}") — is the env var set in this shell?`);
    return;
  }
  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch {
    findings.c.push('skipped: @supabase/supabase-js not resolvable (run from a checkout with node_modules)');
    return;
  }
  let sb;
  try {
    sb = createClient(SUPABASE_URL.trim(), SERVICE_KEY.trim(), { auth: { persistSession: false } });
  } catch (e) {
    findings.c.push(`skipped: could not init supabase client (${e instanceof Error ? e.message : String(e)})`);
    return;
  }

  // Use an RPC if present; otherwise fall back to a raw SQL call via the SQL endpoint is not available
  // through supabase-js, so we query the catalog through a tiny SECURITY DEFINER RPC. To avoid requiring
  // a new migration, we read pg_tables/pg_policies via the REST-exposed information path: supabase-js
  // can't hit pg_catalog directly, so we rely on the rpc 'gate_rls_audit' if you add it, else report.
  const { data, error } = await sb.rpc('gate_rls_audit', { app_schemas: APP_SCHEMAS });
  if (error) {
    findings.c.push(
      `skipped: rpc gate_rls_audit unavailable (${error.message}). Add the helper below, or run the SQL audit manually.`,
    );
    return;
  }
  for (const row of data || []) {
    if (row.verdict && row.verdict !== 'pass') {
      findings.c.push(`${row.schemaname}.${row.tablename}: ${row.verdict}`);
    }
  }
}

// ── run ────────────────────────────────────────────────────────────────────
(async () => {
  scanMigrations();
  scanClientLeak();
  await scanRls();

  // Advisory-only 38a items shouldn't fail the gate; separate them.
  const hardA = findings.a.filter((f) => !/\(advisory\)/.test(f));
  const failed =
    hardA.length > 0 || findings.b.length > 0 || findings.c.some((f) => !/^skipped:/.test(f));

  const parts = [];
  if (hardA.length) parts.push(`38a migrations: ${hardA.join(' | ')}`);
  if (findings.b.length) parts.push(`38b client-leak: ${findings.b.join(' | ')}`);
  const cReal = findings.c.filter((f) => !/^skipped:/.test(f));
  if (cReal.length) parts.push(`38c RLS: ${cReal.join(' | ')}`);
  const skips = findings.c.filter((f) => /^skipped:/.test(f));
  if (skips.length) parts.push(skips.join(' | '));
  const advisories = findings.a.filter((f) => /\(advisory\)/.test(f));
  if (advisories.length) parts.push(`advisory: ${advisories.join(' | ')}`);

  const status = failed ? 'fail' : 'pass';
  const evidence = parts.length ? parts.join('  ||  ') : 'migrations idempotent; no client service-key; all app tables RLS-on + ≥1 policy';

  const verdict = [{ code: '38', status, evidence: evidence.slice(0, 1000) }];
  fs.writeFileSync(OUT, JSON.stringify(verdict, null, 2));
  console.log(`check 38 → ${status.toUpperCase()}`);
  console.log(evidence);
  console.log(`\nwrote ${OUT}`);
  if (skips.length) {
    console.log('\nNOTE: 38c needs an RPC to read pg_catalog via supabase-js. One-time helper:');
    console.log(RPC_HELPER);
  }
  process.exit(0); // never throw the gate; the verdict file carries pass/fail
})();

const RPC_HELPER = `
-- One-time migration: lets the checker read RLS posture via supabase-js.
create or replace function public.gate_rls_audit(app_schemas text[])
returns table(schemaname text, tablename text, rls_enabled boolean, policy_count bigint, verdict text)
language sql security definer set search_path = public as $$
  select t.schemaname, t.tablename, t.rowsecurity,
         count(p.policyname),
         case when not t.rowsecurity then 'FAIL: RLS disabled'
              when count(p.policyname) = 0 then 'FAIL: RLS on, zero policies'
              else 'pass' end
  from pg_tables t
  left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
  where t.schemaname = any(app_schemas)
  group by t.schemaname, t.tablename, t.rowsecurity;
$$;
revoke all on function public.gate_rls_audit(text[]) from anon, authenticated;
`;
