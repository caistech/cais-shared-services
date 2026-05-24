#!/usr/bin/env node
/**
 * feature-preflight.mjs — verify all env vars + external setup required by
 * a feature (or every feature) before that feature is tested.
 *
 * Purpose: kill the "discover missing env var mid-test" failure mode.
 * Every non-trivial feature in a portfolio repo MUST have a manifest under
 * ./feature-manifests/<slug>.json declaring its env-var + external-setup
 * dependencies. This script reads those manifests, compares against
 * .env.local + vercel env ls, and reports a "you are not ready to test"
 * checklist when anything is missing.
 *
 * Run from a project root:
 *   node ~/PycharmProjects/cais-shared-services/scripts/feature-preflight.mjs
 *   node ~/PycharmProjects/cais-shared-services/scripts/feature-preflight.mjs --feature hemp-homes-outreach
 *   node ~/PycharmProjects/cais-shared-services/scripts/feature-preflight.mjs --gen-secrets    # also generate values for missing CRON_SECRET / *_WEBHOOK_SECRET
 *   node ~/PycharmProjects/cais-shared-services/scripts/feature-preflight.mjs --skip-vercel    # only check .env.local
 *   node ~/PycharmProjects/cais-shared-services/scripts/feature-preflight.mjs --skip-forks     # skip the shared-package fork check
 *   node ~/PycharmProjects/cais-shared-services/scripts/feature-preflight.mjs --json           # machine-parseable output
 *
 * Before the env-var checks it runs check-shared-forks.mjs (exit 2 on a fork):
 * a repo that vendored a copy of a shared @caistech helper instead of importing
 * it fails fast. This runs even when there are no feature manifests, because a
 * fork can live in any voice-bearing repo.
 *
 * Manifest schema (JSON, one file per feature):
 *
 *   {
 *     "name": "hemp-homes-outreach",
 *     "description": "AI-drafted prospect outreach pipeline",
 *     "introduced_at": "2026-05-22",
 *     "env_vars": [
 *       {
 *         "name": "ANTHROPIC_API_KEY",
 *         "required": true,
 *         "description": "Claude API key for LLM polish",
 *         "scope": ["production", "preview"],
 *         "where": "Anthropic Console → API Keys",
 *         "generator": null,
 *         "depends_on": []
 *       }
 *     ],
 *     "external_setup": [
 *       {
 *         "id": "resend_webhook_endpoint",
 *         "type": "dashboard",
 *         "title": "Resend webhook endpoint",
 *         "url": "https://resend.com/webhooks",
 *         "steps": [
 *           "Add Endpoint",
 *           "URL: ${NEXT_PUBLIC_CANONICAL_URL}/api/webhooks/resend",
 *           "Events: email.delivered, email.bounced, email.complained, email.opened, email.clicked, email.failed",
 *           "Save and copy signing secret to RESEND_WEBHOOK_SECRET on Vercel"
 *         ]
 *       }
 *     ]
 *   }
 *
 * Generators: "random-32" | "random-48" | "random-64" — emits a base64url
 * value of that byte length, suitable for CRON_SECRET / webhook signing /
 * HMAC token roles.
 */

import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const argFlag = (name) => args.includes(`--${name}`);
const argValue = (name) => {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return null;
  const tok = args[i];
  if (tok.includes("=")) return tok.split("=").slice(1).join("=");
  return args[i + 1] ?? null;
};

const onlyFeature = argValue("feature");
const skipVercel = argFlag("skip-vercel");
const skipForks = argFlag("skip-forks");
const genSecrets = argFlag("gen-secrets");
const jsonOut = argFlag("json");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};
const log = (s = "") => process.stdout.write(s + "\n");

// ─── manifest discovery ─────────────────────────────────────────────────────

const projectRoot = process.cwd();

// ─── shared-package fork check (runs first; independent of feature manifests) ─
// Fail fast if the repo vendored a copy of a shared @caistech helper instead of
// importing it. Runs before the manifest gate on purpose — forks live in any
// voice-bearing repo, including ones with no feature-manifests/ directory.
if (!skipForks) {
  const forkCheck = fileURLToPath(new URL("./check-shared-forks.mjs", import.meta.url));
  const r = spawnSync("node", [forkCheck, ...(jsonOut ? ["--json"] : [])], {
    cwd: projectRoot,
    stdio: jsonOut ? "pipe" : "inherit",
  });
  if (r.status === 2) {
    if (jsonOut && r.stdout) process.stdout.write(r.stdout.toString());
    process.exit(2);
  }
}

const manifestDir = join(projectRoot, "feature-manifests");

if (!existsSync(manifestDir)) {
  if (jsonOut) {
    log(JSON.stringify({ error: "no feature-manifests/ directory", projectRoot }));
  } else {
    log(`${C.red}✗ No ${C.bold}feature-manifests/${C.reset}${C.red} directory in ${projectRoot}${C.reset}`);
    log(`${C.dim}  Create one and add JSON manifests for each feature. See the schema in this script's header comment.${C.reset}`);
  }
  process.exit(1);
}

const manifestFiles = readdirSync(manifestDir).filter((f) => f.endsWith(".json"));
if (manifestFiles.length === 0) {
  log(`${C.yellow}⚠ No manifests found in ${manifestDir}${C.reset}`);
  process.exit(1);
}

const manifests = [];
for (const f of manifestFiles) {
  const path = join(manifestDir, f);
  try {
    const json = JSON.parse(readFileSync(path, "utf-8"));
    if (onlyFeature && json.name !== onlyFeature) continue;
    manifests.push({ path, ...json });
  } catch (e) {
    log(`${C.red}✗ Could not parse ${f}: ${e.message}${C.reset}`);
    process.exit(1);
  }
}
if (manifests.length === 0) {
  log(`${C.red}✗ No manifest matches --feature=${onlyFeature}${C.reset}`);
  process.exit(1);
}

// ─── env discovery ──────────────────────────────────────────────────────────

function parseEnvFile(content) {
  const out = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Local: .env.local in cwd
let localEnv = {};
const localPath = join(projectRoot, ".env.local");
if (existsSync(localPath)) {
  localEnv = parseEnvFile(readFileSync(localPath, "utf-8"));
}

// Vercel: pull each environment to a tempdir and read keys
const vercelEnv = { production: {}, preview: {}, development: {} };
let vercelStatus = "skipped";

if (!skipVercel) {
  try {
    // Check vercel CLI is available
    const ver = spawnSync("vercel", ["--version"], { encoding: "utf-8" });
    if (ver.status !== 0) {
      vercelStatus = "vercel-cli-missing";
    } else {
      const tmp = mkdtempSync(join(tmpdir(), "feature-preflight-"));
      try {
        for (const envName of ["production", "preview", "development"]) {
          const target = join(tmp, `.env.${envName}`);
          const r = spawnSync("vercel", ["env", "pull", target, "--environment", envName, "--yes"], {
            encoding: "utf-8",
            cwd: projectRoot,
          });
          if (r.status !== 0) {
            // Often happens when there's no preview/dev branch — record but continue
            continue;
          }
          if (existsSync(target)) {
            const content = readFileSync(target, "utf-8");
            vercelEnv[envName] = parseEnvFile(content);
          }
        }
        vercelStatus = "ok";
      } finally {
        try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    vercelStatus = `error: ${e.message}`;
  }
}

// ─── secret generators ──────────────────────────────────────────────────────

function generateSecret(kind) {
  const sizes = { "random-32": 32, "random-48": 48, "random-64": 64 };
  const n = sizes[kind];
  if (!n) return null;
  return randomBytes(n).toString("base64url");
}

// ─── per-feature evaluation ─────────────────────────────────────────────────

const report = [];

for (const m of manifests) {
  const featureReport = {
    name: m.name,
    description: m.description ?? null,
    env_vars: [],
    external_setup: [],
    summary: { missing: 0, partial: 0, ok: 0, generated: 0, external_pending: 0 },
  };

  for (const v of m.env_vars ?? []) {
    const scope = v.scope ?? ["production", "preview"];
    const inLocal = v.name in localEnv && localEnv[v.name] !== "";
    const inProd = v.name in vercelEnv.production && vercelEnv.production[v.name] !== "";
    const inPrev = v.name in vercelEnv.preview && vercelEnv.preview[v.name] !== "";
    const inDev = v.name in vercelEnv.development && vercelEnv.development[v.name] !== "";

    const wanted = new Set(scope);
    const missing = [];
    if (wanted.has("production") && !inProd) missing.push("production");
    if (wanted.has("preview") && !inPrev) missing.push("preview");
    if (wanted.has("development") && !inDev) missing.push("development");

    let status;
    if (vercelStatus !== "ok") {
      // Vercel check unavailable — fall back to local only
      status = inLocal ? "local-ok-vercel-unknown" : "missing-local";
    } else if (missing.length === 0) {
      status = "ok";
    } else if (missing.length < scope.length) {
      status = "partial";
    } else {
      status = "missing";
    }

    let generatedValue = null;
    if (genSecrets && status !== "ok" && v.generator) {
      generatedValue = generateSecret(v.generator);
      featureReport.summary.generated++;
    }

    if (status === "ok" || status === "local-ok-vercel-unknown") featureReport.summary.ok++;
    else if (status === "partial") featureReport.summary.partial++;
    else featureReport.summary.missing++;

    featureReport.env_vars.push({
      name: v.name,
      required: v.required !== false,
      description: v.description ?? null,
      scope,
      where: v.where ?? null,
      depends_on: v.depends_on ?? [],
      status,
      missing_environments: missing,
      in_local: inLocal,
      generator: v.generator ?? null,
      generated_value: generatedValue,
    });
  }

  for (const s of m.external_setup ?? []) {
    featureReport.external_setup.push({
      id: s.id,
      type: s.type ?? "dashboard",
      title: s.title,
      description: s.description ?? null,
      url: s.url ?? null,
      steps: s.steps ?? [],
      status: "unverified",
    });
    featureReport.summary.external_pending++;
  }

  report.push(featureReport);
}

// ─── output ─────────────────────────────────────────────────────────────────

if (jsonOut) {
  log(JSON.stringify({
    project_root: projectRoot,
    vercel_status: vercelStatus,
    manifest_count: manifests.length,
    features: report,
  }, null, 2));
  process.exit(report.some((f) => f.summary.missing > 0 || f.summary.partial > 0) ? 1 : 0);
}

// Pretty terminal output
log("");
log(`${C.bold}🔍 Feature pre-flight${C.reset} ${C.dim}— ${projectRoot}${C.reset}`);
log("");
if (vercelStatus !== "ok") {
  log(`${C.yellow}⚠ Vercel env check status: ${vercelStatus}${C.reset}`);
  log(`${C.dim}  Falling back to .env.local only. Re-run with vercel CLI auth for full coverage.${C.reset}`);
  log("");
}

let anyMissing = false;
let anyPartial = false;
for (const f of report) {
  log(`${C.bold}${C.cyan}━━━ ${f.name} ━━━${C.reset}  ${C.dim}${f.description ?? ""}${C.reset}`);
  log("");

  if (f.env_vars.length === 0) {
    log(`  ${C.dim}(no env vars declared)${C.reset}`);
  } else {
    log(`  ${C.bold}Env vars (${f.env_vars.length})${C.reset}`);
    for (const e of f.env_vars) {
      let icon, colour, suffix;
      if (e.status === "ok") {
        icon = "✅"; colour = C.green; suffix = e.scope.join(", ");
      } else if (e.status === "local-ok-vercel-unknown") {
        icon = "🟡"; colour = C.yellow; suffix = "set locally; Vercel state unknown";
      } else if (e.status === "partial") {
        icon = "⚠️ "; colour = C.yellow; suffix = `missing on: ${e.missing_environments.join(", ")}`;
        anyPartial = true;
      } else {
        icon = "❌"; colour = C.red; suffix = "NOT SET";
        anyMissing = true;
      }
      log(`    ${icon} ${colour}${e.name.padEnd(32)}${C.reset}  ${C.dim}${suffix}${C.reset}`);
      if (e.status === "missing" || e.status === "partial" || e.status === "missing-local") {
        if (e.description) log(`         ${C.dim}↳ ${e.description}${C.reset}`);
        if (e.where) log(`         ${C.dim}↳ Where: ${e.where}${C.reset}`);
        if (e.generated_value) log(`         ${C.bold}↳ Generated value:${C.reset} ${C.green}${e.generated_value}${C.reset}`);
        else if (e.generator) log(`         ${C.dim}↳ Re-run with --gen-secrets to generate a value (generator: ${e.generator})${C.reset}`);
      }
    }
  }

  if (f.external_setup.length > 0) {
    log("");
    log(`  ${C.bold}External setup (${f.external_setup.length})${C.reset}`);
    for (const s of f.external_setup) {
      log(`    ${C.blue}❓${C.reset} ${C.bold}${s.title}${C.reset}  ${C.dim}(${s.type}; verify manually)${C.reset}`);
      if (s.description) log(`         ${C.dim}${s.description}${C.reset}`);
      if (s.url) log(`         ${C.dim}↳ ${s.url}${C.reset}`);
      for (const step of s.steps) {
        log(`         ${C.dim}• ${step}${C.reset}`);
      }
    }
  }

  log("");
}

log("");
if (anyMissing) {
  log(`${C.red}${C.bold}✗ ACTION REQUIRED${C.reset}${C.red} — missing env vars; the feature will fail on test.${C.reset}`);
  process.exit(1);
} else if (anyPartial) {
  log(`${C.yellow}${C.bold}⚠ Partial coverage${C.reset}${C.yellow} — some vars set on only one environment.${C.reset}`);
  process.exit(1);
} else {
  log(`${C.green}${C.bold}✓ All declared env vars present${C.reset}${C.green}. Verify external setup manually before testing.${C.reset}`);
  process.exit(0);
}
