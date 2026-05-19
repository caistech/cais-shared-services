/**
 * `portfolio-migrator status` — read-only compliance score.
 *
 * Same scan as `inspect` but writes nothing — prints a one-screen summary
 * suitable for CI / dashboards / human sanity check.
 *
 * Exit codes:
 *   0 — fully compliant
 *   1 — has gaps
 *   2 — config error
 */

import { resolve } from 'node:path';
import { exists } from '../lib/fs.js';
import { inspectRepo } from '../lib/inspect.js';
import { bold, cyan, dim, green, red, yellow } from '../lib/colors.js';

export interface StatusArgs {
  repoPath: string;
  json: boolean;
}

export async function runStatus(args: StatusArgs): Promise<number> {
  if (!(await exists(resolve(args.repoPath, 'package.json')))) {
    process.stderr.write(
      `error: ${args.repoPath} does not contain a package.json\n`
    );
    return 2;
  }
  const report = await inspectRepo(args.repoPath);

  if (args.json) {
    process.stdout.write(JSON.stringify({
      repoPath: report.repoPath,
      packageName: report.packageName,
      compliance: report.compliance,
      gapsCount: report.gaps.length,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(
      `${bold('Status:')} ${report.packageName ?? '(unnamed)'}  ${dim(report.repoPath)}\n`
    );
    const pct = report.compliance.percentage;
    const colored =
      pct === 100 ? green(`${pct}%`) : pct >= 70 ? yellow(`${pct}%`) : red(`${pct}%`);
    process.stdout.write(
      `${bold('Compliance:')} ${colored}  (${report.compliance.rulesPassed}/${report.compliance.rulesChecked} rules, ${report.gaps.length} gap${report.gaps.length === 1 ? '' : 's'})\n\n`
    );
    for (const row of report.compliance.perRule) {
      const label = row.passed ? green('PASS') : red('FAIL');
      const count = row.gapsCount > 0 ? dim(` (${row.gapsCount})`) : '';
      process.stdout.write(`  ${label}  ${row.rule}  ${row.description}${count}\n`);
    }
    if (report.gaps.length > 0) {
      process.stdout.write(
        `\n${cyan('Next:')} run \`portfolio-migrator plan\` to generate the proposed PR.\n`
      );
    }
  }
  return report.gaps.some((g) => g.severity === 'fail') ? 1 : 0;
}
