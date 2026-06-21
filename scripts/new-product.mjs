#!/usr/bin/env node
/**
 * scripts/new-product.mjs
 *
 * Template-agnostic new-product creator. Codifies the validated end-to-end
 * provisioning sequence (first run by hand for SayFix, 2026-05-26) into one
 * idempotent CLI. Lifts RaiseReady's create-* logic out of the raiseready-core
 * template so ANY new product can be spun up â€” no clone-RaiseReady coupling.
 *
 * Decisions baked in (see NEW_PRODUCT_CREATOR_SPEC.md Â§1):
 *   - Codebase: clone a --template repo (default: the CAIS starter) via
 *     `gh repo create --template`; bespoke empty repo if --no-template.
 *   - GitHub: private, owner caistech, name = slug, main + working branch.
 *   - Supabase: ap-southeast-2, free, CAIS org; migrate via the IPv4 session
 *     pooler (home networks lack IPv6).
 *   - Vercel: CAIS team, git-linked; env pushed (NEXT_PUBLIC plain, secrets
 *     sensitive, production+preview only â€” never development).
 *   - Auth: bare /auth/callback (onboard-new-project.sh wires it).
 *   - Keys: everything on CAIS keys at creation; BYOK is a later, per-product,
 *     lane-gated migration (each key tagged source:cais).
 *   - ElevenLabs: provisioned via @caistech/elevenlabs-convai (NOT the
 *     deprecated platform_settings.webhook shape). Skipped with --no-voice or
 *     if the package/key is unavailable.
 *   - Git: commit + push branch, STOP before PR.
 *   - Portfolio: auto-register manifest (via onboard) + platform-trust; the
 *     shared-repo changes are left UNCOMMITTED for review.
 *   - IDE: no automation â€” prints the local path.
 *
 * Usage:
 *   node scripts/new-product.mjs <slug> \
 *     [--template caistech/cais-starter | --no-template] \
 *     [--display-name "Name"] [--description "..."] \
 *     [--region ap-southeast-2] [--plan free] [--org-id <supabase-org>] \
 *     [--team <vercel-team-id>] [--branch stage-0-foundation] \
 *     [--no-voice] [--public] [--dry-run]
 *
 * Tokens (resolved from env or ~/.<tool>-token):
 *   SUPABASE_ACCESS_TOKEN  (~/.supabase-token)   required
 *   VERCEL_TOKEN           (~/.vercel-token)      required
 *   gh CLI auth                                    required (gh auth status)
 *   ELEVENLABS_API_KEY                             optional (voice)
 *   GITHUB_PACKAGES_TOKEN                          optional (set-caistech-token)
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { getCard, recordGate, recordProvision } from "./gate-check.mjs";

// ---------------------------------------------------------------------------
// args + config
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = {};
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { flags[key] = next; i++; }
    else flags[key] = true;
  } else positionals.push(a);
}

const SLUG = positionals[0];
const DRY = !!flags["dry-run"];

const HUB_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const PORTFOLIO_BASE = process.env.PORTFOLIO_BASE ?? resolvePath(HUB_ROOT, "..");

const CONFIG = {
  githubOwner: flags.owner ?? "caistech",
  template: flags["no-template"] ? null : (flags.template ?? "caistech/cais-starter"),
  displayName: flags["display-name"] ?? null, // derived from slug if absent
  description: flags.description ?? null,
  region: flags.region ?? "ap-southeast-2",
  plan: flags.plan ?? "free",
  supabaseOrg: flags["org-id"] ?? process.env.SUPABASE_ORG_ID ?? "slswtirckvqfcqrlgzgi", // CAIS
  vercelTeam: flags.team ?? process.env.VERCEL_TEAM_ID ?? "team_hwN7IFtd2Fo3DCj9C67ZwI1t", // CAIS
  branch: flags.branch ?? "stage-0-foundation",
  voice: !flags["no-voice"],
  private: !flags["public"],
  skipPortfolio: !!flags["skip-portfolio"], // skip onboard + platform-trust (e.g. smoke tests)
  authCallbackPath: "/auth/callback",
  // Scale-infra (Delta 1): a domain is GATED on a Gate-2 GO. The thin-MVP run is NOT â€”
  // pass --domain <name> only once the cockpit records the validated go/no-go.
  domain: flags.domain ?? null,
};

function readToken(envName, file) {
  if (process.env[envName]) return process.env[envName].trim();
  try { return readFileSync(join(homedir(), file), "utf8").trim(); } catch { return null; }
}
const SUPABASE_TOKEN = readToken("SUPABASE_ACCESS_TOKEN", ".supabase-token") ?? readToken("SUPABASE_MANAGEMENT_TOKEN", ".supabase-token");
const VERCEL_TOKEN = readToken("VERCEL_TOKEN", ".vercel-token");

const titleCase = (s) => s.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

let STEP = 0;
const step = (msg) => console.log(`\n[${++STEP}] ${msg}`);
const info = (msg) => console.log(`    ${msg}`);
const warn = (msg) => console.log(`    âš  ${msg}`);
const ok = (msg) => console.log(`    âœ“ ${msg}`);
const fail = (msg) => { console.error(`\nâœ— ${msg}`); process.exit(1); };

/** Run a CLI command. In dry-run, print and skip (returns synthetic success). */
function run(cmd, args, opts = {}) {
  const display = `${cmd} ${args.join(" ")}`.replace(/(--db-password|--password)\s+\S+/g, "$1 ****");
  if (DRY) { info(`DRY: ${display}`); return { status: 0, stdout: "", stderr: "" }; }
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: false, ...opts });
  if (r.error) return { status: 1, stdout: "", stderr: String(r.error.message) };
  return { status: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Authenticated fetch against a provider API. Dry-run skips mutating calls. */
async function api(url, { method = "GET", token, headers = {}, body, mutating = false } = {}) {
  if (DRY && mutating) { info(`DRY: ${method} ${url}`); return { ok: true, status: 200, json: async () => ({}) }; }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// .env.local read/modify (never logs values)
function envPath() { return join(PORTFOLIO_BASE, SLUG, ".env.local"); }
function readEnv() { try { return readFileSync(envPath(), "utf8"); } catch { return ""; } }
function setEnv(key, value) {
  if (DRY) { info(`DRY: write ${key} to .env.local`); return; }
  let env = readEnv();
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, `${key}=${value}`) : (env ? env + "\n" : "") + `${key}=${value}`;
  writeFileSync(envPath(), env);
}
function getEnv(key) {
  const m = readEnv().match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? stripQuotes(m[1]) : undefined;
}

/**
 * Strip a single pair of surrounding quotes off a .env value. A sibling repo
 * that wrote `KEY="sk-..."` (AIFTIS-Demo did) must NOT propagate the quotes â€”
 * a quoted key breaks SMTP auth + the Anthropic SDK with a confusing 401.
 */
function stripQuotes(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/** First sibling .env.local value for `key` (quote-stripped, placeholder-skipped). */
function findSiblingValue(key) {
  for (const d of safeReaddir(PORTFOLIO_BASE)) {
    if (d === SLUG) continue;
    const f = join(PORTFOLIO_BASE, d, ".env.local");
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
    const v = m ? stripQuotes(m[1]) : "";
    if (v && !v.includes("...")) return v;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

function preflight() {
  step("Preflight");
  if (!SLUG) fail("Usage: node scripts/new-product.mjs <slug> [flags]. See header for options.");
  if (!/^[a-z][a-z0-9-]*$/.test(SLUG)) fail(`slug must be lowercase kebab-case: got "${SLUG}"`);
  CONFIG.displayName ??= titleCase(SLUG);
  CONFIG.description ??= `${CONFIG.displayName} â€” Corporate AI Solutions`;

  const missing = [];
  if (!SUPABASE_TOKEN) missing.push("SUPABASE_ACCESS_TOKEN / ~/.supabase-token");
  if (!VERCEL_TOKEN) missing.push("VERCEL_TOKEN / ~/.vercel-token");
  const gh = run("gh", ["auth", "status"]);
  if (gh.status !== 0 && !DRY) missing.push("gh auth (run: gh auth login)");
  if (missing.length) fail(`Missing prerequisites:\n      - ${missing.join("\n      - ")}`);

  if (CONFIG.voice && !process.env.ELEVENLABS_API_KEY) {
    warn("ELEVENLABS_API_KEY unset â€” voice step will be skipped (run with --no-voice to silence).");
    CONFIG.voice = false;
  }
  ok(`slug=${SLUG} display="${CONFIG.displayName}" template=${CONFIG.template ?? "(bespoke)"} region=${CONFIG.region} team=${CONFIG.vercelTeam}`);
  info(`target dir: ${join(PORTFOLIO_BASE, SLUG)}`);
}

// ---------------------------------------------------------------------------
// step: GitHub repo (idempotent) + clone
// ---------------------------------------------------------------------------

function stepGithub() {
  step("GitHub repo");
  const full = `${CONFIG.githubOwner}/${SLUG}`;
  const exists = run("gh", ["repo", "view", full, "--json", "nameWithOwner"]).status === 0;
  if (exists) { ok(`repo exists: ${full}`); }
  else {
    const args = ["repo", "create", full, CONFIG.private ? "--private" : "--public", "--description", CONFIG.description];
    if (CONFIG.template) args.push("--template", `${CONFIG.githubOwner}/${CONFIG.template.split("/").pop()}`);
    const r = run("gh", args);
    if (r.status !== 0) fail(`gh repo create failed: ${r.stderr || r.stdout}`);
    ok(`created ${full}${CONFIG.template ? ` from template ${CONFIG.template}` : " (empty/bespoke)"}`);
  }
  // clone (or note existing local)
  const localDir = join(PORTFOLIO_BASE, SLUG);
  if (existsSync(join(localDir, ".git"))) { ok(`local clone present: ${localDir}`); }
  else {
    const r = run("gh", ["repo", "clone", full, localDir]);
    if (r.status !== 0 && !DRY) warn(`clone failed (continue if you cloned manually): ${r.stderr}`);
    else ok(`cloned to ${localDir}`);
  }
}

// ---------------------------------------------------------------------------
// step: Supabase project + migrate (validated SayFix flow)
// ---------------------------------------------------------------------------

async function stepSupabase() {
  step("Supabase project");
  const SB = "https://api.supabase.com/v1";
  // idempotency: find existing project by name
  let ref = null;
  if (!DRY) {
    const list = await (await api(`${SB}/projects`, { token: SUPABASE_TOKEN })).json().catch(() => []);
    const found = Array.isArray(list) ? list.find((p) => p.name === SLUG) : null;
    if (found) { ref = found.id; ok(`existing project: ${ref}`); }
  }
  if (!ref) {
    const pw = randomBytes(24).toString("base64url"); // URL-safe â†’ pooler-string safe
    setEnv("SUPABASE_DB_PASSWORD", pw);
    const r = run("supabase", ["projects", "create", SLUG, "--org-id", CONFIG.supabaseOrg, "--db-password", pw, "--region", CONFIG.region], { env: { ...process.env, SUPABASE_ACCESS_TOKEN: SUPABASE_TOKEN } });
    if (r.status !== 0 && !DRY) fail(`supabase projects create failed: ${r.stderr || r.stdout}`);
    if (DRY) ref = "<ref>";
    else {
      // Resolve the ref from the dashboard URL â€” the ORG ID is also 20 chars, so never
      // grab the first token from stdout (that bug timed out the health poll on run 1).
      ref = (r.stdout.match(/dashboard\/project\/([a-z0-9]{20})/) || [])[1];
      if (!ref) {
        const list = await (await api(`${SB}/projects`, { token: SUPABASE_TOKEN })).json().catch(() => []);
        ref = (Array.isArray(list) ? list.find((p) => p.name === SLUG) : null)?.id;
      }
      if (!ref) fail("project created but its ref could not be resolved (URL + list-by-name both failed)");
    }
    ok(`created project ref=${ref}`);
  }
  if (DRY) { info("DRY: poll ACTIVE_HEALTHY â†’ get keys â†’ link â†’ db push (pooler) â†’ verify seed"); return ref; }

  // wait for ACTIVE_HEALTHY
  info("waiting for ACTIVE_HEALTHY...");
  let healthy = false;
  for (let i = 0; i < 40; i++) {
    const p = await (await api(`${SB}/projects/${ref}`, { token: SUPABASE_TOKEN })).json().catch(() => ({}));
    if (p.status === "ACTIVE_HEALTHY") { healthy = true; break; }
    await sleep(10000);
  }
  if (!healthy) fail("project did not reach ACTIVE_HEALTHY in time");
  ok("ACTIVE_HEALTHY");

  // keys â†’ .env.local
  const keys = await (await api(`${SB}/projects/${ref}/api-keys`, { token: SUPABASE_TOKEN })).json().catch(() => []);
  const anon = (keys.find?.((k) => k.name === "anon") || {}).api_key;
  const svc = (keys.find?.((k) => k.name === "service_role") || {}).api_key;
  setEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${ref}.supabase.co`);
  if (anon) setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anon);
  if (svc) setEnv("SUPABASE_SERVICE_ROLE_KEY", svc);
  ok(`keys written to .env.local (anon ${anon ? "âœ“" : "âœ—"}, service_role ${svc ? "âœ“" : "âœ—"})`);

  // migrate via IPv4 session pooler (home networks lack IPv6)
  const repoDir = join(PORTFOLIO_BASE, SLUG);
  const pw = getEnv("SUPABASE_DB_PASSWORD");
  const sbEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: SUPABASE_TOKEN };
  if (existsSync(join(repoDir, "supabase", "migrations"))) {
    run("supabase", ["link", "--project-ref", ref, "--password", pw], { cwd: repoDir, env: sbEnv });
    let pushed = run("supabase", ["db", "push", "--password", pw], { cwd: repoDir, env: sbEnv, input: "y\n" });
    const bad = (o) => /no such host|IPv6|could not translate|failed|error/i.test((o.stdout || "") + (o.stderr || ""));
    if (bad(pushed)) {
      for (const host of [`aws-0-${CONFIG.region}`, `aws-1-${CONFIG.region}`]) {
        const dbUrl = `postgresql://postgres.${ref}:${pw}@${host}.pooler.supabase.com:5432/postgres`;
        pushed = run("supabase", ["db", "push", "--db-url", dbUrl], { cwd: repoDir, input: "y\n" });
        if (!bad(pushed)) break;
      }
    }
    if (bad(pushed)) warn("db push may have failed â€” check `supabase db push` manually");
    else ok("migrations applied via session pooler");
  } else {
    warn("no supabase/migrations in the repo â€” skipping db push (template should ship the DNA migration)");
  }
  return ref;
}

// ---------------------------------------------------------------------------
// step: Vercel project + env (env-upsert ported from RaiseReady create-vercel)
// ---------------------------------------------------------------------------

async function stepVercel() {
  step("Vercel project");
  const teamQ = `?teamId=${CONFIG.vercelTeam}`;
  const get = await api(`https://api.vercel.com/v9/projects/${SLUG}${teamQ}`, { token: VERCEL_TOKEN });
  let prjId;
  if (get.ok) { prjId = (await get.json()).id; ok(`project exists: ${prjId}`); }
  else {
    const r = await api(`https://api.vercel.com/v10/projects${teamQ}`, {
      token: VERCEL_TOKEN, method: "POST", mutating: true,
      body: { name: SLUG, framework: "nextjs", gitRepository: { type: "github", repo: `${CONFIG.githubOwner}/${SLUG}` } },
    });
    if (DRY) { ok("DRY: would create Vercel project + push env"); return; }
    const d = await r.json();
    if (!r.ok) fail(`vercel create failed: ${d.error?.message || JSON.stringify(d).slice(0, 160)}`);
    prjId = d.id; ok(`created project ${prjId} (git-linked: ${!!d.link})`);
  }
  if (DRY) return;

  // env upsert: NEXT_PUBLIC_* plain; secrets sensitive; production+preview only.
  // (A PATCH cannot convert encryptedâ†’sensitive, so secrets are delete+recreate.)
  const wanted = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "RESEND_API_KEY"];
  const existing = {};
  const cur = await (await api(`https://api.vercel.com/v9/projects/${prjId}/env${teamQ}`, { token: VERCEL_TOKEN })).json().catch(() => ({}));
  for (const e of cur.envs || []) existing[e.key] = e;
  for (const key of wanted) {
    const value = getEnv(key);
    if (!value) { warn(`${key} not in .env.local â€” skipped`); continue; }
    const isPublic = key.startsWith("NEXT_PUBLIC_");
    const type = isPublic ? "plain" : "sensitive";
    if (existing[key]) {
      if (isPublic) {
        await api(`https://api.vercel.com/v9/projects/${prjId}/env/${existing[key].id}${teamQ}`, { token: VERCEL_TOKEN, method: "PATCH", mutating: true, body: { value, type, target: ["production", "preview"] } });
      } else {
        await api(`https://api.vercel.com/v9/projects/${prjId}/env/${existing[key].id}${teamQ}`, { token: VERCEL_TOKEN, method: "DELETE", mutating: true });
        await api(`https://api.vercel.com/v10/projects/${prjId}/env${teamQ}`, { token: VERCEL_TOKEN, method: "POST", mutating: true, body: { key, value, type, target: ["production", "preview"] } });
      }
    } else {
      await api(`https://api.vercel.com/v10/projects/${prjId}/env${teamQ}`, { token: VERCEL_TOKEN, method: "POST", mutating: true, body: { key, value, type, target: ["production", "preview"] } });
    }
    ok(`${key}: set (${type})`);
  }
  return prjId;
}

// ---------------------------------------------------------------------------
// Resolve the ACTUAL production URL Vercel assigned this project.
// ---------------------------------------------------------------------------
// Do NOT assume `<slug>.vercel.app`: if that subdomain is already taken by another
// account, Vercel gives THIS project a suffixed alias and the bare domain serves
// someone else's app — exactly the ExecutorAI collision (2026-06-09) where the run
// reported `executorai.vercel.app` (a stranger's app) instead of its real alias.
// Prefer: the bare slug domain IF we actually own it → the canonical team alias →
// the first non-preview alias → the bare domain as a last resort.
async function resolveProdUrl(prjId, { poll = true } = {}) {
  if (DRY || !prjId) return null;
  const teamQ = `?teamId=${CONFIG.vercelTeam}`;
  const fetchAliases = async () => {
    const proj = await (await api(`https://api.vercel.com/v9/projects/${prjId}${teamQ}`, { token: VERCEL_TOKEN })).json().catch(() => ({}));
    return (proj?.targets?.production?.alias || []).filter(
      (a) => typeof a === "string" && a.endsWith(".vercel.app") && !a.includes("-git-"),
    );
  };
  // Production aliases only populate once a production deploy EXISTS + settles, so this MUST run AFTER
  // stepDeploy (with a short poll). Calling it pre-deploy returns nothing — and we must NOT then fall
  // back to `${SLUG}.vercel.app`: that bare domain can belong to ANOTHER project (the ExecutorAI
  // collision, 2026-06-09 — the bare domain served a stranger's E&W app and the card was pointed at the
  // wrong site, so validation tested the wrong product). Return null and skip the write-back rather than
  // record a wrong URL — a missing mvp_url is honest; a stranger's URL is a silent landmine.
  let aliases = await fetchAliases();
  for (let i = 0; poll && aliases.length === 0 && i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    aliases = await fetchAliases();
  }
  if (aliases.length === 0) return null;
  const bare = `${SLUG}.vercel.app`;
  // Prefer: the bare slug ONLY if THIS project actually owns it → a clean public alias (the team-named
  // `<slug>-<teamslug>` alias often carries Vercel deployment-protection/SSO → 401 for testers, so
  // avoid it when a cleaner one exists) → any remaining alias. NEVER construct the bare domain.
  const pick =
    aliases.find((a) => a === bare) ||
    aliases.find((a) => a.startsWith(`${SLUG}-`) && !a.includes("corporate-ai-solutions")) ||
    aliases[0];
  return `https://${pick}`;
}

// ---------------------------------------------------------------------------
// step: production deploy (promote the working branch)
// ---------------------------------------------------------------------------
// Locked in after SayFix (2026-05-26): a git-linked push only creates a PREVIEW
// deploy of the branch; production tracks main, so without this the canonical
// URL serves nothing (or a stale build that predates the env we just set). Push
// the working branch to production explicitly so env changes take effect and a
// working prod URL exists for the validation outreach link.

async function stepDeploy(prjId) {
  step("Production deploy (promote the working branch)");
  if (DRY) { info(`DRY: POST /v13/deployments target=production ref=${CONFIG.branch}`); return; }
  if (!prjId) { warn("no Vercel project id â€” skipping deploy"); return; }
  const teamQ = `?teamId=${CONFIG.vercelTeam}`;
  const proj = await (await api(`https://api.vercel.com/v9/projects/${prjId}${teamQ}`, { token: VERCEL_TOKEN })).json().catch(() => ({}));
  const repoId = proj?.link?.repoId;
  if (!repoId) { warn("project not git-linked (no repoId) â€” skipping deploy; merge to main to deploy"); return; }
  const r = await api(`https://api.vercel.com/v13/deployments${teamQ}`, {
    token: VERCEL_TOKEN, method: "POST", mutating: true,
    body: { name: SLUG, project: prjId, target: "production", gitSource: { type: "github", repoId, ref: CONFIG.branch } },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { warn(`deploy trigger failed: ${d.error?.message || JSON.stringify(d).slice(0, 120)}`); return null; }
  ok(`production deploy triggered: ${d.id || "(queued)"} â€” the live URL is resolved next`);
  return d.id || null;
}

// ---------------------------------------------------------------------------
// step: scale-infra gate (Delta 1) â€” a domain waits for a Gate-2 GO
// ---------------------------------------------------------------------------
// The thin-MVP run is NOT gated (its live link is the Gate-1 outreach payload).
// Only multi-tenant/billing/DOMAIN provisioning waits for the validated go/no-go.
// Here we enforce the domain half: refuse --domain unless the cockpit ledger shows
// gate2_go for this product. Fails CLOSED â€” if we can't verify the GO, we refuse.

async function stepScaleInfraGuard() {
  if (!CONFIG.domain) return;
  step("Scale-infra gate (Delta 1) â€” domain requires a Gate-2 GO");
  if (DRY) { info(`DRY: verify gate2_go for ${SLUG} before provisioning domain ${CONFIG.domain}`); return; }
  let card;
  try { card = await getCard(SLUG); }
  catch (e) { fail(`Cannot verify the Gate-2 GO for a domain provision (${e.message}). Refusing â€” fix the cockpit gate creds (CAIS_GATES_* or Corporate-AI-Solutions/.env.local) and retry.`); }
  if (!card?.gate2_go) {
    fail(`Refusing to provision domain '${CONFIG.domain}' for ${SLUG}: no Gate-2 GO recorded in the pipeline ledger. The thin-MVP creator runs free, but multi-tenant / billing / domain wait for the validated go/no-go (Delta 1). Record the Gate-2 GO in the cockpit, then re-run with --domain.`);
  }
  ok(`Gate-2 GO confirmed for ${SLUG} â€” domain provisioning allowed.`);
}

// ---------------------------------------------------------------------------
// step: harvest shared CAIS keys into .env.local (so Vercel push + dev work)
// ---------------------------------------------------------------------------

function stepHarvestLocal() {
  step("Harvest shared CAIS keys â†’ .env.local");
  const want = ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "OPENAI_API_KEY"];
  if (DRY) { info(`DRY: scan siblings for ${want.join(", ")}`); return; }
  for (const key of want) {
    if (getEnv(key)) continue;
    let val, from;
    for (const d of safeReaddir(PORTFOLIO_BASE)) {
      if (d === SLUG) continue;
      const f = join(PORTFOLIO_BASE, d, ".env.local");
      if (!existsSync(f)) continue;
      const m = readFileSync(f, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
      const candidate = m ? stripQuotes(m[1]) : "";
      if (candidate && !candidate.includes("...")) { val = candidate; from = d; break; }
    }
    if (val) { setEnv(key, val); ok(`${key}: harvested from ${from}`); }
    else warn(`${key}: not found in any sibling .env.local`);
  }
}

// ---------------------------------------------------------------------------
// step: Resend â€” mint a PER-PRODUCT sending key + verify a test send
// ---------------------------------------------------------------------------
// Locked in after SayFix (2026-05-26): every product must send from its OWN
// Resend sending key (clean per-product revocation + deliverability), minted
// from a full-access CAIS admin key â€” NOT the shared portfolio key. And we
// VERIFY a real send here, so a broken sender is caught now, not by the first
// user hitting "Error sending confirmation email". Runs BEFORE Vercel + onboard
// so the per-product key is what gets pushed + wired into Supabase SMTP.

async function stepResend() {
  step("Resend per-product sending key + verify");
  const DOMAIN = process.env.RESEND_SENDER_DOMAIN || "updates.corporateaisolutions.com"; // only verified subdomain
  if (DRY) { info(`DRY: mint Resend key '${SLUG}' on ${DOMAIN} + send a verification email`); return; }

  const admin = stripQuotes(process.env.RESEND_ADMIN_API_KEY || findSiblingValue("RESEND_ADMIN_API_KEY") || "");
  if (!admin) {
    warn("RESEND_ADMIN_API_KEY (full-access) not found â€” keeping the harvested shared RESEND_API_KEY.");
    warn("Set RESEND_ADMIN_API_KEY to a full-access Resend key so the creator can mint scoped per-product keys.");
    return;
  }
  const rh = (extra = {}) => ({ Authorization: `Bearer ${admin}`, "Content-Type": "application/json", ...extra });

  // Idempotent: if a key named <slug> already exists AND we hold a key locally, keep it
  // (the token is shown only at creation, so we can't re-read it â€” don't churn a new one).
  const list = await (await fetch("https://api.resend.com/api-keys", { headers: rh() })).json().catch(() => ({}));
  const already = Array.isArray(list?.data) ? list.data.find((k) => k.name === SLUG) : null;
  if (already && getEnv("RESEND_API_KEY")) {
    ok(`per-product key '${SLUG}' exists (id ${already.id}) â€” keeping current RESEND_API_KEY`);
  } else {
    const domains = await (await fetch("https://api.resend.com/domains", { headers: rh() })).json().catch(() => ({}));
    const dom = Array.isArray(domains?.data) ? domains.data.find((d) => d.name === DOMAIN) : null;
    if (!dom) { warn(`Resend domain '${DOMAIN}' not on this account â€” cannot mint a scoped key. Keeping shared key.`); return; }
    const created = await fetch("https://api.resend.com/api-keys", {
      method: "POST", headers: rh(),
      body: JSON.stringify({ name: SLUG, permission: "sending_access", domain_id: dom.id }),
    });
    const cj = await created.json().catch(() => ({}));
    if (!created.ok || !cj.token) { warn(`mint failed (${created.status}): ${JSON.stringify(cj).slice(0, 120)} â€” keeping shared key`); return; }
    setEnv("RESEND_API_KEY", cj.token);
    ok(`minted per-product Resend key '${SLUG}' (id ${cj.id}), scoped to ${DOMAIN}`);
  }

  // Verify a real send â€” catches a broken sender BEFORE the first user does.
  const key = getEnv("RESEND_API_KEY");
  const to = process.env.RESEND_TEST_RECIPIENT || "mcmdennis@gmail.com";
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${CONFIG.displayName} <noreply@${DOMAIN}>`,
      to: [to],
      subject: `${CONFIG.displayName}: sender verified`,
      text: `This confirms ${CONFIG.displayName}'s Resend sending key works end-to-end. Provisioned by new-product.mjs.`,
    }),
  });
  const sj = await sent.json().catch(() => ({}));
  if (sent.ok && sj.id) ok(`verification email sent (id ${sj.id}) to ${to} â€” sender works`);
  else warn(`test send failed (${sent.status}): ${JSON.stringify(sj).slice(0, 160)} â€” fix the sender before real users`);
}

// ---------------------------------------------------------------------------
// step: onboard (auth + SMTP + email templates + manifest) â€” reuse the script
// ---------------------------------------------------------------------------

function stepOnboard(ref) {
  if (CONFIG.skipPortfolio) { step("Onboard â€” skipped (--skip-portfolio)"); return; }
  step("Onboard (Supabase Auth + SMTP + email templates + manifest)");
  const script = join(HUB_ROOT, "scripts", "onboard-new-project.sh");
  if (!existsSync(script)) { warn("onboard-new-project.sh not found â€” skipping"); return; }
  const env = {
    ...process.env,
    VERCEL_TOKEN,
    SUPABASE_MANAGEMENT_TOKEN: SUPABASE_TOKEN,
    AUTH_CALLBACK_PATH: CONFIG.authCallbackPath,
    VERCEL_TEAM_ID: CONFIG.vercelTeam,
    RESEND_API_KEY: getEnv("RESEND_API_KEY") || process.env.RESEND_API_KEY || "",
  };
  run("bash", [script, SLUG, SLUG, ref || ""], { cwd: HUB_ROOT, env, stdio: DRY ? "pipe" : "inherit" });
  // re-brand email templates with proper display-name casing
  const emailScript = join(HUB_ROOT, "scripts", "configure-email-templates.sh");
  if (ref && existsSync(emailScript)) run("bash", [emailScript, CONFIG.displayName, ref], { cwd: HUB_ROOT, env, stdio: DRY ? "pipe" : "inherit" });
  ok("onboard complete (manifest changes left UNCOMMITTED for review)");
}

// ---------------------------------------------------------------------------
// step: ElevenLabs (shared helper only â€” never the deprecated webhook shape)
// ---------------------------------------------------------------------------

async function stepVoice(prodUrl) {
  if (!CONFIG.voice) { step("ElevenLabs voice â€” skipped (no key / --no-voice)"); return; }
  step("ElevenLabs voice agent");
  if (DRY) { info("DRY: provisionVoiceAgent via @caistech/elevenlabs-convai"); return; }

  // Consume the hub's idempotent provisioner (allowlist + workspace webhook bind).
  // NEVER the deprecated platform_settings.webhook shape (CLAUDE.md VOICE AI failure modes).
  let provision;
  try { provision = (await import("@caistech/elevenlabs-convai")).provisionVoiceAgent; }
  catch (e) { warn(`@caistech/elevenlabs-convai not importable (${e.message}). Install it in cais-shared-services + rerun, or provision later. Skipping.`); return; }
  if (typeof provision !== "function") { warn("provisionVoiceAgent not exported by the hub â€” skipping."); return; }

  const baseUrl = prodUrl || `https://${SLUG}.vercel.app`;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // canonical warm default
  try {
    // Canonical persona = "Morgan" (PRODUCT_STANDARDS VOICE AI: one consistent voice/opening/
    // signature across the portfolio). The agent is Morgan everywhere; only the product it guides
    // changes. gpt-4.1-mini (DEFAULT_AGENT_LLM) — gpt-4o-mini drops tool calls over long calls.
    const result = await provision(process.env.ELEVENLABS_API_KEY, {
      config: { agentName: `Morgan (${CONFIG.displayName})`, voiceId, llmModel: "gpt-4.1-mini", temperature: 0.5, voiceModel: "eleven_turbo_v2" },
      systemPrompt: `You are Morgan, the friendly in-app guide for ${CONFIG.displayName}. You speak warmly, calmly, and plainly, and keep answers short and easy to follow out loud. Help people use ${CONFIG.displayName} and answer their questions clearly; if something has nuance a field label can't convey, talk it through. If asked your name, you're Morgan. You give helpful guidance, not professional, legal, or financial advice — for anything specialised, suggest checking with the relevant professional.`,
      firstMessage: `Hi, I'm Morgan — I'm here to help you with ${CONFIG.displayName}. What would you like to do?`,
      baseUrl,
      allowedOrigins: [baseUrl, "https://*.vercel.app", "http://localhost:3000"],
    });
    const agentId = result?.agentId || result?.agent_id;
    if (!agentId) { warn("provision returned no agentId â€” check the hub package."); return; }
    setEnv("NEXT_PUBLIC_ELEVENLABS_AGENT_ID", agentId);
    const teamQ = `?teamId=${CONFIG.vercelTeam}`;
    await api(`https://api.vercel.com/v10/projects/${SLUG}/env${teamQ}`, { token: VERCEL_TOKEN, method: "POST", mutating: true, body: { key: "NEXT_PUBLIC_ELEVENLABS_AGENT_ID", value: agentId, type: "plain", target: ["production", "preview"] } });
    ok(`agent provisioned: ${agentId} (NEXT_PUBLIC_ELEVENLABS_AGENT_ID set + pushed to Vercel)`);
  } catch (e) {
    warn(`voice provisioning failed (non-fatal): ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// step: write per-product test-accounts.config.json (QA identities)
// ---------------------------------------------------------------------------
// The portfolio-gate test-accounts audit + provision-qa-accounts.mjs both read
// THIS file from the product root. Per-deployment QA identities â€” a third-party
// instance sets QA_TEST_DOMAIN to its own domain so it provisions ITS OWN QA
// accounts, never the operator's personal email. JSON has no interpolation, so
// the domain is substituted here at generation time (an un-substituted ${...}
// left in the file would make the audit look for a literal placeholder address).
function stepTestAccountsConfig(ref) {
  step("QA accounts — write config + CREATE + email-confirm");
  // §9.5 canonical CAS QA domain (was qa.corporateaisolutions.com, which produced the stale
  // qa-admin@/qa-user@ scheme that did NOT match what the testers log in as → VT_A1 Access Denied).
  // The template now uses the +qaadmin plus-alias scheme, so the CAS default resolves to the
  // canonical dennis+qaadmin@factory2key.com.au / dennis@factory2key.com.au. Third-party overrides
  // via QA_TEST_DOMAIN.
  const qaDomain = process.env.QA_TEST_DOMAIN || "factory2key.com.au";
  const templatePath = join(HUB_ROOT, "templates", "test-accounts.config.template.json");
  const outPath = join(PORTFOLIO_BASE, SLUG, "test-accounts.config.json");

  if (DRY) { info(`DRY: write ${outPath} + create+confirm QA accounts (provision-qa-accounts.mjs --slug ${SLUG})`); return; }

  // 1. Write the identities config (the portfolio-gate audit + provision-qa-accounts read it).
  if (existsSync(outPath)) {
    ok(`test-accounts.config.json exists â€” leaving as-is`);
  } else {
    let tpl;
    try { tpl = readFileSync(templatePath, "utf8"); }
    catch { warn(`template missing at ${templatePath} â€” skipping QA config + accounts`); return; }
    writeFileSync(outPath, tpl.replace(/\$\{QA_TEST_DOMAIN\}/g, qaDomain));
    ok(`wrote test-accounts.config.json (qaDomain=${qaDomain})`);
  }

  // 2. ACTUALLY create + email-confirm the accounts. Writing the config ALONE left every fresh
  //    product with a config naming accounts that don't exist, so validation hit the auth wall
  //    every time (ExecutorAI 2026-06-09: testers blocked at the email-confirm gate). The creator
  //    (provision-qa-accounts.mjs) already existed + uses admin.createUser({email_confirm:true}) —
  //    it just was never invoked. Wire it so the standard QA owner/user can log in IMMEDIATELY
  //    (no email round-trip), and the validation cycle never blocks on a missing login.
  const r = run("node", [
    join(HUB_ROOT, "scripts", "provision-qa-accounts.mjs"),
    "--slug", SLUG, "--supabase-ref", ref, "--root", join(PORTFOLIO_BASE, SLUG),
  ]);
  if (r.status === 0) ok(`QA accounts created + email-confirmed â€” validation can log in immediately`);
  else warn(`provision-qa-accounts failed (non-fatal): ${(r.stderr || r.stdout || "").trim().slice(0, 200)}`);
}
// ---------------------------------------------------------------------------
// step: platform-trust registration + git
// ---------------------------------------------------------------------------

function stepRegisterAndGit(ref) {
  step("Register (platform-trust) + git");
  const reg = join(HUB_ROOT, "scripts", "register-platform-trust-projects.mjs");
  if (!CONFIG.skipPortfolio && existsSync(reg)) run("node", [reg, "--slug", SLUG], { cwd: HUB_ROOT, env: { ...process.env, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN: SUPABASE_TOKEN }, stdio: DRY ? "pipe" : "inherit" });

  const repoDir = join(PORTFOLIO_BASE, SLUG);
  // working branch off main; commit any local changes; push â€” STOP before PR.
  run("git", ["-C", repoDir, "checkout", "-B", CONFIG.branch]);
  run("git", ["-C", repoDir, "add", "-A"]);
  run("git", ["-C", repoDir, "commit", "-m", `chore: provision ${SLUG} (new-product.mjs)`]);
  run("git", ["-C", repoDir, "push", "-u", "origin", CONFIG.branch]);
  ok(`pushed branch ${CONFIG.branch} (no PR opened)`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

(async () => {
  console.log(`\n=== new-product: ${SLUG ?? "(no slug)"} ${DRY ? "[DRY RUN]" : ""} ===`);
  preflight();
  await stepScaleInfraGuard();     // Delta 1: refuse a domain without a Gate-2 GO (no-op without --domain)
  stepGithub();
  const ref = await stepSupabase();
  stepHarvestLocal();
  await stepResend();             // mint per-product sending key BEFORE Vercel + onboard use it
  const prjId = await stepVercel();
  stepOnboard(ref);
  stepTestAccountsConfig(ref);
  // Voice baseUrl only feeds the agent's allowedOrigins, which already carries the
  // `https://*.vercel.app` wildcard — so a provisional guess pre-deploy is fine here.
  await stepVoice(`https://${SLUG}.vercel.app`);
  stepRegisterAndGit(ref);
  const deployId = await stepDeploy(prjId);  // promote the working branch to production
  // Resolve the REAL production URL only AFTER the deploy (aliases populate then), and NEVER the bare
  // slug domain — null if it can't be determined (we then skip mvp_url rather than record a wrong one).
  const prodUrl = await resolveProdUrl(prjId);

  // Record the provisioning on the cockpit ledger â€” visible on the card, and the
  // ledger entry the gate reads. (Informational; the URL-share gate keys on a
  // separate naive-tester PASS bound to the live deployment.)
  if (deployId && !DRY) {
    try {
      await recordGate({ slug: SLUG, gate: "provisioned", status: "pass", deploymentId: deployId, recordedBy: "new-product.mjs" });
      ok("recorded 'provisioned' in the pipeline ledger");
    } catch (e) { warn(`could not record provisioned gate (non-fatal): ${e.message}`); }

    // WRITE-BACK (the gap that caused the ExecutorAI duplicate): stamp the live URL + infra
    // identifiers onto the cockpit card so the pipeline KNOWS this product is built and never
    // re-provisions it. mvp_url is what survey / design-build / readiness all read.
    try {
      const rows = await recordProvision({
        slug: SLUG,
        mvpUrl: prodUrl, // null → recordProvision skips mvp_url; repo/vercel/supabase still land
        githubRepo: `${CONFIG.githubOwner}/${SLUG}`,
        vercelProject: prjId,
        supabaseRef: ref,
      });
      if (Array.isArray(rows) && rows.length) {
        ok(`wrote provisioned identifiers back to the cockpit card${prodUrl ? ` (mvp_url=${prodUrl})` : ""}`);
        if (!prodUrl) warn(`could NOT resolve a production URL for ${SLUG} — mvp_url left UNSET (better than a wrong one); set it once the prod deploy settles, then re-run validation`);
      } else {
        warn(`no cockpit card for '${SLUG}' to write identifiers onto — standalone run, or create the card first`);
      }
    } catch (e) { warn(`could not write provisioned identifiers to the cockpit (non-fatal): ${e.message}`); }
  }

  step("Done â€” remaining manual steps");
  info(`Local: ${join(PORTFOLIO_BASE, SLUG)}  (open in PyCharm yourself)`);
  info(`Supabase ref: ${ref}   Vercel team: ${CONFIG.vercelTeam}`);
  info("1. Review + commit the cais-shared-services manifest/script diff (shared repo, not auto-committed).");
  info("2. GITHUB_PACKAGES_TOKEN: run scripts/set-caistech-token.sh before any @caistech install on Vercel.");
  info("3. Open a PR with /ship when the slice is ready (none opened automatically).");
})().catch((e) => fail(e instanceof Error ? e.stack || e.message : String(e)));

// readdir that tolerates a missing/!dir path
function safeReaddir(p) { try { return readdirSync(p); } catch { return []; } }
