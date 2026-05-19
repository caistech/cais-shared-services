/**
 * @caistech/portfolio-migrator — public API entry.
 *
 * Most consumers will use the CLI (`portfolio-migrator inspect|plan|apply|status`),
 * but the helpers are exported here so a future Renovate / scheduled-agent
 * can call them programmatically without spawning a subprocess.
 */

export { inspectRepo } from './lib/inspect.js';
export { buildPlan } from './lib/plan.js';
export { applyPlan } from './lib/apply.js';
export {
  renderInspectionMarkdown,
  renderInspectionJson,
  renderPlanMarkdown,
  renderPlanPatch,
  renderPlanJson,
  renderApplySummary,
} from './lib/render.js';

export type {
  ApplyOutcome,
  ComplianceSummary,
  Gap,
  GapSeverity,
  InspectionReport,
  MigrationId,
  MigrationPlan,
  MigrationStep,
  ProposedFile,
  ProposedReplacement,
  RuleId,
} from './types.js';
