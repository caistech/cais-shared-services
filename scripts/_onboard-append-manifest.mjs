#!/usr/bin/env node
// Append a new project entry to portfolio-manifest.yaml, preserving
// comments and ordering. Used by scripts/onboard-new-project.sh.
//
// Usage: node _onboard-append-manifest.mjs <manifest-path> <slug> <vercel-id> [supabase-ref]

import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument } from "yaml";

const [, , manifestPath, slug, vercelId, supabaseRef] = process.argv;

if (!manifestPath || !slug || !vercelId) {
  console.error(
    "Usage: node _onboard-append-manifest.mjs <manifest-path> <slug> <vercel-id> [supabase-ref]"
  );
  process.exit(1);
}

const text = readFileSync(manifestPath, "utf-8");
const doc = parseDocument(text);

const projects = doc.get("projects");
if (!projects || typeof projects.items === "undefined") {
  console.error(`ERROR: 'projects:' missing or not a sequence in ${manifestPath}`);
  process.exit(1);
}

// Idempotency: skip if already present
const exists = projects.items.some((node) => {
  const name = node.get?.("name");
  return name === slug;
});
if (exists) {
  console.log(`  · manifest: '${slug}' already present; skipping`);
  process.exit(0);
}

// Build the new project block. Use plain JS objects; `yaml` will serialize
// with the document's existing indentation.
const slugUnderscored = slug.replace(/-/g, "_");
const newEntry = {
  name: slug,
  vercel_project_id: vercelId,
  ...(supabaseRef ? { supabase_project_ref: supabaseRef } : {}),
  inherit_shared: [
    "PLATFORM_TRUST_SUPABASE_URL",
    "PLATFORM_TRUST_SERVICE_KEY",
    "GITHUB_PACKAGES_TOKEN",
  ],
  envs: {
    PLATFORM_TRUST_PROJECT_ID: {
      ref: `$secret:platform_trust_project_id_${slugUnderscored}`,
    },
    NEXT_PUBLIC_SUPABASE_URL: { from_supabase: "url" },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: { from_supabase: "anon_key" },
    SUPABASE_SERVICE_ROLE_KEY: { from_supabase: "service_role_key" },
  },
};

projects.add(newEntry);

writeFileSync(manifestPath, doc.toString(), "utf-8");
console.log(`  ✓ manifest: appended '${slug}' (${vercelId})`);
