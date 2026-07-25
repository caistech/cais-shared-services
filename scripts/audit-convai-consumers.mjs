// scripts/audit-convai-consumers.mjs
// Audit every @caistech/elevenlabs-convai consumer by what it ACTUALLY MOUNTS, not what it installs.
// "Rolled out" kept meaning "the dependency is in package.json" — this proves the difference:
// widget-only vs a mounted memory loop, and whether a mounted loop is SECURE (tool-auth + server-baked
// identity) or exposed (unauthenticated memory routes = the cross-tenant hole).
//
// Verdicts:
//   widget-only        — installs the package for the VoiceWidget; no memory routes. Fine as-is.
//   loop-secure        — mounts recall/start routes AND uses toolSecret + resolveToolIdentity (≥0.6.0).
//   loop-INSECURE      — mounts memory routes WITHOUT tool-auth → recall/save reachable unauthenticated.
//   loop-legacy        — mounts memory routes but on the pre-0.6.0 conversation-id path (memory likely
//                        broken in real calls: EL never passes conversation_id to tool webhooks).
//
// Usage: node scripts/audit-convai-consumers.mjs [--json]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); // ~/PycharmProjects
const JSON_OUT = process.argv.includes('--json');
const PKG = '@caistech/elevenlabs-convai';

function walk(dir, pred, hits = [], depth = 0) {
  if (depth > 6) return hits;
  let entries;
  try { entries = readdirSync(dir); } catch { return hits; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e === '.git' || e === 'dist') continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, pred, hits, depth + 1);
    else if (pred(p)) hits.push(p);
  }
  return hits;
}

function grepAny(files, patterns) {
  for (const f of files) {
    let txt;
    try { txt = readFileSync(f, 'utf-8'); } catch { continue; }
    if (patterns.some((re) => re.test(txt))) return true;
  }
  return false;
}

const repos = readdirSync(ROOT).filter((d) => {
  const pj = join(ROOT, d, 'package.json');
  if (!existsSync(pj)) return false;
  try {
    const p = JSON.parse(readFileSync(pj, 'utf-8'));
    return { ...p.dependencies, ...p.devDependencies }[PKG];
  } catch { return false; }
});

const rows = [];
for (const repo of repos) {
  const repoDir = join(ROOT, repo);
  const pj = JSON.parse(readFileSync(join(repoDir, 'package.json'), 'utf-8'));
  const version = ({ ...pj.dependencies, ...pj.devDependencies }[PKG]) || '?';

  // Route presence: a recall_memory / start_conversation route dir, and a distil reference.
  const hasRecallRoute = walk(repoDir, (p) => /[\\/](recall_memory|recall-memory)[\\/]route\.(ts|js)x?$/.test(p)).length > 0;
  const hasStartRoute = walk(repoDir, (p) => /[\\/](start_conversation|start-conversation)[\\/]route\.(ts|js)x?$/.test(p)).length > 0;
  const srcFiles = walk(repoDir, (p) => /\.(ts|tsx|js|mjs)$/.test(p));
  const hasDistil = grepAny(srcFiles, [/distillConversationToMemory/]);
  const usesToolSecret = grepAny(srcFiles, [/toolSecret|x-convai-tool-secret|x-kira-tool-secret|toolSecretOk/]);
  const usesIdentity = grepAny(srcFiles, [/resolveToolIdentity|[?&]uid=/]);

  const mountsLoop = hasRecallRoute || hasStartRoute || hasDistil;
  let verdict;
  if (!mountsLoop) verdict = 'widget-only';
  else if (!usesToolSecret) verdict = 'loop-INSECURE';
  else if (!usesIdentity) verdict = 'loop-legacy';
  else verdict = 'loop-secure';

  rows.push({ repo, version, recall: hasRecallRoute, start: hasStartRoute, distil: hasDistil, auth: usesToolSecret, identity: usesIdentity, verdict });
}

rows.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.repo.localeCompare(b.repo));

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log(`\n@caistech/elevenlabs-convai consumers (${rows.length}):\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('repo', 26), pad('version', 10), pad('recall', 7), pad('distil', 7), pad('auth', 6), pad('uid', 5), 'verdict');
  console.log('-'.repeat(90));
  for (const r of rows) {
    console.log(pad(r.repo, 26), pad(r.version, 10), pad(r.recall ? 'yes' : '-', 7), pad(r.distil ? 'yes' : '-', 7), pad(r.auth ? 'yes' : '-', 6), pad(r.identity ? 'yes' : '-', 5), r.verdict);
  }
  const counts = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
  console.log('\nsummary:', JSON.stringify(counts));
  const insecure = rows.filter((r) => r.verdict === 'loop-INSECURE');
  if (insecure.length) console.log('\n⚠ INSECURE (unauthenticated memory routes):', insecure.map((r) => r.repo).join(', '));
}

// CI gate: fail when a repo mounts a memory loop without tool-auth (the cross-tenant hole). Pass
// --allow-insecure to audit without failing (report-only). Widget-only + loop-secure never fail.
if (!process.argv.includes('--allow-insecure') && rows.some((r) => r.verdict === 'loop-INSECURE')) {
  process.exitCode = 1;
}
