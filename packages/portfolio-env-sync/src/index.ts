#!/usr/bin/env node
/**
 * @caistech/portfolio-env-sync — manifest-driven Vercel env tooling
 *
 * v0   audit-only:  read Vercel state, compare to manifest, report drift
 * v0.5 --apply:     create missing keys; PATCH targets for partials
 * v0.6 from_supabase: resolve via Supabase Management API
 *
 * Usage:
 *   portfolio-env-sync                          # audit all projects
 *   portfolio-env-sync --repo NAME              # audit one project
 *   portfolio-env-sync --manifest path/to.yaml  # alternate manifest path
 *   portfolio-env-sync --json                   # JSON output
 *   portfolio-env-sync --apply                  # create / patch missing keys
 *
 * Exit codes:
 *   0 — every project clean (or every action successful in apply mode)
 *   1 — drift detected (or any apply action errored)
 *   2 — config error (manifest invalid, token missing, project not found)
 */

import { resolve } from "node:path";
import { loadManifest } from "./manifest.js";
import { VercelClient, VercelAuthError } from "./vercel.js";
import { SupabaseManagementClient, SupabaseAuthError } from "./supabase.js";
import { applyProject } from "./apply.js";
import { applyAuthConfig } from "./auth.js";
import { auditProject, summarise, type ProjectSummary } from "./diff.js";
import type {
  ApplyAction,
  AuditRow,
  AuthApplyAction,
  ProjectApplyResult,
  ProjectAudit,
} from "./types.js";

interface CliArgs {
  manifest: string;
  repo?: string;
  json: boolean;
  apply: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    manifest: "manifest.yaml",
    json: false,
    apply: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") args.manifest = argv[++i] ?? args.manifest;
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a !== undefined && a.startsWith("-"))
      throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

const HELP = `
@caistech/portfolio-env-sync — Vercel env audit + apply

Usage:
  portfolio-env-sync [options]

Options:
  --manifest PATH   Path to portfolio manifest YAML (default: manifest.yaml)
  --repo NAME       Operate on a single project by manifest 'name'
  --json            Emit JSON instead of pretty output
  --apply           Create missing keys; PATCH targets for partials
  --help            Show this message

Required env:
  VERCEL_TOKEN              https://vercel.com/account/tokens
  SUPABASE_MANAGEMENT_TOKEN (only if any project uses 'from_supabase:')

Exit codes: 0 = clean, 1 = drift / apply errors, 2 = config error
`;

async function main(argv: readonly string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n${HELP}`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  let manifest;
  try {
    manifest = loadManifest(args.manifest);
  } catch (err) {
    process.stderr.write(`Manifest error: ${(err as Error).message}\n`);
    return 2;
  }

  let vercel: VercelClient;
  try {
    vercel = new VercelClient({ teamId: manifest.team_id });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  // Construct the Supabase client lazily — only on first resolution
  // attempt — so projects whose `from_supabase:` bindings are already
  // satisfied don't require SUPABASE_MANAGEMENT_TOKEN to be set.
  let supabase: SupabaseManagementClient | undefined;
  let supabaseAttempted = false;
  const supabaseFactory = (): SupabaseManagementClient => {
    if (supabase) return supabase;
    if (supabaseAttempted) {
      throw new SupabaseAuthError(
        "Supabase client previously failed to initialise"
      );
    }
    supabaseAttempted = true;
    supabase = new SupabaseManagementClient();
    return supabase;
  };

  const projects = args.repo
    ? manifest.projects.filter((p) => p.name === args.repo)
    : manifest.projects;

  if (args.repo && projects.length === 0) {
    process.stderr.write(
      `No project named '${args.repo}' in ${resolve(args.manifest)}\n`
    );
    return 2;
  }

  const audits: ProjectAudit[] = [];
  for (const project of projects) {
    try {
      const live = await vercel.listEnv(project.vercel_project_id);
      audits.push(auditProject(manifest, project, live));
    } catch (err) {
      if (err instanceof VercelAuthError) {
        process.stderr.write(`${err.message}\n`);
        return 2;
      }
      audits.push({
        project: project.name,
        vercel_project_id: project.vercel_project_id,
        error: (err as Error).message,
        rows: [],
      });
    }
  }

  if (!args.apply) {
    // Audit-only mode — original v0 behaviour
    if (args.json) {
      process.stdout.write(JSON.stringify({ audits }, null, 2) + "\n");
    } else {
      renderAuditPretty(audits);
    }
    return hasAuditDrift(audits) ? 1 : 0;
  }

  // Apply mode — also print the audit first, then apply, then a final
  // re-audit isn't done (would double the API time); user can re-run.
  if (!args.json) {
    renderAuditPretty(audits);
    process.stdout.write("\n");
  }

  const applyResults: ProjectApplyResult[] = [];
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]!;
    const audit = audits[i]!;
    if (audit.error) {
      applyResults.push({
        project: project.name,
        vercel_project_id: project.vercel_project_id,
        actions: [
          { kind: "skipped", key: "<all>", reason: `audit failed: ${audit.error}` },
        ],
      });
      continue;
    }
    try {
      const result = await applyProject(
        manifest,
        project,
        audit,
        vercel,
        supabaseFactory
      );
      applyResults.push(result);
    } catch (err) {
      if (err instanceof VercelAuthError || err instanceof SupabaseAuthError) {
        process.stderr.write(`${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  // Apply Supabase Auth config for any project that declares auth_config:
  const authResults: { project: string; action: AuthApplyAction }[] = [];
  for (const project of projects) {
    if (!project.auth_config) continue;
    try {
      const action = await applyAuthConfig(project, supabaseFactory);
      authResults.push({ project: project.name, action });
    } catch (err) {
      if (err instanceof VercelAuthError || err instanceof SupabaseAuthError) {
        process.stderr.write(`${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ audits, applyResults, authResults }, null, 2) + "\n"
    );
  } else {
    renderApplyPretty(applyResults);
    if (authResults.length > 0) renderAuthApplyPretty(authResults);
  }

  const hasAnyErr = hasApplyErrors(applyResults) || authResults.some(
    (r) => r.action.kind === "error"
  );
  return hasAnyErr ? 1 : 0;
}

function hasAuditDrift(audits: ProjectAudit[]): boolean {
  return audits.some(
    (a) =>
      a.error !== undefined ||
      a.rows.some(
        (r) => r.status.kind === "missing" || r.status.kind === "needs_attention"
      )
  );
}

function hasApplyErrors(results: ProjectApplyResult[]): boolean {
  return results.some((r) => r.actions.some((a) => a.kind === "error"));
}

function renderAuditPretty(audits: ProjectAudit[]): void {
  const out = process.stdout;
  out.write(`Auditing ${audits.length} project(s)\n`);
  out.write(`${"─".repeat(60)}\n\n`);

  const summaries: ProjectSummary[] = [];

  for (const audit of audits) {
    out.write(`${audit.project}  (${audit.vercel_project_id})\n`);
    if (audit.error) {
      out.write(`  ✗ ${audit.error}\n\n`);
      continue;
    }
    for (const row of audit.rows) {
      out.write(formatRow(row));
    }
    const s = summarise(audit);
    summaries.push(s);
    out.write(
      `  ─ ${s.ok} ok, ${s.needs_attention} needs attention, ${s.missing} missing, ${s.extra} extra\n\n`
    );
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      ok: acc.ok + s.ok,
      needs_attention: acc.needs_attention + s.needs_attention,
      missing: acc.missing + s.missing,
      extra: acc.extra + s.extra,
    }),
    { ok: 0, needs_attention: 0, missing: 0, extra: 0 }
  );
  out.write(`${"─".repeat(60)}\n`);
  out.write(
    `Total: ${totals.ok} ok, ${totals.needs_attention} needs attention, ${totals.missing} missing, ${totals.extra} extra\n`
  );
}

function renderApplyPretty(results: ProjectApplyResult[]): void {
  const out = process.stdout;
  out.write(`Applying changes\n`);
  out.write(`${"─".repeat(60)}\n\n`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrored = 0;

  for (const result of results) {
    out.write(`${result.project}  (${result.vercel_project_id})\n`);
    if (result.actions.length === 0) {
      out.write(`  · no changes needed\n\n`);
      continue;
    }
    for (const action of result.actions) {
      out.write(formatAction(action));
      if (action.kind === "created") totalCreated++;
      else if (action.kind === "updated") totalUpdated++;
      else if (action.kind === "skipped") totalSkipped++;
      else if (action.kind === "error") totalErrored++;
    }
    out.write("\n");
  }

  out.write(`${"─".repeat(60)}\n`);
  out.write(
    `Total: ${totalCreated} created, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrored} errored\n`
  );
}

function formatRow(row: AuditRow): string {
  const key = row.key.padEnd(40);
  switch (row.status.kind) {
    case "ok":
      return `  ✓ ${key} (${row.status.targets.join(", ")})\n`;
    case "needs_attention":
      return `  ⚠ ${key} present in [${row.status.present_in.join(", ")}], missing [${row.status.missing_from.join(", ")}]\n`;
    case "missing":
      return `  ✗ ${key} MISSING\n`;
    case "extra":
      return `  · ${key} (extra: ${row.status.present_in.join(", ")})\n`;
  }
}

function renderAuthApplyPretty(
  results: { project: string; action: AuthApplyAction }[]
): void {
  const out = process.stdout;
  out.write(`\nApplying Supabase Auth config\n`);
  out.write(`${"─".repeat(60)}\n\n`);

  let patched = 0;
  let unchanged = 0;
  let skipped = 0;
  let errored = 0;

  for (const r of results) {
    out.write(`${r.project}\n`);
    switch (r.action.kind) {
      case "patched":
        out.write(`  ~ patched: ${r.action.fields.join(", ")}\n`);
        patched++;
        break;
      case "no_change":
        out.write(`  · ${r.action.reason}\n`);
        unchanged++;
        break;
      case "skipped":
        out.write(`  · skipped: ${r.action.reason}\n`);
        skipped++;
        break;
      case "error":
        out.write(`  ✗ ERROR: ${r.action.error}\n`);
        errored++;
        break;
    }
    out.write("\n");
  }

  out.write(`${"─".repeat(60)}\n`);
  out.write(
    `Auth config: ${patched} patched, ${unchanged} unchanged, ${skipped} skipped, ${errored} errored\n`
  );
}

function formatAction(action: ApplyAction): string {
  const key = action.key.padEnd(40);
  switch (action.kind) {
    case "created":
      return `  + ${key} created on [${action.targets.join(", ")}]\n`;
    case "updated":
      return `  ~ ${key} added targets [${action.added_targets.join(", ")}]\n`;
    case "skipped":
      return `  · ${key} skipped: ${action.reason}\n`;
    case "error":
      return `  ✗ ${key} ERROR: ${action.error}\n`;
  }
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
