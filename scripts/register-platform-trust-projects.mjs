#!/usr/bin/env node
/**
 * scripts/register-platform-trust-projects.mjs
 *
 * For each portfolio project whose PLATFORM_TRUST_PROJECT_ID is declared
 * as `ref: "$secret:..."` AND missing on Vercel, register the project
 * with platform-trust by INSERTing a row into the `projects` table on
 * the platform-trust Supabase, then push the resulting UUID to Vercel.
 *
 * Idempotent: ON CONFLICT (slug) DO UPDATE returns the existing UUID,
 * so re-running is safe.
 *
 * Usage:
 *   node scripts/register-platform-trust-projects.mjs [--manifest path] [--slug slug] [--dry-run]
 *
 * Environment:
 *   VERCEL_TOKEN         required (or ~/.vercel-token)
 *   SUPABASE_ACCESS_TOKEN required (or ~/.supabase-token)
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// --- args -------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

const HUB_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = args.manifest ?? resolvePath(HUB_ROOT, "portfolio-manifest.yaml");

const VERCEL_TOKEN =
  process.env.VERCEL_TOKEN ?? readTokenFile(".vercel-token");
const SUPABASE_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ??
  process.env.SUPABASE_MANAGEMENT_TOKEN ??
  readTokenFile(".supabase-token");

if (!VERCEL_TOKEN) {
  console.error("ERROR: VERCEL_TOKEN unset and ~/.vercel-token missing");
  process.exit(2);
}
if (!SUPABASE_TOKEN) {
  console.error(
    "ERROR: SUPABASE_ACCESS_TOKEN unset and ~/.supabase-token missing"
  );
  process.exit(2);
}

// platform-trust Supabase project ref (same one declared in the manifest's
// secrets: block under platform_trust_service_key)
const PLATFORM_TRUST_REF = "ggwveltavnvvscgqekhy";
const PLATFORM_TRUST_URL = `https://${PLATFORM_TRUST_REF}.supabase.co`;

// Friendly display names for slugs that need them. If a slug isn't in this
// map, the slug itself is used as the name (Title-cased).
const NAME_OVERRIDES = {
  mmcbuild: "MMCBuild",
  "deal-findrs": "DealFindrs",
  "f2k-checkpoint-new": "F2K Checkpoint",
  "property-services": "Property Services",
  "platform-trust": "Platform Trust",
  "universal-interviews": "Universal Interviews",
  launchready: "LaunchReady",
  connexions: "Connexions",
  kira: "Kira",
  "smart-board": "SmartBoard",
  "storefront-mcp": "Storefront MCP",
  "raiseready-template": "RaiseReady Template",
  "gbta-openclaw": "GBTA OpenClaw",
  "easy-claude-code": "EasyClaudeCode",
  "hair-stylist-ai": "Hair Stylist AI",
};

// --- main -------------------------------------------------------------------

const manifest = parseYaml(readFileSync(MANIFEST_PATH, "utf-8"));

// Step 1: fetch the platform-trust service_role_key (need it for the REST INSERT)
console.log(`Fetching platform-trust service_role_key…`);
const serviceKey = await fetchSupabaseServiceKey(PLATFORM_TRUST_REF);
console.log(`  ✓ resolved (${serviceKey.length} chars)\n`);

const projects = args.slug
  ? manifest.projects.filter((p) => p.name === args.slug)
  : manifest.projects;

let registered = 0;
let alreadySet = 0;
let skipped = 0;
let failed = 0;

console.log(`Registering ${projects.length} project(s) with platform-trust`);
console.log(`${"─".repeat(60)}\n`);

for (const project of projects) {
  console.log(`${project.name}  (${project.vercel_project_id})`);

  // Determine: does this project's manifest declare PLATFORM_TRUST_PROJECT_ID?
  const binding = project.envs?.PLATFORM_TRUST_PROJECT_ID;
  if (!binding) {
    console.log(`  · no PLATFORM_TRUST_PROJECT_ID declared in manifest\n`);
    skipped++;
    continue;
  }

  // If it's already a literal value in the manifest, just verify it's on Vercel
  const declaredValue =
    typeof binding === "string" ? binding : binding.value;
  if (declaredValue) {
    const live = await getVercelEnvValue(
      project.vercel_project_id,
      manifest.team_id,
      "PLATFORM_TRUST_PROJECT_ID"
    );
    if (live) {
      console.log(`  · already set on Vercel\n`);
      alreadySet++;
      continue;
    }
    if (args["dry-run"]) {
      console.log(
        `  → would push existing manifest value (${declaredValue}) to Vercel\n`
      );
      skipped++;
      continue;
    }
    try {
      await createVercelEnv(
        project.vercel_project_id,
        manifest.team_id,
        "PLATFORM_TRUST_PROJECT_ID",
        declaredValue
      );
      console.log(`  + pushed manifest literal to Vercel\n`);
      registered++;
    } catch (err) {
      console.log(`  ✗ Vercel push failed: ${err.message}\n`);
      failed++;
    }
    continue;
  }

  // It's a ref:$secret:... — need to register and provision
  if (await getVercelEnvValue(
    project.vercel_project_id,
    manifest.team_id,
    "PLATFORM_TRUST_PROJECT_ID"
  )) {
    console.log(`  · already set on Vercel (manifest still declares ref:)\n`);
    alreadySet++;
    continue;
  }

  const slug = project.name; // platform-trust slug = portfolio slug (lowercase-kebab)
  const name = NAME_OVERRIDES[slug] ?? slug;

  if (args["dry-run"]) {
    console.log(
      `  → would register slug='${slug}' name='${name}' with platform-trust\n`
    );
    skipped++;
    continue;
  }

  try {
    const uuid = await registerWithPlatformTrust(slug, name, serviceKey);
    console.log(`  + registered → ${uuid}`);
    await createVercelEnv(
      project.vercel_project_id,
      manifest.team_id,
      "PLATFORM_TRUST_PROJECT_ID",
      uuid
    );
    console.log(`  + pushed to Vercel\n`);
    registered++;
  } catch (err) {
    console.log(`  ✗ ${err.message}\n`);
    failed++;
  }
}

console.log(`${"─".repeat(60)}`);
console.log(
  `Total: ${registered} registered, ${alreadySet} already set, ${skipped} skipped, ${failed} failed`
);
process.exit(failed > 0 ? 1 : 0);

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
Usage: node scripts/register-platform-trust-projects.mjs [options]

Options:
  --manifest PATH  Manifest YAML path (default: portfolio-manifest.yaml)
  --slug NAME      Operate on a single project
  --dry-run        Print what would be registered; don't write
  --help           Show this message
`);
      process.exit(0);
    }
  }
  return out;
}

function readTokenFile(name) {
  try {
    return readFileSync(join(homedir(), name), "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}

async function fetchSupabaseServiceKey(projectRef) {
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/api-keys`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(
      `Supabase Management API ${res.status} for ${projectRef}/api-keys`
    );
  }
  const keys = await res.json();
  const found = keys.find((k) => k.name === "service_role");
  if (!found) {
    throw new Error(
      `Supabase project ${projectRef} returned no service_role key`
    );
  }
  return found.api_key;
}

/**
 * INSERT a project into platform-trust's `projects` table using the
 * service_role key. Returns the UUID. Idempotent: an existing slug returns
 * its current UUID via ON CONFLICT DO UPDATE … RETURNING (PostgREST
 * approximation: `Prefer: resolution=merge-duplicates` + a follow-up
 * GET if the response body is empty).
 */
async function registerWithPlatformTrust(slug, name, serviceKey) {
  // First try: INSERT with merge-duplicates. PostgREST does NOT return
  // the existing row on a conflict + merge — it just absorbs it. So we
  // do INSERT then SELECT.
  const insertUrl = `${PLATFORM_TRUST_URL}/rest/v1/projects`;
  const insertRes = await fetch(insertUrl, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify({ name, slug }),
  });

  if (insertRes.ok) {
    const rows = await insertRes.json();
    if (Array.isArray(rows) && rows[0]?.id) {
      return rows[0].id;
    }
  } else if (insertRes.status !== 409) {
    const body = await insertRes.text();
    throw new Error(
      `platform-trust INSERT failed (${insertRes.status}): ${body.slice(0, 200)}`
    );
  }

  // Fallback: row already exists OR insert returned empty body. SELECT it.
  const selectUrl = `${PLATFORM_TRUST_URL}/rest/v1/projects?slug=eq.${encodeURIComponent(slug)}&select=id`;
  const selectRes = await fetch(selectUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!selectRes.ok) {
    throw new Error(
      `platform-trust SELECT failed (${selectRes.status}) for slug=${slug}`
    );
  }
  const rows = await selectRes.json();
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0].id) {
    throw new Error(`platform-trust returned no row for slug=${slug}`);
  }
  return rows[0].id;
}

async function getVercelEnvValue(projectId, teamId, key) {
  // Returns truthy if Vercel has any record for this key, else undefined.
  // We don't fetch the value (would require decrypt=true) — just presence.
  const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(teamId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Vercel list-env ${res.status} for ${projectId}`);
  }
  const data = await res.json();
  return (data.envs ?? []).some((e) => e.key === key);
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
      // Enforce-Sensitive bans development creates; prod+preview only.
      target: ["production", "preview"],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel POST env ${res.status}: ${body.slice(0, 200)}`);
  }
}
