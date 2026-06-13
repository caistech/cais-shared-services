#!/usr/bin/env node
/**
 * scripts/sync-qa-secrets.mjs
 *
 * Propagate the standard QA / test-account credentials to every portfolio repo
 * as GitHub Actions secrets, from ONE canonical source. The `dennissolver`
 * account is a personal User (not an Organization), so GitHub has no native
 * "define once, all repos inherit" — this script is the bridge until repos
 * migrate into the `caistech` org (which DOES have org-level secrets).
 *
 * It sets the four standard QA secrets consumed by .github/workflows (e.g.
 * health-sensors.yml) and the /naive-tester, /qa testers — two identities
 * (the non-admin user-agent + the admin-agent), each an email + password:
 *   QA_TEST_USER_EMAIL   QA_TEST_USER_PASSWORD
 *   QA_TEST_ADMIN_EMAIL  QA_TEST_ADMIN_PASSWORD
 *
 * As each repo lands in the caistech org and inherits org secrets, drop it from
 * the repo list — the script's job shrinks to zero over the migration.
 *
 * SECURITY: secret VALUES are never printed and never passed on the command
 * line (argv is visible in the process list). Values are piped to `gh` via
 * stdin. The canonical source file lives under .secrets/ (gitignored).
 *
 * Usage:
 *   node scripts/sync-qa-secrets.mjs --repos repos.txt [--dry-run]
 *   node scripts/sync-qa-secrets.mjs --all-dennissolver [--dry-run]
 *
 *   --repos <file>        newline-delimited "owner/repo" or bare "repo"
 *                         (bare names assume --owner, default dennissolver).
 *                         Lines starting with # and blanks are ignored.
 *   --all-dennissolver    target every repo under dennissolver (via gh repo list)
 *   --owner <login>       default owner for bare repo names (default: dennissolver)
 *   --dry-run             print the plan (repos + secret names) without setting
 *   --only <NAME,NAME>    restrict to a subset of the four secret names
 *
 * Credential source (first hit wins):
 *   1. env vars QA_TEST_USER_EMAIL / QA_TEST_USER_PASSWORD /
 *      QA_TEST_ADMIN_EMAIL / QA_TEST_ADMIN_PASSWORD
 *   2. JSON file .secrets/qa-secrets.json (gitignored) with keys:
 *      { "QA_TEST_USER_EMAIL": "...", "QA_TEST_USER_PASSWORD": "...",
 *        "QA_TEST_ADMIN_EMAIL": "...", "QA_TEST_ADMIN_PASSWORD": "..." }
 *
 * Requires: gh CLI authenticated with repo-admin (secrets) scope.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HUB_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

const SECRET_NAMES = [
  "QA_TEST_USER_EMAIL",
  "QA_TEST_USER_PASSWORD",
  "QA_TEST_ADMIN_EMAIL",
  "QA_TEST_ADMIN_PASSWORD",
];

// --- args -------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--all-dennissolver") out.allDennissolver = true;
    else if (a === "--repos") out.repos = argv[++i];
    else if (a === "--owner") out.owner = argv[++i];
    else if (a === "--only") out.only = argv[++i];
    else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const OWNER = args.owner ?? "dennissolver";
const DRY = !!args.dryRun;

const wantedNames = args.only
  ? args.only.split(",").map((s) => s.trim()).filter(Boolean)
  : SECRET_NAMES;
for (const n of wantedNames) {
  if (!SECRET_NAMES.includes(n)) fail(`Unknown secret name in --only: ${n}`);
}

// --- load credentials -------------------------------------------------------

function loadCreds() {
  const creds = {};
  const filePath = resolvePath(HUB_ROOT, ".secrets", "qa-secrets.json");
  let fileVals = {};
  if (existsSync(filePath)) {
    try {
      fileVals = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (e) {
      fail(`Could not parse ${filePath}: ${e.message}`);
    }
  }
  for (const name of SECRET_NAMES) {
    const v = process.env[name] ?? fileVals[name];
    if (v != null && String(v).length > 0) creds[name] = String(v);
  }
  return creds;
}

const creds = loadCreds();
const missing = wantedNames.filter((n) => !(n in creds));
if (missing.length) {
  fail(
    `Missing credential value(s): ${missing.join(", ")}.\n` +
      `Set them as env vars, or create .secrets/qa-secrets.json (gitignored) with those keys.`,
  );
}

// --- resolve repo list ------------------------------------------------------

function ghJson(argv) {
  return JSON.parse(execFileSync("gh", argv, { encoding: "utf8" }));
}

function resolveRepos() {
  if (args.allDennissolver) {
    const list = ghJson([
      "repo", "list", "dennissolver", "--limit", "300", "--json", "nameWithOwner",
    ]);
    return list.map((r) => r.nameWithOwner);
  }
  if (!args.repos) fail("Provide --repos <file> or --all-dennissolver.");
  const raw = readFileSync(resolvePath(process.cwd(), args.repos), "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.includes("/") ? l : `${OWNER}/${l}`));
}

const repos = resolveRepos();
if (repos.length === 0) fail("No repos resolved — nothing to do.");

// --- apply ------------------------------------------------------------------

console.log(
  `${DRY ? "[DRY RUN] " : ""}Setting ${wantedNames.length} QA secret(s) ` +
    `[${wantedNames.join(", ")}] on ${repos.length} repo(s).\n`,
);

let ok = 0;
let failed = 0;
for (const repo of repos) {
  process.stdout.write(`  ${repo}: `);
  const done = [];
  try {
    for (const name of wantedNames) {
      if (!DRY) {
        // value via stdin, never argv — keeps it out of the process list/logs.
        execFileSync("gh", ["secret", "set", name, "--repo", repo], {
          input: creds[name],
          stdio: ["pipe", "ignore", "pipe"],
        });
      }
      done.push(name);
    }
    console.log(`${DRY ? "would set" : "set"} ${done.join(", ")}`);
    ok++;
  } catch (e) {
    console.log(`FAILED after [${done.join(", ")}] — ${oneLine(e)}`);
    failed++;
  }
}

console.log(
  `\n${DRY ? "[DRY RUN] " : ""}Done. ${ok} repo(s) ${DRY ? "planned" : "updated"}` +
    (failed ? `, ${failed} failed.` : "."),
);
if (failed) process.exit(1);

// --- helpers ----------------------------------------------------------------

function oneLine(e) {
  const msg = (e.stderr?.toString() || e.message || String(e)).trim();
  return msg.split(/\r?\n/)[0];
}
function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}
