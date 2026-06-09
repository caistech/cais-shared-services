#!/usr/bin/env node
/**
 * Batch re-provision EVERY SayFix voice agent through the (fixed) per-repo provisioner, so they
 * all move onto gpt-4.1-mini + the memory tools + the workspace webhook + a convai_agents row.
 *
 * Idempotent: each repo re-uses its stored voice_agent_id (existingAgentId), so this UPDATES in
 * place — no duplicate agents. The workspace post-call webhook + its secret are shared across all
 * agents (only the FIRST create returned the secret; the rest reuse it), so this does NOT print a
 * new secret per repo.
 *
 * Touches ElevenLabs + the SayFix DB only — NOT a deploy. Safe to run anytime, but the sensible
 * order is: prove ONE agent end-to-end on production first, then run this for the rest.
 *
 * Usage:  node scripts/reprovision-all-sayfix-agents.mjs [--only owner/repo,owner/repo] [--skip owner/repo]
 * Env:    ELEVENLABS_API_KEY (or in sayfix/.env.local). gh must be authed.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PER_REPO = join(HERE, "provision-sayfix-agent.mjs");

const SAYFIX_ENV = join(homedir(), "PycharmProjects", "sayfix", ".env.local");
let env = "";
try { env = readFileSync(SAYFIX_ENV, "utf8"); } catch { console.error("Cannot read sayfix/.env.local"); process.exit(1); }
const envGet = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const SUPA_URL = envGet("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY = envGet("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPA_URL || !SUPA_KEY) { console.error("Supabase creds missing from sayfix/.env.local"); process.exit(1); }

const arg = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : undefined; };
const only = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const skip = (arg("--skip") || "").split(",").map((s) => s.trim()).filter(Boolean);

// Every repo that already has a voice agent.
const res = await fetch(
  `${SUPA_URL}/rest/v1/repos?select=github_owner,github_repo,voice_agent_id&voice_agent_id=not.is.null`,
  { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
);
if (!res.ok) { console.error(`repos query failed: HTTP ${res.status}`); process.exit(1); }
let repos = await res.json();

// De-dup (the repos table has known duplicate rows) + apply --only / --skip.
const seen = new Set();
repos = repos.filter((r) => {
  const key = `${r.github_owner}/${r.github_repo}`;
  if (seen.has(key)) return false; seen.add(key);
  if (only.length && !only.includes(key)) return false;
  if (skip.includes(key)) return false;
  return true;
});

console.log(`Re-provisioning ${repos.length} SayFix agent(s)...\n`);
const results = { ok: [], failed: [] };
for (const r of repos) {
  const key = `${r.github_owner}/${r.github_repo}`;
  process.stdout.write(`→ ${key} ... `);
  try {
    execFileSync("node", [PER_REPO, r.github_owner, r.github_repo], { stdio: ["ignore", "pipe", "pipe"] });
    results.ok.push(key); console.log("ok");
  } catch (e) {
    results.failed.push(key); console.log(`FAILED (${(e.stderr || e.message || "").toString().split("\n")[0]})`);
  }
}

console.log(`\nDone. ${results.ok.length} ok, ${results.failed.length} failed.`);
if (results.failed.length) console.log("Failed:", results.failed.join(", "));
