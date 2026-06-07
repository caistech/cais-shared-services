#!/usr/bin/env node
/**
 * scripts/validate.mjs — the validation ORCHESTRATOR (local now, CI-native later).
 *
 * Closes the loop the headless rescore can't: it runs the AGENT producers (naive-tester,
 * voice-auditor) against a product's live URL, lets them record verdicts to readiness_results,
 * then calls the cockpit rescore (which refreshes the HEADLESS producers — survey P1/P2/P3),
 * so the card reflects the FULL post-fix state instead of leaving the agent checks STALE.
 *
 * THE SEAM (this is the whole point): each tester is a pluggable "runner" with one contract —
 * get verdicts for <slug> into readiness_results (via gate-check record-readiness). Two modes:
 *
 *   --mode local  (default) → runner shells `claude -p "/<skill> ..."` — the installed gstack
 *                  skill walks the URL and self-records. Works today, needs the machine on.
 *   --mode ci     → runner shells the CI-native Playwright+vision agent (Option B). NOT built
 *                  yet — the runner is a stub that exits with a notice (degrade-don't-fake).
 *
 * When Option B lands, ONLY the `ci` runner command changes. The orchestrator, the ingest
 * (gate-check), and the rescore call stay identical. That is why the loop is wired this way:
 * the local path PROVES the loop, then the runner is swapped for the unattended one.
 *
 * Usage:
 *   COCKPIT_BASE=https://... node scripts/validate.mjs <slug> \
 *     [--url <liveUrl>] [--deployment <id>] [--mode local|ci] \
 *     [--only naive-tester,voice-auditor] [--no-rescore] [--dry-run]
 *
 * Env (local mode, for the skill walk's QA auth — see docs/TESTING.md):
 *   COCKPIT_BASE (required), QA_TEST_EMAIL, QA_OWNER_PASSWORD, QA_USER_PASSWORD,
 *   SUPABASE_SERVICE_ROLE_KEY (for qa-session.mjs magic-link mint), VERCEL_AUTOMATION_BYPASS.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE_CHECK = resolve(HERE, "gate-check.mjs");

// ---- tiny arg parser ----------------------------------------------------------
const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith("--"));
function flag(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : undefined;
}
const opts = {
  url: flag("url"),
  deployment: flag("deployment"),
  mode: flag("mode") || "local",
  only: flag("only") ? String(flag("only")).split(",").map((s) => s.trim()) : null,
  noRescore: flag("no-rescore") === true,
  dryRun: flag("dry-run") === true,
};

const COCKPIT_BASE = process.env.COCKPIT_BASE;

function log(stage, data) {
  // structured prefixes per the project DEBUGGING STANDARD
  console.log(`[VALIDATE:${stage}]`, typeof data === "string" ? data : JSON.stringify(data));
}
function die(msg) {
  console.error(`[VALIDATE:ERROR] ${msg}`);
  process.exit(1);
}

if (!slug) die("missing <slug>. usage: node scripts/validate.mjs <slug> [--url ..] [--deployment ..] [--mode local|ci]");
if (!COCKPIT_BASE) die("COCKPIT_BASE env is required (the cockpit base url that serves /api/admin/pipeline/<slug>).");

// ---- the AGENT producers this orchestrator owns -------------------------------
// (headless producers — survey P1/P2/P3 — are owned by the cockpit rescore, not here.)
const PRODUCERS = [
  { source: "naive-tester", skill: "naive-tester" },
  { source: "voice-auditor", skill: "voice-auditor" },
];

/**
 * Resolve the live URL + deployment from the cockpit card spec when not passed.
 * Mirrors how design-build.yml fetches /api/admin/pipeline/<slug>.
 */
async function resolveTarget() {
  if (opts.url && opts.deployment) return { url: opts.url, deployment: opts.deployment };
  log("resolve", `fetching card spec for ${slug}`);
  const res = await fetch(`${COCKPIT_BASE}/api/admin/pipeline/${slug}`).catch((e) => {
    die(`could not reach cockpit spec: ${e.message}`);
  });
  if (!res.ok) die(`cockpit spec returned ${res.status} for ${slug}`);
  const spec = await res.json();
  const url = opts.url || spec.url || spec.live_url || spec.deployment_url;
  const deployment = opts.deployment || spec.deployment_id || spec.latest_deployment_id || null;
  if (!url) die("no live URL on the card and none passed via --url; cannot run agent producers.");
  return { url, deployment, spec };
}

/** Snapshot the current per-check readiness from the card spec score. */
function snapshot(spec) {
  const checks = (spec && spec.score && Array.isArray(spec.score.checks)) ? spec.score.checks : [];
  const m = {};
  for (const c of checks) if (c && c.code != null) m[c.code] = c.status;
  return m;
}

// ---- the pluggable tester RUNNER (the seam) -----------------------------------
function runLocalSkill(producer, url) {
  // The installed gstack skill walks the URL and self-records via gate-check
  // (see ~/.claude/skills/<skill>/SKILL.md "Recording readiness verdicts").
  const prompt =
    `/${producer.skill} ${url}\n\n` +
    `Target product slug: ${slug}. This is an automated validation run. Walk the live URL, ` +
    `then RECORD your verdicts to readiness_results exactly as the skill documents: ` +
    `node ${GATE_CHECK} record-readiness ${slug} --source ${producer.source} ` +
    `${opts.deployment ? `--deployment ${opts.deployment}` : "--no-deployment"} --file <results.json>. ` +
    `Do not skip the recording step — it is the only output that matters here.`;
  log("runner", `local skill /${producer.skill} against ${url}`);
  if (opts.dryRun) { log("dry-run", `would: claude -p "${prompt.slice(0, 80)}..."`); return { ok: true, dry: true }; }
  const r = spawnSync("claude", ["-p", prompt], { stdio: "inherit", encoding: "utf8" });
  return { ok: r.status === 0, status: r.status };
}

function runCiAgent(producer, url) {
  // Option B lands here: a Playwright + Anthropic-vision agent that produces a results.json
  // and the orchestrator records it via gate-check. Until then, degrade-don't-fake.
  log("runner", `ci agent for ${producer.source} — NOT BUILT YET`);
  console.warn(
    `[VALIDATE:ci] The CI-native ${producer.source} agent (Option B) is not implemented. ` +
    `Recording NOTHING rather than a shallow fake. Build it at scripts/agents/${producer.source}.mjs ` +
    `(Playwright drive + vision verdicts) and have it emit results.json, then this runner records it.`,
  );
  return { ok: false, notImplemented: true };
}

async function main() {
  const { url, deployment, spec } = await resolveTarget();
  if (deployment) opts.deployment = deployment;
  const before = snapshot(spec);
  log("target", { slug, url, deployment: opts.deployment || "(none)", mode: opts.mode });

  const producers = opts.only ? PRODUCERS.filter((p) => opts.only.includes(p.source)) : PRODUCERS;
  const results = [];
  for (const p of producers) {
    const run = opts.mode === "ci" ? runCiAgent(p, url) : runLocalSkill(p, url);
    results.push({ source: p.source, ...run });
  }

  // Refresh the HEADLESS producers (survey P1/P2/P3) so the card reflects both halves.
  if (!opts.noRescore && opts.deployment && !opts.dryRun) {
    log("rescore", `POST /api/admin/pipeline/${slug}/rescore { deploymentId: ${opts.deployment} }`);
    const rr = await fetch(`${COCKPIT_BASE}/api/admin/pipeline/${slug}/rescore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentId: opts.deployment }),
    }).catch((e) => { console.warn(`[VALIDATE:rescore] failed: ${e.message}`); return null; });
    if (rr && rr.ok) {
      const j = await rr.json().catch(() => ({}));
      const after = snapshot({ score: j.score || j });
      const moved = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
      log("done", { score: (j.score && j.score.band) || j.band || "?", moved_checks: moved });
    } else {
      log("rescore", "no usable rescore response (card may still need a manual re-open)");
    }
  } else {
    log("rescore", opts.deployment ? "skipped (--no-rescore/--dry-run)" : "skipped (no deployment id)");
  }

  const failed = results.filter((r) => !r.ok && !r.dry);
  if (failed.length) { log("summary", { ran: results.length, failed: failed.map((f) => f.source) }); process.exit(2); }
  log("summary", { ran: results.length, ok: true });
}

main().catch((e) => die(e.stack || e.message));
