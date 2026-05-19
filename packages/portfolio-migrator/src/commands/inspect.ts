/**
 * `portfolio-migrator inspect` — read-only discovery scan.
 *
 * Writes two artefacts to `docs/`:
 *   - MIGRATION_REPORT_<YYYY-MM-DD>.md  (human-readable)
 *   - MIGRATION_REPORT_<YYYY-MM-DD>.json (machine-readable, consumed by `plan`)
 *
 * Exit codes:
 *   0 — repo is fully compliant (no gaps with severity 'fail')
 *   1 — gaps found
 *   2 — config error (e.g. target not a repo)
 */

import { resolve } from 'node:path';
import { exists, writeFile } from '../lib/fs.js';
import { inspectRepo } from '../lib/inspect.js';
import { bold, cyan, dim, green, red, yellow } from '../lib/colors.js';
import {
  renderInspectionJson,
  renderInspectionMarkdown,
} from '../lib/render.js';

export interface InspectArgs {
  repoPath: string;
  outDir: string;
  json: boolean;
}

export async function runInspect(args: InspectArgs): Promise<number> {
  if (!(await exists(resolve(args.repoPath, 'package.json')))) {
    process.stderr.write(
      `error: ${args.repoPath} does not contain a package.json — pass --repo <path> to override\n`
    );
    return 2;
  }

  process.stdout.write(`${cyan('Inspecting')} ${args.repoPath}\n`);
  const report = await inspectRepo(args.repoPath);

  const dateStamp = report.timestamp.slice(0, 10);
  const reportMdPath = resolve(
    args.repoPath,
    args.outDir,
    `MIGRATION_REPORT_${dateStamp}.md`
  );
  const reportJsonPath = resolve(
    args.repoPath,
    args.outDir,
    `MIGRATION_REPORT_${dateStamp}.json`
  );

  await writeFile(reportMdPath, renderInspectionMarkdown(report));
  await writeFile(reportJsonPath, renderInspectionJson(report));

  if (args.json) {
    process.stdout.write(renderInspectionJson(report));
  } else {
    renderHumanSummary(report.compliance, report.gaps.length);
    process.stdout.write(`\nReport written to:\n`);
    process.stdout.write(`  ${dim(reportMdPath)}\n`);
    process.stdout.write(`  ${dim(reportJsonPath)}\n`);
  }

  const hasFail = report.gaps.some((g) => g.severity === 'fail');
  return hasFail ? 1 : 0;
}

function renderHumanSummary(
  compliance: { percentage: number; perRule: Array<{ rule: string; passed: boolean; gapsCount: number; description: string }> },
  totalGaps: number
): void {
  const out = process.stdout;
  out.write(
    `\n${bold('Compliance:')} ${
      compliance.percentage === 100
        ? green(`${compliance.percentage}%`)
        : compliance.percentage >= 70
          ? yellow(`${compliance.percentage}%`)
          : red(`${compliance.percentage}%`)
    }  (${totalGaps} gap${totalGaps === 1 ? '' : 's'})\n\n`
  );
  for (const row of compliance.perRule) {
    const label = row.passed ? green('PASS') : red('FAIL');
    const count = row.gapsCount > 0 ? dim(` (${row.gapsCount})`) : '';
    out.write(`  ${label}  ${row.rule}  ${row.description}${count}\n`);
  }
}
