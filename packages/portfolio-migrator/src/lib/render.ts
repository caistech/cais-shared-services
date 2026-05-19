/**
 * Render helpers — turn an InspectionReport / MigrationPlan into the human-
 * readable markdown + machine-readable JSON / patch files the migrator
 * writes to disk.
 *
 * Two concerns kept separate:
 *   - `renderInspectionMarkdown` / `renderInspectionJson` — outputs for
 *     `portfolio-migrator inspect`.
 *   - `renderPlanMarkdown` / `renderPlanPatch` / `renderPlanJson` — outputs
 *     for `portfolio-migrator plan`. Apply re-loads the JSON.
 */

import type {
  ApplyOutcome,
  ComplianceSummary,
  Gap,
  InspectionReport,
  MigrationPlan,
  MigrationStep,
} from '../types.js';
import { addedFileDiff } from './patch.js';

// --- inspection rendering ------------------------------------------------

export function renderInspectionMarkdown(report: InspectionReport): string {
  const lines: string[] = [];
  lines.push(`# Migration Report — ${report.packageName ?? '(unnamed)'}`);
  lines.push('');
  lines.push(`- **Repo:** \`${report.repoPath}\``);
  lines.push(`- **Generated:** ${report.timestamp}`);
  lines.push(`- **Framework:** ${report.framework}`);
  lines.push('');
  lines.push('## Compliance summary');
  lines.push('');
  lines.push(renderComplianceTable(report.compliance));
  lines.push('');
  lines.push('## Gaps');
  lines.push('');
  if (report.gaps.length === 0) {
    lines.push('No gaps detected — repo passes every v0.1 check.');
    lines.push('');
  } else {
    lines.push(renderGapsTable(report.gaps));
    lines.push('');
  }
  lines.push('## Next steps');
  lines.push('');
  lines.push(
    'Run `portfolio-migrator plan` to generate the proposed PR for these gaps. Plan output is reviewable on disk before `apply` touches the working tree.'
  );
  lines.push('');
  return lines.join('\n');
}

function renderComplianceTable(summary: ComplianceSummary): string {
  const lines = [
    `**${summary.percentage}% compliant** — ${summary.rulesPassed}/${summary.rulesChecked} rules passing.`,
    '',
    '| Rule | Status | Gaps | Description |',
    '|------|--------|------|-------------|',
  ];
  for (const row of summary.perRule) {
    const status = row.passed ? 'PASS' : 'FAIL';
    lines.push(
      `| ${row.rule} | ${status} | ${row.gapsCount} | ${row.description} |`
    );
  }
  return lines.join('\n');
}

function renderGapsTable(gaps: Gap[]): string {
  const lines = [
    '| Rule | Severity | Location | Detail |',
    '|------|----------|----------|--------|',
  ];
  for (const gap of gaps) {
    const loc = gap.file
      ? `\`${gap.file}${gap.line ? `:${gap.line}` : ''}\``
      : '—';
    const detail = `${escapePipe(gap.message)}${
      gap.detail ? ` — \`${escapePipe(gap.detail)}\`` : ''
    }`;
    lines.push(`| ${gap.rule} | ${gap.severity} | ${loc} | ${detail} |`);
  }
  return lines.join('\n');
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

export function renderInspectionJson(report: InspectionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

// --- plan rendering ------------------------------------------------------

export function renderPlanMarkdown(plan: MigrationPlan): string {
  const lines: string[] = [];
  lines.push(`# Migration Plan — ${plan.inspection.packageName ?? '(unnamed)'}`);
  lines.push('');
  lines.push(`- **Repo:** \`${plan.repoPath}\``);
  lines.push(`- **Generated:** ${plan.timestamp}`);
  lines.push(
    `- **Compliance before plan:** ${plan.inspection.compliance.percentage}% (${plan.inspection.compliance.rulesPassed}/${plan.inspection.compliance.rulesChecked} rules)`
  );
  lines.push('');
  lines.push('## How to use this plan');
  lines.push('');
  lines.push(
    [
      '1. Read each step below.',
      '2. For PATCH steps, the migrator can apply them via `portfolio-migrator apply --plan <this-file>.json --yes`.',
      '3. For NOTE steps, follow the embedded instructions by hand.',
      '4. After applying, re-run `portfolio-migrator status` to verify compliance moved.',
      '5. Commit + open a PR. The migrator never pushes — that\'s yours.',
    ].join('\n')
  );
  lines.push('');
  lines.push(`## Steps (${plan.steps.length})`);
  lines.push('');
  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i];
    lines.push(`### ${i + 1}. ${step.title}`);
    lines.push('');
    lines.push(`- **Kind:** ${step.kind}`);
    lines.push(`- **Rule:** ${step.rule}`);
    lines.push(`- **Migration id:** \`${step.id}\``);
    lines.push('');
    lines.push(step.description);
    lines.push('');
    if (step.kind === 'patch') {
      if (step.files.length > 0) {
        lines.push('**Files written:**');
        for (const file of step.files) {
          lines.push(
            `- \`${file.path}\`${
              file.ifMissing ? ' (only if missing)' : ''
            }`
          );
        }
        lines.push('');
      }
      if (step.replacements?.length) {
        lines.push('**Replacements:**');
        for (const r of step.replacements) {
          lines.push(`- \`${r.path}\` — ${r.description}`);
        }
        lines.push('');
      }
      if (step.followUpCommand) {
        lines.push(`**Follow-up command:** \`${step.followUpCommand}\``);
        lines.push('');
      }
    } else {
      lines.push('**Note body:**');
      lines.push('');
      lines.push(step.body);
      lines.push('');
    }
  }
  if (plan.steps.length === 0) {
    lines.push('No migration steps required — the repo is compliant against v0.1 checks.');
    lines.push('');
  }
  return lines.join('\n');
}

export function renderPlanPatch(plan: MigrationPlan): string {
  // For each patch step, emit a unified-diff-ish block. We use
  // `addedFileDiff` for every file (the migrator only ever overwrites
  // whole files in v0.1; surgical replacements appear as notes).
  const blocks: string[] = [];
  for (const step of plan.steps) {
    if (step.kind !== 'patch') continue;
    blocks.push(`# Step: ${step.title}  (${step.id})`);
    blocks.push(`# Rule: ${step.rule}`);
    blocks.push(`# ${step.description}`);
    for (const file of step.files) {
      blocks.push(addedFileDiff(file.path, file.content));
    }
    blocks.push('');
  }
  return blocks.join('\n');
}

export function renderPlanJson(plan: MigrationPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

// --- apply rendering -----------------------------------------------------

export function renderApplySummary(outcomes: ApplyOutcome[]): string {
  const lines: string[] = [];
  lines.push('Apply summary');
  lines.push('─'.repeat(60));
  let applied = 0;
  let skipped = 0;
  let errored = 0;
  let deferred = 0;
  for (const outcome of outcomes) {
    const tag =
      outcome.kind === 'applied'
        ? '  + '
        : outcome.kind === 'skipped'
          ? '  · '
          : outcome.kind === 'error'
            ? '  ✗ '
            : '  ! ';
    lines.push(`${tag}${outcome.step.title}  (${outcome.step.id})`);
    if (outcome.reason) lines.push(`      ${outcome.reason}`);
    if (outcome.filesWritten?.length) {
      for (const f of outcome.filesWritten) lines.push(`      → ${f}`);
    }
    if (outcome.kind === 'applied') applied += 1;
    else if (outcome.kind === 'skipped') skipped += 1;
    else if (outcome.kind === 'error') errored += 1;
    else if (outcome.kind === 'note-deferred') deferred += 1;
  }
  lines.push('─'.repeat(60));
  lines.push(
    `Applied: ${applied}  Skipped: ${skipped}  Errors: ${errored}  Deferred (notes): ${deferred}`
  );
  if (deferred > 0) {
    lines.push('');
    lines.push(
      'NOTE steps were not applied — review the plan markdown and apply by hand.'
    );
  }
  return lines.join('\n');
}
