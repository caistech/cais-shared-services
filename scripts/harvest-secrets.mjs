#!/usr/bin/env node
/**
 * scripts/harvest-secrets.mjs
 *
 * For each portfolio project, find env vars declared in the manifest as
 * `ref: "$secret:..."` that are MISSING on Vercel, look for the value in
 * an existing sibling repo's .env.local, and push it to Vercel.
 *
 * This bridges the gap between manifest-declared shared keys and reality:
 * keys like OPENAI_API_KEY / ANTHROPIC_API_KEY / RESEND_API_KEY exist in
 * 4–6 sibling .env.local files but were never propagated to every Vercel
 * project. Run this once and they all land.
 *
 * Per-project keys (PLATFORM_TRUST_PROJECT_ID) are NOT harvested here —
 * they need fresh provisioning via register-platform-trust-projects.mjs.
 *
 * Usage:
 *   node scripts/harvest-secrets.mjs [--manifest path] [--slug slug] [--dry-run]
 *
 * Environment:
 *   VERCEL_TOKEN   required (or ~/.vercel-token file)
 *   PORTFOLIO_BASE optional; defaults to <hub-parent-dir>
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// --- args -------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

const HUB_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = args.manifest ?? resolvePath(HUB_ROOT, "portfolio-manifest.yaml");
const PORTFOLIO_BASE = process.env.PORTFOLIO_BASE ?? resolvePath(HUB_ROOT, "..");

const VERCEL_TOKEN =
  process.env.VERCEL_TOKEN ??
  (() => {
    try {
      return readFileSync(join(homedir(), ".vercel-token"), "utf-8").trim();
    } catch {
      return undefined;
    }
  })();

if (!VERCEL_TOKEN) {
  console.error("ERROR: VERCEL_TOKEN unset and ~/.vercel-token missing");
  process.exit(2);
}

// --- harvestable key registry -----------------------------------------------

// These are the keys we know are SHARED across the portfolio (same value
// across siblings). For per-project keys, use a different tool.
const HARVESTABLE_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "RESEND_API_KEY"];

// --- main -------------------------------------------------------------------

const manifest = parseYaml(readFileSync(MANIFEST_PATH, "utf-8"));
const projects = args.slug
  ? manifest.projects.filter((p) => p.name === args.slug)
  : manifest.projects;

if (projects.length === 0) {
  console.error(`No project named '${args.slug}' in ${MANIFEST_PATH}`);
  process.exit(2);
}

console.log(
  `Harvest: ${projects.length} project(s) × ${HARVESTABLE_KEYS.length} key(s)\n${"─".repeat(60)}\n`
);

// Cache: for each harvestable key, the first .env.local file that has it
const sourceCache = new Map();

let totalPushed = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const project of projects) {
  console.log(`${project.name}  (${project.vercel_project_id})`);

  // Which harvestable keys does this project's manifest declare?
  const declared = new Set();
  for (const inh of project.inherit_shared ?? []) {
    if (manifest.shared?.[inh]) declared.add(inh);
  }
  for (const k of Object.keys(project.envs ?? {})) {
    declared.add(k);
  }

  const targetKeys = HARVESTABLE_KEYS.filter((k) => declared.has(k));
  if (targetKeys.length === 0) {
    console.log(`  · no harvestable keys declared\n`);
    continue;
  }

  // Get current Vercel env list to skip keys already present
  const liveEnvs = await listVercelEnvs(project.vercel_project_id, manifest.team_id);
  const liveKeys = new Set(liveEnvs.map((e) => e.key));

  for (const key of targetKeys) {
    if (liveKeys.has(key)) {
      console.log(`  · ${key.padEnd(30)} already on Vercel`);
      continue;
    }

    // Find a source sibling for this key
    let source = sourceCache.get(key);
    if (!source) {
      source = findSiblingWithKey(key, PORTFOLIO_BASE);
      if (source) sourceCache.set(key, source);
    }
    if (!source) {
      console.log(`  ✗ ${key.padEnd(30)} no sibling has this key`);
      totalFailed++;
      continue;
    }

    const value = readEnvValue(source.file, key);
    if (!value) {
      console.log(`  ✗ ${key.padEnd(30)} value blank in ${source.repo}/.env.local`);
      totalFailed++;
      continue;
    }

    if (args["dry-run"]) {
      console.log(
        `  → ${key.padEnd(30)} would push from ${source.repo} (${value.length} chars)`
      );
      totalSkipped++;
      continue;
    }

    try {
      await createVercelEnv(project.vercel_project_id, manifest.team_id, key, value);
      console.log(`  + ${key.padEnd(30)} pushed from ${source.repo}`);
      totalPushed++;
    } catch (err) {
      console.log(`  ✗ ${key.padEnd(30)} push failed: ${err.message}`);
      totalFailed++;
    }
  }
  console.log();
}

console.log(`${"─".repeat(60)}`);
console.log(
  `Total: ${totalPushed} pushed, ${totalSkipped} dry-run, ${totalFailed} failed`
);
process.exit(totalFailed > 0 ? 1 : 0);

// --- helpers ----------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") out.manifest = argv[++i];
    else if (a === "--slug") out.slug = argv[++i];
    else if (a === "--dry-run") out["dry-run"] = true;
    else if (a === "--help" || a === "-h") {
      console.log(`
Usage: node scripts/harvest-secrets.mjs [options]

Options:
  --manifest PATH  Path to manifest YAML (default: portfolio-manifest.yaml)
  --slug NAME      Operate on a single project by manifest 'name'
  --dry-run        Print what would be pushed; don't write to Vercel
  --help           Show this message
`);
      process.exit(0);
    }
  }
  return out;
}

async function listVercelEnvs(projectId, teamId) {
  const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(teamId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Vercel list-env ${res.status} for ${projectId}`);
  }
  const data = await res.json();
  return data.envs ?? [];
}

async function createVercelEnv(projectId, teamId, key, value) {
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(teamId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: ["production", "preview", "development"],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Walk PORTFOLIO_BASE looking for the first sibling repo whose .env.local
 * contains a non-empty value for `key`. Some repos nest .env.local under
 * apps/frontend/ — easy-claude-code is the known case.
 */
function findSiblingWithKey(key, base) {
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const repo = ent.name;
    const candidates = [
      join(base, repo, ".env.local"),
      join(base, repo, "apps/frontend/.env.local"),
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      const value = readEnvValue(file, key);
      if (value && value.length > 0) {
        return { repo, file };
      }
    }
  }
  return undefined;
}

/**
 * Read a single key's value from a .env.local file. Strips surrounding
 * quotes. Returns undefined if the key isn't present or the line is malformed.
 * Does NOT log values (security).
 */
function readEnvValue(file, key) {
  let content;
  try {
    content = readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = re.exec(content);
  if (!m) return undefined;
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}
