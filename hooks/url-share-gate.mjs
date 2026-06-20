#!/usr/bin/env node
/**
 * hooks/url-share-gate.mjs — the Pipeline Gate's URL-share enforcement.
 *
 * A Claude Code **Stop hook**. It fires when the agent finishes a turn, reads the
 * agent's last message, and if that message surfaces a product's `*.vercel.app`
 * URL, it REFUSES to let the turn end unless a `/naive-tester` PASS is recorded for
 * what that product is serving in production RIGHT NOW (Delta 2).
 *
 * This is the bite that stops the exact failure that triggered the whole gate:
 * the agent shared an unaudited SayFix URL, which immediately failed for the
 * operator on broken signup. PRODUCT_STANDARDS §0.5: no product URL leaves your
 * hands — even to the operator — until /naive-tester passes. Documentation said so;
 * nothing enforced it. This does.
 *
 * Contract (Claude Code Stop hook):
 *   stdin  : { session_id, transcript_path, stop_hook_active, cwd, ... }
 *   stdout : {} to allow, or { "decision": "block", "reason": "..." } to refuse the stop
 *            (the reason is fed back to the agent so it retracts the URL + runs the audit).
 *
 * Fail-OPEN on its own errors (a broken hook must not wedge every session), but
 * fail-CLOSED on a clear gate verdict (a resolved product with no PASS → block).
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath, basename } from "node:path";
import { spawnSync } from "node:child_process";

const PORTFOLIO_BASE = process.env.PORTFOLIO_BASE ?? join(homedir(), "PycharmProjects");
const GATE_CHECK = process.env.GATE_CHECK_PATH ?? join(PORTFOLIO_BASE, "cais-shared-services", "scripts", "gate-check.mjs");

function allow() { process.stdout.write("{}"); process.exit(0); }
function block(reason) { process.stdout.write(JSON.stringify({ decision: "block", reason })); process.exit(0); }

// --- read the hook payload ---------------------------------------------------
let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { allow(); }

// Already re-entered after a block — the agent has been warned; don't loop forever.
if (payload.stop_hook_active) allow();

// SCOPE (re-scoped 2026-06-20): the gate guards against leaking a PRODUCT's URL to a PROSPECT
// before audit. When the agent is working IN a factory/meta repo (pipeline, cais-shared-services),
// product-URL mentions are OPERATIONAL — orchestrating the factory (setting mvp_url, dispatching
// builds, reporting a build's status to the operator), NOT sharing a product to a prospect. The
// pipeline runs /naive-tester itself as part of drive-to-ready, and the real external-share
// protection lives at the outreach-send path. Gating those internal mentions was pure friction
// (and mis-scoped — it checked the WORKING repo's own naive-tester status). So exempt factory
// repos here; the gate still bites in actual PRODUCT repos, where surfacing the repo's own URL is
// the genuine §0.5 leak risk (the SayFix incident that created the gate).
const FACTORY_REPOS = new Set(["pipeline", "cais-shared-services", "corporate-ai-solutions"]);
{
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: payload.cwd ?? process.cwd(), encoding: "utf8" });
  const cwdRepo = r.status === 0 ? basename(r.stdout.trim()).toLowerCase() : null;
  if (cwdRepo && FACTORY_REPOS.has(cwdRepo)) allow();
}

// --- pull the agent's last message text from the transcript ------------------
function lastAssistantText(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  let lines;
  try { lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/).filter(Boolean); } catch { return ""; }
  for (let i = lines.length - 1; i >= 0; i--) {
    let row;
    try { row = JSON.parse(lines[i]); } catch { continue; }
    const msg = row.message ?? row;
    const role = msg.role ?? row.type;
    if (role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
    }
    return "";
  }
  return "";
}

const text = lastAssistantText(payload.transcript_path);
if (!text) allow();

// --- find vercel URLs in the message -----------------------------------------
const urls = [...text.matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.vercel\.app/gi)].map((m) => m[0]);
if (urls.length === 0) allow();

// --- resolve candidate product slugs -----------------------------------------
// Primary signal: the product currently being built = the repo the agent is in.
// Secondary: the first hostname label of each vercel URL (covers <slug>.vercel.app
// and <slug>-<hash>-<team>.vercel.app). gate-check decides if a candidate is a real
// product (it can resolve a live prod deployment) — unknown candidates fail OPEN.
const candidates = new Set();
const repoTop = (() => {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: payload.cwd ?? process.cwd(), encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
})();
if (repoTop) candidates.add(basename(repoTop).toLowerCase()); // Vercel project names are lowercase
for (const u of urls) {
  const label = u.replace(/^https?:\/\//, "").replace(/\.vercel\.app.*$/i, "").toLowerCase();
  candidates.add(label);              // clean alias: <slug>.vercel.app → <slug> (handles multi-word slugs)
  candidates.add(label.split("-")[0]); // deployment alias: <slug>-<hash>-<team> → first token
}

// --- ask gate-check for each candidate ---------------------------------------
function gate(slug) {
  const r = spawnSync("node", [GATE_CHECK, "url-share-allowed", slug], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

let blockedReason = null;
for (const slug of candidates) {
  if (!slug) continue;
  const { status, out } = gate(slug);
  // gate-check exits: 0 = ALLOWED, 1 = BLOCKED (resolved product, no PASS OR no live deploy).
  // "no live production deployment" means the candidate isn't a known product → fail OPEN.
  if (status === 0) continue;                                  // audited → fine
  if (/no live production deployment/i.test(out)) continue;    // not a known product → ignore
  if (status === 1) {                                          // known product, BLOCKED
    blockedReason =
      `URL-SHARE GATE: you are about to surface a product URL (${urls.join(", ")}) for "${slug}", but ` +
      `no /naive-tester PASS is recorded for what production is serving right now. ` +
      `PRODUCT_STANDARDS §0.5: no product URL leaves your hands — even to the operator — until the audit passes. ` +
      `Run /naive-tester against the production URL, fix any ❌, then record the PASS ` +
      `(node cais-shared-services/scripts/gate-check.mjs record ${slug} naive-tester pass --deployment <live-id> ...). ` +
      `Until then, do NOT share the URL. Details: ${out.trim()}`;
    break;
  }
  // any other non-zero (status 2 / null = gate-check error) → fail OPEN (don't wedge the session)
}

if (blockedReason) block(blockedReason);
allow();
