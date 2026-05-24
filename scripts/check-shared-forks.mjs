#!/usr/bin/env node
/**
 * check-shared-forks.mjs — fail when a repo re-defines a generic helper that
 * belongs to a shared @caistech package instead of importing it.
 *
 * Why this exists: the OffshoreModular / Mova ElevenLabs webhook forks. During
 * the window when @caistech/elevenlabs-convai was unpublished, repos vendored a
 * copy of verifyWebhookSignature / parsePostCallPayload with a "replace with an
 * import once published" TODO. The TODO never got actioned, the copies froze
 * before the 0.3.3 secret-trim fix, and they silently 401'd. This check makes
 * that class of fork fail loudly so the next one can't slip through.
 *
 * It is deliberately precise to avoid false positives:
 *   - Names that are unambiguously ElevenLabs (parsePostCallPayload,
 *     parseWebhookEvent) flag on a local definition alone.
 *   - Generic names that legitimately recur for other webhook systems
 *     (verifyWebhookSignature — e.g. an outbound HMAC signer for a different
 *     channel) flag ONLY when the file is clearly ElevenLabs-related.
 *   - A re-export (`export { x } from '@caistech/...'`) is never flagged.
 *   - An intentional local impl can opt out with a `@shared-fork-ok` comment
 *     on or just above the definition, with a reason.
 *
 * Run from a repo root:
 *   node ~/PycharmProjects/cais-shared-services/scripts/check-shared-forks.mjs
 *   node .../check-shared-forks.mjs --json
 *
 * Exit codes: 0 = clean, 2 = fork(s) detected, 1 = usage error.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const root = process.cwd();

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const log = (s = "") => process.stdout.write(s + "\n");

// ─── what we guard ──────────────────────────────────────────────────────────
// Each guarded export belongs to a shared package. `requireContext` means the
// name is generic enough to recur for unrelated systems, so only flag it when
// the file is clearly about that package's domain (here: ElevenLabs).
const GUARDS = [
  {
    pkg: "@caistech/elevenlabs-convai",
    exports: [
      { name: "verifyWebhookSignature", requireContext: true },
      { name: "parsePostCallPayload", requireContext: false },
      { name: "parseWebhookEvent", requireContext: false },
    ],
    // Markers that prove a file is ElevenLabs webhook code.
    contextRe: /elevenlabs-signature|ElevenLabsPostCallPayload|post_call_webhook|conversation_initiation_client_data|@caistech\/elevenlabs-convai|convai/i,
    hint: "Import from '@caistech/elevenlabs-convai' (it carries the secret-trim + bind fixes). Keep only domain-specific mappers local.",
  },
];

// ─── file walk (skip the obvious non-source trees) ──────────────────────────
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", "coverage", ".vercel",
  ".turbo", "out", ".cache",
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
    if (e.name.startsWith(".") && e.name !== ".") {
      if (SKIP_DIRS.has(e.name)) continue;
    }
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf(".");
      if (dot !== -1 && EXT.has(e.name.slice(dot))) acc.push(full);
    }
  }
  return acc;
}

// A definition of NAME (function or const arrow), not a re-export/import.
function definitionLine(content, name) {
  const lines = content.split(/\r?\n/);
  const fn = new RegExp(`^\\s*(export\\s+)?(default\\s+)?(async\\s+)?function\\s+${name}\\s*[(<]`);
  const cn = new RegExp(`^\\s*(export\\s+)?const\\s+${name}\\s*[:=]`);
  for (let i = 0; i < lines.length; i++) {
    if (fn.test(lines[i]) || cn.test(lines[i])) return i; // 0-based
  }
  return -1;
}

function hasOptOut(content, lineIdx) {
  const lines = content.split(/\r?\n/);
  const here = lines[lineIdx] ?? "";
  const above = lineIdx > 0 ? lines[lineIdx - 1] : "";
  const above2 = lineIdx > 1 ? lines[lineIdx - 2] : "";
  return /@shared-fork-ok/.test(here + above + above2);
}

// ─── scan ────────────────────────────────────────────────────────────────────
const files = walk(root, []);
const violations = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf-8");
  } catch {
    continue;
  }
  for (const guard of GUARDS) {
    const isContextFile = guard.contextRe.test(content) ||
      /elevenlabs|convai|omq-voice/i.test(file);
    for (const exp of guard.exports) {
      if (exp.requireContext && !isContextFile) continue;
      const lineIdx = definitionLine(content, exp.name);
      if (lineIdx === -1) continue;
      if (hasOptOut(content, lineIdx)) continue;
      violations.push({
        file: relative(root, file).split(sep).join("/"),
        line: lineIdx + 1,
        export: exp.name,
        pkg: guard.pkg,
        hint: guard.hint,
      });
    }
  }
}

// ─── report ───────────────────────────────────────────────────────────────────
if (jsonOut) {
  log(JSON.stringify({ root, violations, ok: violations.length === 0 }, null, 2));
  process.exit(violations.length === 0 ? 0 : 2);
}

log("");
log(`${C.bold}🔗 Shared-package fork check${C.reset} ${C.dim}— ${root}${C.reset}`);
if (violations.length === 0) {
  log(`${C.green}✓ No vendored copies of shared @caistech helpers found.${C.reset}`);
  log("");
  process.exit(0);
}

log("");
log(`${C.red}${C.bold}✗ ${violations.length} fork(s) detected${C.reset}${C.red} — these helpers are defined locally but belong to a shared package:${C.reset}`);
log("");
for (const v of violations) {
  log(`  ${C.yellow}${v.file}:${v.line}${C.reset}  defines ${C.bold}${v.export}${C.reset}`);
  log(`     ${C.dim}↳ belongs to ${v.pkg}${C.reset}`);
  log(`     ${C.dim}↳ ${v.hint}${C.reset}`);
}
log("");
log(`${C.dim}If a flagged function is genuinely a different system that happens to share the name,${C.reset}`);
log(`${C.dim}add a "@shared-fork-ok: <reason>" comment on (or just above) its definition.${C.reset}`);
log("");
process.exit(2);
