#!/usr/bin/env node
/**
 * scripts/gate-check.mjs — the Pipeline Gate's shared check module.
 *
 * The SINGLE SOURCE OF TRUTH for "has gate X passed for product Y" is the
 * `pipeline_gates` ledger table in the Corporate-AI-Solutions cockpit Supabase.
 * This module is the dependency-free node accessor that all the EXECUTION-PATH
 * consumers read through:
 *   - the operator's Claude Code URL-share hook (refuse an unaudited product URL)
 *   - new-product.mjs / domain purchase / Tier-1 build (refuse scale-infra pre-Gate-2)
 * (The cockpit app reads the same table via its own server supabase client.)
 *
 * Enforcement, not advice: the design (APPROVED) makes the irreversible/outward
 * actions REFUSE unless the required PASS is in the ledger — because
 * documentation-as-governance fails under build momentum.
 *
 * Delta 2 (Dennis, 2026-05-26): a `naive-tester` PASS binds to the LIVE production
 * DEPLOYMENT id, never just the git commit — a stale build or an env-only regression
 * (a broken sender) is exactly what a commit-only check misses, and exactly what
 * failed on SayFix. `urlShareAllowed` resolves what production is *actually serving*
 * and requires the PASS to be bound to THAT deployment.
 *
 * Creds resolution (operator-machine friendly, no extra setup):
 *   1. CAIS_GATES_URL + CAIS_GATES_SERVICE_KEY (explicit)
 *   2. ~/.cais-gates.json  { "url": "...", "serviceKey": "..." }
 *   3. <portfolio>/Corporate-AI-Solutions/.env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * CLI:
 *   node gate-check.mjs check <slug> <gate> [--deployment <id>]   exit 0 pass / 1 fail
 *   node gate-check.mjs record <slug> <gate> <pass|fail> [--deployment <id>] [--commit <sha>] [--artifact <ref>] [--reason "..."] [--override] [--by name]
 *   node gate-check.mjs prod-deployment <slug>                    print the live prod deployment id + commit
 *   node gate-check.mjs url-share-allowed <slug>                  exit 0 if a naive-tester PASS is bound to the live prod deployment, else 1
 *   node gate-check.mjs scale-infra-allowed <slug>               exit 0 if gate2_go, else 1
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const PORTFOLIO_BASE = process.env.PORTFOLIO_BASE ?? resolvePath(HUB_ROOT, "..");

// ---------------------------------------------------------------------------
// creds + low-level PostgREST access (dependency-free)
// ---------------------------------------------------------------------------

function envValue(file, key) {
  try {
    const m = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
    if (!m) return null;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  } catch { return null; }
}

export function resolveGatesCreds() {
  if (process.env.CAIS_GATES_URL && process.env.CAIS_GATES_SERVICE_KEY) {
    return { url: process.env.CAIS_GATES_URL, key: process.env.CAIS_GATES_SERVICE_KEY };
  }
  const cfg = join(homedir(), ".cais-gates.json");
  if (existsSync(cfg)) {
    try {
      const j = JSON.parse(readFileSync(cfg, "utf8"));
      if (j.url && j.serviceKey) return { url: j.url, key: j.serviceKey };
    } catch { /* fall through */ }
  }
  const env = join(PORTFOLIO_BASE, "Corporate-AI-Solutions", ".env.local");
  const url = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (url && key) return { url, key };
  throw new Error(
    "gate-check: cockpit Supabase creds not found. Set CAIS_GATES_URL + CAIS_GATES_SERVICE_KEY, " +
    "or ~/.cais-gates.json, or ensure Corporate-AI-Solutions/.env.local exists.",
  );
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const { url, key } = resolveGatesCreds();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`gate-check REST ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
  return json;
}

// ---------------------------------------------------------------------------
// ledger API
// ---------------------------------------------------------------------------

/** The most recent ledger row for (slug, gate), or null. */
export async function latestGate(slug, gate) {
  const rows = await rest(
    `pipeline_gates?product_slug=eq.${encodeURIComponent(slug)}&gate=eq.${encodeURIComponent(gate)}&order=created_at.desc&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Has `gate` passed for `slug`? When `deploymentId` is given, the latest PASS must
 * be BOUND to that deployment (Delta 2) — a later deploy invalidates a prior PASS.
 */
export async function hasGatePassed(slug, gate, { deploymentId } = {}) {
  const row = await latestGate(slug, gate);
  if (!row || row.status !== "pass") return false;
  if (deploymentId && row.deployment_id !== deploymentId) return false;
  return true;
}

/** Append a gate result to the ledger (history-preserving; never an update). */
export async function recordGate({ slug, gate, status, deploymentId, commitSha, artifactRef, reason, isOverride = false, recordedBy = "system" }) {
  if (!slug || !gate || !["pass", "fail"].includes(status)) {
    throw new Error("recordGate: slug, gate, and status(pass|fail) are required");
  }
  return rest("pipeline_gates", {
    method: "POST",
    prefer: "return=representation",
    body: {
      product_slug: slug,
      gate,
      status,
      deployment_id: deploymentId ?? null,
      commit_sha: commitSha ?? null,
      artifact_ref: artifactRef ?? null,
      reason: reason ?? null,
      is_override: isOverride,
      recorded_by: recordedBy,
    },
  });
}

/** Read a card's gate2_go + build_type (the scale-infra unlock + gate-path router). */
export async function getCard(slug) {
  const rows = await rest(
    `methodology_hypothesis_cards?product_slug=eq.${encodeURIComponent(slug)}&select=product_slug,build_type,gate2_go,mvp_url&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Vercel: what is production ACTUALLY serving right now (Delta 2)
// ---------------------------------------------------------------------------

function vercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN.trim();
  try { return readFileSync(join(homedir(), ".vercel-token"), "utf8").trim(); } catch { return null; }
}

/**
 * The deployment id + commit currently serving the production alias for <slug>.
 * Assumes the Vercel project name == slug (the new-product.mjs convention).
 */
export async function getLiveProductionDeployment(slug, { teamId = process.env.VERCEL_TEAM_ID ?? "team_hwN7IFtd2Fo3DCj9C67ZwI1t" } = {}) {
  const token = vercelToken();
  if (!token) throw new Error("gate-check: VERCEL_TOKEN / ~/.vercel-token not found");
  const teamQ = `?teamId=${teamId}`;
  const h = { Authorization: `Bearer ${token}` };
  const proj = await (await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(slug)}${teamQ}`, { headers: h })).json();
  const prod = proj?.targets?.production;
  if (!prod) return null;
  return { deploymentId: prod.id ?? null, commitSha: prod.meta?.githubCommitSha ?? null, url: prod.url ?? null };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

// Returns the intended exit code; the runner sets it AFTER socket teardown so the
// Windows libuv/undici "handle CLOSING" assertion can't turn a clean 1 into a 127.
async function main() {
  const [cmd, slug, gate, statusArg] = process.argv.slice(2);
  switch (cmd) {
    case "check": {
      const ok = await hasGatePassed(slug, gate, { deploymentId: arg("deployment") });
      console.log(ok ? `PASS: ${gate} for ${slug}` : `BLOCKED: no ${gate} PASS for ${slug}`);
      return ok ? 0 : 1;
    }
    case "record": {
      const row = await recordGate({
        slug, gate, status: statusArg,
        deploymentId: arg("deployment"), commitSha: arg("commit"),
        artifactRef: arg("artifact"), reason: arg("reason"),
        isOverride: has("override"), recordedBy: arg("by") ?? "cli",
      });
      console.log(`recorded ${gate}=${statusArg} for ${slug}`, Array.isArray(row) ? `(id ${row[0]?.id})` : "");
      return 0;
    }
    case "prod-deployment": {
      const d = await getLiveProductionDeployment(slug);
      console.log(JSON.stringify(d));
      return d ? 0 : 1;
    }
    case "url-share-allowed": {
      // Delta 2: a naive-tester PASS must be bound to what production is serving NOW.
      const d = await getLiveProductionDeployment(slug);
      if (!d?.deploymentId) { console.log(`BLOCKED: no live production deployment for ${slug}`); return 1; }
      const ok = await hasGatePassed(slug, "naive-tester", { deploymentId: d.deploymentId });
      console.log(ok
        ? `ALLOWED: naive-tester PASS bound to live prod deployment ${d.deploymentId} for ${slug}`
        : `BLOCKED: no naive-tester PASS for ${slug}'s LIVE prod deployment ${d.deploymentId} (commit ${d.commitSha?.slice(0, 7)}). Run /naive-tester against the production URL and record the PASS.`);
      return ok ? 0 : 1;
    }
    case "scale-infra-allowed": {
      const card = await getCard(slug);
      const ok = !!card?.gate2_go;
      console.log(ok ? `ALLOWED: gate2_go for ${slug}` : `BLOCKED: ${slug} has no Gate-2 GO — multi-tenant/billing/white-label/domain are refused (thin-MVP creator is NOT gated by this).`);
      return ok ? 0 : 1;
    }
    default:
      console.error("usage: gate-check.mjs <check|record|prod-deployment|url-share-allowed|scale-infra-allowed> <slug> [gate] [status] [flags]");
      return 2;
  }
}

// Only run the CLI when invoked directly (not when imported).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  main()
    .then((code) => {
      process.exitCode = code ?? 0;
      // Don't call process.exit() while undici keep-alive sockets are mid-teardown
      // (the Windows libuv assertion). Let the loop drain; an unref'd fallback
      // hard-exits after the sockets have settled so we never hang on keep-alive.
      const t = setTimeout(() => process.exit(process.exitCode ?? 0), 300);
      t.unref();
    })
    .catch((e) => { console.error(`gate-check error: ${e.message}`); process.exit(2); });
}
