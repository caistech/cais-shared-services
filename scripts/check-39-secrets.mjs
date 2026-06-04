#!/usr/bin/env node
// check-39-secrets.mjs
//
// Check 39 — no secrets committed. Scans GIT-TRACKED files only (a gitignored .env.local is fine;
// a TRACKED one is a ❌). Looks for real secret VALUES, not env-var names:
//   - Supabase JWTs           eyJ… (header.payload.signature, base64url)
//   - OpenAI / Anthropic keys sk-…, sk-ant-…
//   - Resend                  re_…
//   - Generic long hex/base64 assigned to a *_KEY / *_SECRET / *_TOKEN
//   - A tracked .env / .env.local / .env.production with a populated secret-ish value
// Seed migrations (*_seed_*.sql) are scanned too — the usual accidental-commit spot.
//
// Emits /tmp/readiness-39.json (override --out): [{ "code":"39","status":"pass|fail","evidence":"..." }]
//
// Usage (PowerShell, from repo root — needs git on PATH):
//   node check-39-secrets.mjs --repo . --out readiness-39.json

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const REPO = path.resolve(arg('repo', '.'));
const OUT = path.resolve(arg('out', '/tmp/readiness-39.json'));

// ── list git-tracked files (the whole point: gitignored secrets are fine) ──────
function trackedFiles() {
  try {
    const out = execSync('git ls-files', { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// Skip binary/asset/lock files — secrets don't live there and they cause noise.
const SKIP_EXT = /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|pdf|lock|map)$/i;
const SKIP_PATH = /(^|\/)(node_modules|\.next|dist|build|coverage)\//;
// .env name is allowed only if it's the example/template; a tracked real env file is a finding.
const ENV_FILE = /(^|\/)\.env(\.[a-z0-9_.-]+)?$/i;
const ENV_EXAMPLE = /\.env\.(example|sample|template)$/i;

// ── secret value patterns (values, not names) ──────────────────────────────────
const PATTERNS = [
  { name: 'JWT (Supabase service/anon or other)', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'OpenAI/Anthropic key', re: /\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Resend key', re: /\bre_[A-Za-z0-9_-]{16,}\b/ },
  { name: 'Stripe secret/live key', re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  // KEY/SECRET/TOKEN assigned a long opaque value (catches generic leaks); excludes process.env reads.
  {
    name: 'assigned secret value',
    re: /(?:_KEY|_SECRET|_TOKEN|_PASSWORD)\s*[:=]\s*['"]([A-Za-z0-9_\-+/]{24,})['"]/,
    guard: (m, line) => !/process\.env|placeholder|example|xxx|your[-_]|<.*>|\$\{/.test(line) && !/^[A-Z_]+$/.test(m[1]),
  },
];

function looksLikePlaceholder(line) {
  return /placeholder|example|changeme|your[-_]?(key|token|secret)|xxxx|<[^>]*>|process\.env|\$\{/i.test(line);
}

(async () => {
  const findings = [];
  const tracked = trackedFiles();

  if (tracked.error) {
    const verdict = [{ code: '39', status: 'fail', evidence: `could not run git ls-files: ${tracked.error}` }];
    fs.writeFileSync(OUT, JSON.stringify(verdict, null, 2));
    console.log('check 39 → FAIL (git unavailable)');
    console.log(verdict[0].evidence);
    process.exit(0);
  }

  for (const rel of tracked) {
    if (SKIP_EXT.test(rel) || SKIP_PATH.test(rel)) continue;

    // A tracked real .env file (not an example) is itself a finding if it has any populated secret-ish line.
    const isEnv = ENV_FILE.test(rel) && !ENV_EXAMPLE.test(rel);

    const abs = path.join(REPO, rel);
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue; // unreadable / deleted-but-tracked
    }
    if (text.includes('\u0000')) continue; // binary

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (looksLikePlaceholder(line)) continue;

      for (const p of PATTERNS) {
        const m = line.match(p.re);
        if (m && (!p.guard || p.guard(m, line))) {
          findings.push(`${rel}:${i + 1} — ${p.name}`);
        }
      }
      // populated value in a tracked real env file: KEY=<non-empty, non-placeholder>
      if (isEnv) {
        const kv = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
        if (kv && kv[2].trim() && !looksLikePlaceholder(line) && /KEY|SECRET|TOKEN|PASSWORD|DSN|URL/i.test(kv[1])) {
          findings.push(`${rel}:${i + 1} — tracked .env carries a populated ${kv[1]}`);
        }
      }
    }
    if (isEnv && !findings.some((f) => f.startsWith(rel + ':'))) {
      findings.push(`${rel} — real .env file is git-tracked (should be gitignored)`);
    }
  }

  // de-dupe, cap
  const uniq = [...new Set(findings)];
  const status = uniq.length ? 'fail' : 'pass';
  const evidence = uniq.length
    ? `${uniq.length} potential committed secret(s): ${uniq.slice(0, 12).join(' | ')}${uniq.length > 12 ? ' …' : ''}`
    : 'no committed secrets in tracked files (env files gitignored; seeds clean)';

  const verdict = [{ code: '39', status, evidence: evidence.slice(0, 1000) }];
  fs.writeFileSync(OUT, JSON.stringify(verdict, null, 2));
  console.log(`check 39 → ${status.toUpperCase()}`);
  console.log(evidence);
  console.log(`\nwrote ${OUT}`);
  process.exit(0);
})();
