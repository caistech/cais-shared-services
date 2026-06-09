#!/usr/bin/env node
/**
 * Repair stale github_owner / github_repo on SayFix's `repos` table so batch agent
 * re-provisioning (which does a gh repo digest) stops 404ing.
 *
 * Discovery (2026-06-09): the gh token sees orgs caistech + mmcbuildai + user dennissolver.
 * Every product repo actually lives under `dennissolver`. The table had owner `cais` (an org that
 * doesn't exist) for many rows, and a handful of github_repo slugs don't match the real repo name.
 *
 * SAFE fix applied here: owner `cais` -> `dennissolver` (unambiguous — the repos exist there, and
 * GitHub repo names resolve case-insensitively). NAME mismatches (slug != real repo, where a rename
 * would also change the product URL slug) are only REPORTED, not changed — they need a decision.
 *
 * Usage: node scripts/fix-sayfix-repo-owners.mjs [--apply]   (dry-run without --apply)
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const env = readFileSync(join(homedir(), "PycharmProjects", "sayfix", ".env.local"), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const U = get("NEXT_PUBLIC_SUPABASE_URL"), K = get("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

// Real repo name under dennissolver for slugs that don't match case-insensitively.
// (Only listed where the slug's lowercased form != the real repo's lowercased form.)
const NAME_MISMATCH = {
  investorpilot: "investor-pilot",
  universalinterviews: "universal-interviews",
  "hairstylist-ai": "HairStylistAI",
  "outreach-ready": "OutreachReady",
};

const rows = await (await fetch(`${U}/rest/v1/repos?select=id,github_owner,github_repo,voice_agent_id`, { headers: H })).json();

let ownerFixes = 0;
const nameMismatches = [];
const seen = new Set();
for (const r of rows) {
  const key = `${r.github_owner}/${r.github_repo}`;
  if (seen.has(key)) continue; seen.add(key);
  // SAFE: cais -> dennissolver
  if (r.github_owner === "cais") {
    if (APPLY) {
      await fetch(`${U}/rest/v1/repos?id=eq.${r.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ github_owner: "dennissolver" }) });
    }
    ownerFixes++;
    console.log(`${APPLY ? "✓ owner" : "would fix owner"}: ${r.github_repo}  cais -> dennissolver`);
  }
  // REPORT name mismatches (do not auto-rename — github_repo is also the URL slug)
  if (NAME_MISMATCH[r.github_repo]) {
    nameMismatches.push(`${r.github_repo}  (real repo: dennissolver/${NAME_MISMATCH[r.github_repo]})`);
  }
}

console.log(`\n${APPLY ? "Applied" : "Dry-run"}: ${ownerFixes} owner fix(es).`);
if (nameMismatches.length) {
  console.log(`\n⚠ NAME mismatches (NOT auto-fixed — github_repo doubles as the product URL slug; renaming changes the live URL). Decide: add a separate "github_repo_actual" column, or accept the slug change:`);
  for (const m of nameMismatches) console.log(`  - ${m}`);
}
