// scripts/audit-convai-consumers.mjs
// Audit every @caistech/elevenlabs-convai consumer by what it ACTUALLY MOUNTS, not what it installs.
// "Rolled out" kept meaning "the dependency is in package.json" — this proves the difference:
// widget-only vs a mounted memory loop, and whether a mounted loop is SECURE (tool-auth + server-baked
// identity) or exposed (unauthenticated memory routes = the cross-tenant hole).
//
// Verdicts:
//   widget-only        — installs the package for the VoiceWidget; no memory routes. Fine as-is.
//   loop-secure        — either (a) mounts recall/save tool routes AND auths them (toolSecret+uid, OR
//                        the discovery-agent signed-token model), or (b) start/post-call-distil only,
//                        authed by an HMAC-signed session token / post-call HMAC (no tool routes to guard).
//   loop-INSECURE      — mounts a recall/save TOOL route WITHOUT tool-auth → reachable unauthenticated
//                        (the cross-tenant hole). This is the only verdict that fails CI.
//   loop-legacy        — recall/save tool routes, authed, but on the pre-0.6.0 conversation-id identity
//                        path (memory likely broken in real calls: EL never passes conversation_id).
//   loop-review        — mounts a capture path (start/distil) but neither discovery-token nor post-call
//                        HMAC was detected — a human should confirm the post-call auth (not a tool hole).
//
// Auth models recognised: tool-secret (Kira/operational) · discovery (@caistech/discovery-agent signed
// session token) · hmac (post-call). A discovery-pattern repo has NO toolSecret by design and is secure.
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

  // The cross-tenant hole is specifically an unauthenticated recall_memory / save_memory TOOL route
  // (the mid-call tools that read/write a user's memory and resolve identity). start_conversation
  // (resolveSession) and post-call distil (HMAC) are authed by their OWN mechanisms, so their mere
  // presence is NOT the hole. Two valid auth models secure the tool routes:
  //   • Kira/operational: an x-*-tool-secret header (toolSecret) + server-baked ?uid identity.
  //   • Discovery/anonymous: @caistech/discovery-agent, identity from an HMAC-signed session token
  //     (verifyAnonSessionToken — unforgeable, server-derived). No toolSecret by design.
  const hasRecallRoute = walk(repoDir, (p) => /[\\/](recall_memory|recall-memory)[\\/]route\.(ts|js)x?$/.test(p)).length > 0;
  const hasSaveRoute = walk(repoDir, (p) => /[\\/](save_memory|save-memory)[\\/]route\.(ts|js)x?$/.test(p)).length > 0;
  const hasStartRoute = walk(repoDir, (p) => /[\\/](start_conversation|start-conversation)[\\/]route\.(ts|js)x?$/.test(p)).length > 0;
  const srcFiles = walk(repoDir, (p) => /\.(ts|tsx|js|mjs)$/.test(p));
  const hasDistil = grepAny(srcFiles, [/distillConversationToMemory/]);
  const usesToolSecret = grepAny(srcFiles, [/toolSecret|x-convai-tool-secret|x-kira-tool-secret|toolSecretOk/]);
  const usesIdentity = grepAny(srcFiles, [/resolveToolIdentity|[?&]uid=/]);
  // The discovery-agent signed-token model (a distinct, canonical auth path — VOICE_MEMORY_STANDARD).
  const usesDiscoveryAuth = grepAny(srcFiles, [
    /@caistech\/discovery-agent|defineDiscovery|verifyAnonSessionToken|mintAnonSessionToken|resolveDiscoverySession|\.webhookRoutes\(/,
  ]);
  // Post-call HMAC — secures the distil/post-call route (a separate mechanism from tool-auth).
  const usesHmac = grepAny(srcFiles, [/ELEVENLABS_WEBHOOK_SECRET|postCallSecret/]);

  const hasToolMemoryRoute = hasRecallRoute || hasSaveRoute; // the routes that MUST carry tool-auth
  const toolAuthed = usesToolSecret || usesDiscoveryAuth;
  const hasIdentity = usesIdentity || usesDiscoveryAuth;
  const mountsLoop = hasRecallRoute || hasSaveRoute || hasStartRoute || hasDistil;

  let verdict;
  if (!mountsLoop) verdict = 'widget-only';
  else if (hasToolMemoryRoute && !toolAuthed) verdict = 'loop-INSECURE';   // the real cross-tenant hole
  else if (hasToolMemoryRoute && !hasIdentity) verdict = 'loop-legacy';    // authed, but pre-0.6.0 identity model
  else if (hasToolMemoryRoute) verdict = 'loop-secure';                    // authed recall/save tool + identity
  else if (usesDiscoveryAuth || usesHmac) verdict = 'loop-secure';         // start/distil-only, authed by token/HMAC
  else verdict = 'loop-review';                                            // capture path present, auth unconfirmed

  rows.push({ repo, version, recall: hasRecallRoute, save: hasSaveRoute, distil: hasDistil, auth: toolAuthed || usesHmac, identity: hasIdentity, model: usesDiscoveryAuth ? 'discovery' : usesToolSecret ? 'tool-secret' : usesHmac ? 'hmac' : '-', verdict });
}

rows.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.repo.localeCompare(b.repo));

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log(`\n@caistech/elevenlabs-convai consumers (${rows.length}):\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('repo', 26), pad('version', 10), pad('recall', 7), pad('distil', 7), pad('auth', 6), pad('uid', 5), pad('model', 12), 'verdict');
  console.log('-'.repeat(104));
  for (const r of rows) {
    console.log(pad(r.repo, 26), pad(r.version, 10), pad(r.recall ? 'yes' : '-', 7), pad(r.distil ? 'yes' : '-', 7), pad(r.auth ? 'yes' : '-', 6), pad(r.identity ? 'yes' : '-', 5), pad(r.model, 12), r.verdict);
  }
  const counts = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
  console.log('\nsummary:', JSON.stringify(counts));
  const insecure = rows.filter((r) => r.verdict === 'loop-INSECURE');
  if (insecure.length) console.log('\n⚠ INSECURE (unauthenticated recall/save tool routes):', insecure.map((r) => r.repo).join(', '));
  const review = rows.filter((r) => r.verdict === 'loop-review');
  if (review.length) console.log('\n… REVIEW (capture path present, post-call auth unconfirmed):', review.map((r) => r.repo).join(', '));
}

// CI gate: fail when a repo mounts a memory loop without tool-auth (the cross-tenant hole). Pass
// --allow-insecure to audit without failing (report-only). Widget-only + loop-secure never fail.
if (!process.argv.includes('--allow-insecure') && rows.some((r) => r.verdict === 'loop-INSECURE')) {
  process.exitCode = 1;
}
