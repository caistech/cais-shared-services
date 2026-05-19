#!/usr/bin/env node
/**
 * `portfolio-migrator` — main CLI entry.
 *
 * Subcommand dispatcher. The subcommand parsers live in `../commands/`.
 *
 * Usage:
 *   portfolio-migrator inspect [--repo <path>] [--out <dir>] [--json]
 *   portfolio-migrator plan    [--repo <path>] [--out <dir>] [--json]
 *   portfolio-migrator apply   [--repo <path>] --plan <file> [--yes]
 *   portfolio-migrator status  [--repo <path>] [--json]
 *
 * Exit codes follow the per-subcommand contract — see each command's
 * source for the full breakdown.
 */

import { resolve } from 'node:path';
import { runInspect } from '../commands/inspect.js';
import { runPlan } from '../commands/plan.js';
import { runApply } from '../commands/apply.js';
import { runStatus } from '../commands/status.js';

const HELP = `
@caistech/portfolio-migrator — dry-run-first backfill CLI for the
Corporate AI Solutions Portfolio Standard.

Usage:
  portfolio-migrator inspect [options]   Discover Portfolio Standard gaps in a repo
  portfolio-migrator plan    [options]   Generate proposed-PR artefacts (md + patch + json)
  portfolio-migrator apply   [options]   Execute a previously-generated plan (requires --yes)
  portfolio-migrator status  [options]   Print compliance score (CI-friendly)
  portfolio-migrator --help              Show this message
  portfolio-migrator <cmd> --help        Show subcommand help

Common options:
  --repo <path>     Target repo. Defaults to cwd.
  --out <dir>       Output directory inside repo (default: docs).
  --json            Emit JSON instead of human-readable output.

Apply-only options:
  --plan <file>     Path to the .json plan file from \`plan\`.
  --yes             Actually write changes. Without --yes, apply dry-runs.

Exit codes:
  0  success / fully compliant
  1  gaps found or apply step errored
  2  config error (missing file, unparseable plan, etc.)

Examples:
  # 1) Discover gaps:
  portfolio-migrator inspect --repo /path/to/lessons-learned

  # 2) Build a plan:
  portfolio-migrator plan --repo /path/to/lessons-learned

  # 3) Review docs/MIGRATION_PLAN_<date>.md, then apply:
  portfolio-migrator apply --repo /path/to/lessons-learned \\
    --plan /path/to/lessons-learned/docs/MIGRATION_PLAN_<date>.json --yes

  # 4) Verify:
  portfolio-migrator status --repo /path/to/lessons-learned
`;

interface ParsedArgs {
  command: string | null;
  repoPath: string;
  outDir: string;
  planPath: string | null;
  yes: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: null,
    repoPath: process.cwd(),
    outDir: 'docs',
    planPath: null,
    yes: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (i === 0 && !a.startsWith('-')) {
      args.command = a;
      continue;
    }
    if (a === '--repo') {
      args.repoPath = resolve(argv[++i] ?? args.repoPath);
    } else if (a === '--out') {
      args.outDir = argv[++i] ?? args.outDir;
    } else if (a === '--plan') {
      args.planPath = argv[++i] ?? null;
    } else if (a === '--yes' || a === '-y') {
      args.yes = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a.startsWith('-')) {
      process.stderr.write(`unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help || args.command === null) {
    process.stdout.write(HELP);
    return args.command === null ? 0 : 0;
  }

  switch (args.command) {
    case 'inspect':
      return runInspect({
        repoPath: args.repoPath,
        outDir: args.outDir,
        json: args.json,
      });
    case 'plan':
      return runPlan({
        repoPath: args.repoPath,
        outDir: args.outDir,
        json: args.json,
      });
    case 'apply':
      if (!args.planPath) {
        process.stderr.write(
          `error: --plan <file> is required for apply\n`
        );
        return 2;
      }
      return runApply({
        repoPath: args.repoPath,
        planPath: args.planPath,
        yes: args.yes,
      });
    case 'status':
      return runStatus({
        repoPath: args.repoPath,
        json: args.json,
      });
    default:
      process.stderr.write(`unknown command: ${args.command}\n${HELP}`);
      return 2;
  }
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
