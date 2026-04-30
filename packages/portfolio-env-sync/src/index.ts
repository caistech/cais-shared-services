#!/usr/bin/env node
/**
 * @caistech/portfolio-env-sync — v0 read-only audit CLI
 *
 * Usage:
 *   portfolio-env-sync                          # audit all projects in manifest
 *   portfolio-env-sync --repo NAME              # audit one project
 *   portfolio-env-sync --manifest path/to.yaml  # alternate manifest path
 *   portfolio-env-sync --json                   # JSON output for piping
 *
 * Exit codes:
 *   0 — every project clean
 *   1 — drift detected (missing or needs_attention)
 *   2 — config error (manifest invalid, token missing, project not found)
 */

import { resolve } from "node:path";
import { loadManifest } from "./manifest.js";
import { VercelClient, VercelAuthError } from "./vercel.js";
import { auditProject, summarise, type ProjectSummary } from "./diff.js";
import type { ProjectAudit, AuditRow } from "./types.js";

interface CliArgs {
  manifest: string;
  repo?: string;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    manifest: "manifest.yaml",
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") args.manifest = argv[++i] ?? args.manifest;
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a !== undefined && a.startsWith("-"))
      throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

const HELP = `
@caistech/portfolio-env-sync — Vercel env audit (v0)

Usage:
  portfolio-env-sync [options]

Options:
  --manifest PATH   Path to portfolio manifest YAML (default: manifest.yaml)
  --repo NAME       Audit a single project by manifest 'name'
  --json            Emit JSON instead of pretty output
  --help            Show this message

Required env:
  VERCEL_TOKEN      https://vercel.com/account/tokens

Exit codes: 0 = clean, 1 = drift, 2 = config error
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

  let client: VercelClient;
  try {
    client = new VercelClient({ teamId: manifest.team_id });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

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
      const live = await client.listEnv(project.vercel_project_id);
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

  if (args.json) {
    process.stdout.write(JSON.stringify({ audits }, null, 2) + "\n");
  } else {
    renderPretty(audits);
  }

  // Exit 1 if any project has missing or needs_attention rows; project errors
  // (e.g. project not found) also trip exit 1 to surface immediately.
  const hasDrift = audits.some(
    (a) =>
      a.error !== undefined ||
      a.rows.some(
        (r) => r.status.kind === "missing" || r.status.kind === "needs_attention"
      )
  );
  return hasDrift ? 1 : 0;
}

function renderPretty(audits: ProjectAudit[]): void {
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

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
