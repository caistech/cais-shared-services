/**
 * Apply executor — consumes a previously-generated MigrationPlan and walks
 * its steps, writing patch-step files and deferring note-step bodies.
 *
 * Hard constraints:
 *   - NEVER push to git remotes.
 *   - NEVER touch a file outside the plan's `repoPath`.
 *   - NEVER apply a `note` step — those require human judgment.
 *   - Each step is independent: an error in step N does not block N+1.
 *     The summary surfaces all errors at the end.
 */

import { resolve } from 'node:path';
import type {
  ApplyOutcome,
  MigrationPlan,
  MigrationStep,
  ProposedFile,
  ProposedReplacement,
} from '../types.js';
import { exists, readFileOptional, writeFile } from './fs.js';

export interface ApplyOptions {
  /** Repo root override. Defaults to the plan's stored repoPath. */
  repoPath?: string;
  /** Set true to actually write files; false to dry-run. */
  yes: boolean;
}

/**
 * Walk every step in the plan, producing one ApplyOutcome per step.
 * Always returns — never throws on per-step errors; the caller renders
 * a summary.
 */
export async function applyPlan(
  plan: MigrationPlan,
  options: ApplyOptions
): Promise<ApplyOutcome[]> {
  const repoPath = options.repoPath ?? plan.repoPath;
  const outcomes: ApplyOutcome[] = [];
  for (const step of plan.steps) {
    if (step.kind === 'note') {
      outcomes.push({
        step,
        kind: 'note-deferred',
        reason: 'note steps require human review — apply by hand',
      });
      continue;
    }
    try {
      const outcome = await applyPatchStep(step, repoPath, options.yes);
      outcomes.push(outcome);
    } catch (err) {
      outcomes.push({
        step,
        kind: 'error',
        reason: (err as Error).message,
      });
    }
  }
  return outcomes;
}

async function applyPatchStep(
  step: MigrationStep & { kind: 'patch' },
  repoPath: string,
  yes: boolean
): Promise<ApplyOutcome> {
  const filesWritten: string[] = [];

  for (const file of step.files) {
    const result = await applyFile(file, repoPath, yes);
    if (result === 'skipped-exists') continue;
    if (result === 'written') filesWritten.push(file.path);
  }

  if (step.replacements) {
    for (const replacement of step.replacements) {
      const result = await applyReplacement(replacement, repoPath, yes);
      if (result === 'written' && !filesWritten.includes(replacement.path)) {
        filesWritten.push(replacement.path);
      }
    }
  }

  if (!yes) {
    return {
      step,
      kind: 'skipped',
      reason: 'dry-run (no --yes flag)',
      filesWritten,
    };
  }
  return {
    step,
    kind: 'applied',
    filesWritten,
  };
}

async function applyFile(
  file: ProposedFile,
  repoPath: string,
  yes: boolean
): Promise<'written' | 'skipped-exists'> {
  const absolute = resolve(repoPath, file.path);
  if (file.ifMissing && (await exists(absolute))) {
    return 'skipped-exists';
  }
  if (yes) {
    await writeFile(absolute, file.content);
  }
  return 'written';
}

async function applyReplacement(
  r: ProposedReplacement,
  repoPath: string,
  yes: boolean
): Promise<'written' | 'skipped-missing'> {
  const absolute = resolve(repoPath, r.path);
  const existing = await readFileOptional(absolute);
  if (existing === null) return 'skipped-missing';
  let next: string;
  if (r.replaceAll) {
    next = existing.split(r.find).join(r.replace);
  } else {
    const idx = existing.indexOf(r.find);
    if (idx === -1) return 'skipped-missing';
    next = existing.slice(0, idx) + r.replace + existing.slice(idx + r.find.length);
  }
  if (next === existing) return 'skipped-missing';
  if (yes) {
    await writeFile(absolute, next);
  }
  return 'written';
}
