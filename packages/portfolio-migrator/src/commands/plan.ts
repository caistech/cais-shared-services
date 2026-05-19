/**
 * `portfolio-migrator plan` — inspect + generate proposed-PR artefacts.
 *
 * Writes three artefacts to `docs/`:
 *   - MIGRATION_PLAN_<YYYY-MM-DD>.md     (human-readable plan)
 *   - MIGRATION_PLAN_<YYYY-MM-DD>.patch  (unified-diff sketch)
 *   - MIGRATION_PLAN_<YYYY-MM-DD>.json   (machine-readable, consumed by `apply`)
 *
 * Does NOT modify the working tree — that's `apply`.
 *
 * Exit codes:
 *   0 — plan generated, repo was already compliant
 *   1 — plan generated, repo had gaps (this is the normal case)
 *   2 — config error
 */

import { resolve } from 'node:path';
import { exists, writeFile } from '../lib/fs.js';
import { inspectRepo } from '../lib/inspect.js';
import { buildPlan } from '../lib/plan.js';
import { cyan, dim, green, yellow } from '../lib/colors.js';
import {
  renderPlanJson,
  renderPlanMarkdown,
  renderPlanPatch,
} from '../lib/render.js';

export interface PlanArgs {
  repoPath: string;
  outDir: string;
  json: boolean;
}

export async function runPlan(args: PlanArgs): Promise<number> {
  if (!(await exists(resolve(args.repoPath, 'package.json')))) {
    process.stderr.write(
      `error: ${args.repoPath} does not contain a package.json — pass --repo <path> to override\n`
    );
    return 2;
  }

  process.stdout.write(`${cyan('Inspecting')} ${args.repoPath}\n`);
  const inspection = await inspectRepo(args.repoPath);
  process.stdout.write(
    `  ${dim(`${inspection.gaps.length} gap(s) found, ${inspection.compliance.percentage}% compliant`)}\n`
  );

  process.stdout.write(`${cyan('Building plan')}\n`);
  const plan = await buildPlan(inspection);

  const dateStamp = plan.timestamp.slice(0, 10);
  const mdPath = resolve(args.repoPath, args.outDir, `MIGRATION_PLAN_${dateStamp}.md`);
  const patchPath = resolve(args.repoPath, args.outDir, `MIGRATION_PLAN_${dateStamp}.patch`);
  const jsonPath = resolve(args.repoPath, args.outDir, `MIGRATION_PLAN_${dateStamp}.json`);

  await writeFile(mdPath, renderPlanMarkdown(plan));
  await writeFile(patchPath, renderPlanPatch(plan));
  await writeFile(jsonPath, renderPlanJson(plan));

  if (args.json) {
    process.stdout.write(renderPlanJson(plan));
  } else {
    process.stdout.write(`\n${cyan(`Plan has ${plan.steps.length} step(s):`)}\n`);
    for (let i = 0; i < plan.steps.length; i += 1) {
      const step = plan.steps[i];
      const tag = step.kind === 'patch' ? green('PATCH') : yellow('NOTE');
      process.stdout.write(`  ${i + 1}. ${tag}  ${step.title}  ${dim(`(${step.rule})`)}\n`);
    }
    process.stdout.write(`\nPlan written to:\n`);
    process.stdout.write(`  ${dim(mdPath)}\n`);
    process.stdout.write(`  ${dim(patchPath)}\n`);
    process.stdout.write(`  ${dim(jsonPath)}\n`);
    process.stdout.write(
      `\nNext: review the markdown, then run ${cyan(`portfolio-migrator apply --plan ${jsonPath} --yes`)}\n`
    );
  }

  return inspection.gaps.length > 0 ? 1 : 0;
}
