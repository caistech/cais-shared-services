#!/usr/bin/env node
/**
 * check-canonical-property-feed.mjs — fail when a repo sources Australian
 * property/site intelligence from anything OTHER than the single approved
 * canonical feed: the published `@caistech/property-services-sdk`
 * (property-services Supabase edge, X-API-Key).
 *
 * Why this exists (the directive it enforces):
 *   "All consuming repos must consume property intelligence via the single
 *    approved property-services feed. Any legacy feed is deprecated and
 *    replaced by the canonical property-services data services."
 *
 * This has drifted repeatedly because migrations were declared "done" when the
 * actively-edited path was converted, while sibling legacy paths (local
 * `*-derive` edge functions, a vendored copy of the SDK client) were left in
 * place. This check makes each of those violation classes fail loudly so a
 * future session physically cannot overclaim "retired" while the legacy code
 * still ships.
 *
 * THREE violation classes it detects:
 *   1. VENDORED SDK — a local hand-copied property-services client
 *      (`class PropertyServicesClient` / `function createPropertyServices`)
 *      instead of importing/re-exporting the published package. A pure
 *      re-export shim (`export * from '@caistech/property-services-sdk'`) is
 *      the approved shape and is NEVER flagged.
 *   2. LOCAL DERIVE FUNCTIONS — a `supabase/functions/<x>-derive/` edge
 *      function that re-implements what property-services `/derive` already
 *      returns (wind / council / climate / bal / zoning / site-intel).
 *   3. LEGACY DIRECT CALLS — application code that `fetch()`es a local
 *      `/functions/v1/<x>-derive` endpoint instead of calling the SDK.
 *
 * Opt out an intentional, reviewed exception with a comment on or just above
 * the flagged line / in the function's index file:
 *     // @canonical-feed-ok: <reason>
 *
 * Run from a repo root:
 *   node ~/PycharmProjects/cais-shared-services/scripts/check-canonical-property-feed.mjs
 *   node .../check-canonical-property-feed.mjs --json
 * Sweep the whole portfolio (one level of repo dirs under <root>):
 *   node .../check-canonical-property-feed.mjs --all ~/PycharmProjects
 *
 * Exit codes: 0 = clean, 2 = violation(s) detected, 1 = usage error.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, basename } from "node:path";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const allIdx = args.indexOf("--all");
const sweepRoot = allIdx !== -1 ? args[allIdx + 1] : null;

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const log = (s = "") => process.stdout.write(s + "\n");

const CANONICAL = "@caistech/property-services-sdk";

// The legacy derivation endpoints property-services `/derive` now supersedes.
const DERIVE_FNS = ["wind", "council", "climate", "bal", "zoning", "site-intel", "overlay"];
const DERIVE_FN_RE = new RegExp(`^(${DERIVE_FNS.join("|")})-derive$`);
// A direct fetch to one of the legacy edge endpoints.
const LEGACY_CALL_RE = new RegExp(
  `functions/v1/(${DERIVE_FNS.join("|")})-derive`
);

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", "coverage", ".vercel",
  ".turbo", "out", ".cache", "deno.lock",
]);
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, acc);
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf(".");
      if (dot !== -1 && EXT.has(e.name.slice(dot))) acc.push(full);
    }
  }
  return acc;
}

function hasOptOut(content, lineIdx) {
  const lines = content.split(/\r?\n/);
  const window = [lines[lineIdx] ?? "", lines[lineIdx - 1] ?? "", lines[lineIdx - 2] ?? ""].join("\n");
  return /@canonical-feed-ok/.test(window);
}

// A local DEFINITION of the SDK client (vendored copy), not a re-export/import.
function vendoredClientLine(content) {
  // A re-export shim is the approved shape — never a violation.
  if (/export\s+\*\s+from\s+['"]@caistech\/property-services-sdk['"]/.test(content)) return -1;
  const lines = content.split(/\r?\n/);
  const classRe = /^\s*(export\s+)?(default\s+)?class\s+PropertyServicesClient\b/;
  const fnRe = /^\s*(export\s+)?(async\s+)?function\s+createPropertyServices\s*\(/;
  const constRe = /^\s*(export\s+)?const\s+createPropertyServices\s*[:=]/;
  for (let i = 0; i < lines.length; i++) {
    if (classRe.test(lines[i]) || fnRe.test(lines[i]) || constRe.test(lines[i])) return i;
  }
  return -1;
}

function scanRepo(root) {
  const violations = [];

  // ── class 2: local *-derive edge functions ───────────────────────────────
  const fnsDir = join(root, "supabase", "functions");
  if (existsSync(fnsDir)) {
    let entries = [];
    try { entries = readdirSync(fnsDir, { withFileTypes: true }); } catch { /* ignore */ }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!DERIVE_FN_RE.test(e.name)) continue;
      // Allow an opt-out in the function's index file.
      const idx = ["index.ts", "index.js"].map((f) => join(fnsDir, e.name, f)).find(existsSync);
      if (idx) {
        try {
          const c = readFileSync(idx, "utf-8");
          if (/@canonical-feed-ok/.test(c)) continue;
        } catch { /* ignore */ }
      }
      violations.push({
        class: "local-derive-function",
        file: relative(root, join(fnsDir, e.name)).split(sep).join("/"),
        line: 1,
        detail: `local '${e.name}' edge function re-implements property-services /derive`,
        hint: `Delete this function and call ${CANONICAL} derive() instead (the canonical, metered feed).`,
      });
    }
  }

  // ── classes 1 & 3: source-file scans ──────────────────────────────────────
  const files = walk(root, []);
  for (const file of files) {
    const rel = relative(root, file).split(sep).join("/");
    // Never scan the canonical HUB package sources themselves (cais-shared-services):
    // the SDK IS the canonical feed, and site-intelligence is a substrate package
    // whose own source legitimately references itself.
    // NOTE: a *vendored* copy under src/lib/services/property-services-sdk/ is a
    // violation and MUST still be scanned — only the hub's `packages/` source is exempt.
    if (rel.includes("packages/property-services-sdk/")) continue;
    if (rel.includes("packages/site-intelligence/")) continue;

    let content;
    try { content = readFileSync(file, "utf-8"); } catch { continue; }
    const srcLines = content.split(/\r?\n/);

    // class 1: vendored client copy
    const vLine = vendoredClientLine(content);
    if (vLine !== -1 && !hasOptOut(content, vLine)) {
      violations.push({
        class: "vendored-sdk",
        file: rel,
        line: vLine + 1,
        detail: "local copy of the property-services client (PropertyServicesClient / createPropertyServices)",
        hint: `Delete the vendored copy; depend on ${CANONICAL} and re-export it (export * from '${CANONICAL}').`,
      });
    }

    // class 4: legacy @caistech/site-intelligence property feed (local GeoJSON,
    // not the metered canonical feed). This is the pattern MMCBuild's site-intel
    // and F2K-Fund-Tokenisation still use.
    for (let i = 0; i < srcLines.length; i++) {
      if (/from\s+['"]@caistech\/site-intelligence['"]/.test(srcLines[i]) && !hasOptOut(content, i)) {
        violations.push({
          class: "legacy-site-intelligence",
          file: rel,
          line: i + 1,
          detail: "imports @caistech/site-intelligence (local-GeoJSON derivation) instead of the canonical feed",
          hint: `Source climate/wind/council/zoning from ${CANONICAL} derive() (the single approved feed).`,
        });
        break;
      }
    }

    // class 3: legacy direct edge calls
    for (let i = 0; i < srcLines.length; i++) {
      if (LEGACY_CALL_RE.test(srcLines[i]) && !hasOptOut(content, i)) {
        const m = srcLines[i].match(LEGACY_CALL_RE);
        violations.push({
          class: "legacy-direct-call",
          file: rel,
          line: i + 1,
          detail: `direct fetch to legacy '${m[1]}-derive' edge endpoint`,
          hint: `Replace with ${CANONICAL} derive() — read the field from the returned PropertyProfile.`,
        });
      }
    }
  }
  return violations;
}

function isRepo(dir) {
  return existsSync(join(dir, "package.json")) || existsSync(join(dir, "supabase"));
}

// ─── run ──────────────────────────────────────────────────────────────────────
const targets = [];
if (sweepRoot) {
  let entries = [];
  try { entries = readdirSync(sweepRoot, { withFileTypes: true }); } catch {
    log(`${C.red}Cannot read sweep root: ${sweepRoot}${C.reset}`);
    process.exit(1);
  }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
    const dir = join(sweepRoot, e.name);
    if (isRepo(dir)) targets.push(dir);
  }
} else {
  targets.push(process.cwd());
}

const report = [];
let total = 0;
for (const root of targets) {
  const violations = scanRepo(root);
  total += violations.length;
  if (violations.length || !sweepRoot) report.push({ repo: basename(root), root, violations });
}

if (jsonOut) {
  log(JSON.stringify({ ok: total === 0, total, report }, null, 2));
  process.exit(total === 0 ? 0 : 2);
}

log("");
log(`${C.bold}🛰  Canonical property-feed check${C.reset} ${C.dim}— single approved source: ${CANONICAL}${C.reset}`);
if (total === 0) {
  log(`${C.green}✓ No legacy property/site-intel feeds found. Every consumer is on the canonical feed.${C.reset}`);
  log("");
  process.exit(0);
}

log("");
log(`${C.red}${C.bold}✗ ${total} legacy-feed violation(s)${C.reset}${C.red} — property intelligence is being sourced outside the canonical feed:${C.reset}`);
for (const r of report) {
  if (!r.violations.length) continue;
  log("");
  log(`  ${C.cyan}${C.bold}${r.repo}${C.reset}`);
  for (const v of r.violations) {
    log(`    ${C.yellow}${v.file}:${v.line}${C.reset}  ${C.dim}[${v.class}]${C.reset}`);
    log(`       ↳ ${v.detail}`);
    log(`       ${C.dim}↳ ${v.hint}${C.reset}`);
  }
}
log("");
log(`${C.dim}Legit exception? Add "// @canonical-feed-ok: <reason>" on/above the line (or in the function's index file).${C.reset}`);
log("");
process.exit(2);
