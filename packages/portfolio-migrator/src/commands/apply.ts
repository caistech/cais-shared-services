/**
 * `portfolio-migrator apply` — execute a previously-generated plan.
 *
 * Reads the plan from disk (`--plan path/to/MIGRATION_PLAN_*.json`),
 * walks every step, and writes patch-step files into the target repo.
 *
 * Hard constraints (enforced here AND by the apply executor):
 *   - `--yes` is required to write anything. Without it, prints what would
 *     happen and exits 0.
 *   - Never pushes. Never commits. Apply is the planner — the user does
 *     `git add` + `git commit` themselves.
 *   - Notes are NEVER auto-applied — they're surfaced for manual review.
 *
 * Exit codes:
 *   0 — every patch step applied (or every step was a note / no-op in dry run)
 *   1 — at least one patch step errored
 *   2 — config error (plan missing, plan unparseable)
 */

import { resolve } from 'node:path';
import { applyPlan } from '../lib/apply.js';
import { exists, readFileStrict } from '../lib/fs.js';
import { cyan, dim, red } from '../lib/colors.js';
import { renderApplySummary } from '../lib/render.js';
import type { MigrationPlan } from '../types.js';

export interface ApplyArgs {
  repoPath: string;
  planPath: string;
  yes: boolean;
}

export async function runApply(args: ApplyArgs): Promise<number> {
  const planAbsolute = resolve(args.planPath);
  if (!(await exists(planAbsolute))) {
    process.stderr.write(
      `error: plan file not found at ${planAbsolute}\n`
    );
    return 2;
  }
  let plan: MigrationPlan;
  try {
    const raw = await readFileStrict(planAbsolute);
    plan = JSON.parse(raw) as MigrationPlan;
  } catch (err) {
    process.stderr.write(`error: failed to parse plan: ${(err as Error).message}\n`);
    return 2;
  }

  if (!args.yes) {
    process.stdout.write(
      `${cyan('Dry run')} — pass --yes to actually write files.\n\n`
    );
  } else {
    process.stdout.write(`${cyan('Applying plan')} to ${args.repoPath}\n\n`);
  }

  const outcomes = await applyPlan(plan, {
    repoPath: args.repoPath,
    yes: args.yes,
  });

  process.stdout.write(renderApplySummary(outcomes));
  process.stdout.write('\n');

  if (!args.yes) {
    process.stdout.write(
      `\n${dim('Re-run with --yes to apply patch steps. Note steps remain manual.')}\n`
    );
  } else {
    process.stdout.write(
      `\n${dim('Apply complete. Review changes with')} ${cyan('git diff')}${dim(', then commit yourself — the migrator never pushes.')}\n`
    );
  }

  const hasError = outcomes.some((o) => o.kind === 'error');
  if (hasError) {
    process.stderr.write(red('\nAt least one step errored — see summary above.\n'));
  }
  return hasError ? 1 : 0;
}
