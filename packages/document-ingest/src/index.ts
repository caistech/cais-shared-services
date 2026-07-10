/**
 * @caistech/document-ingest — shared AU subdivision-approval / plan document-ingest engine.
 *
 * Claude-direct PDF extraction (yield, conditions, easements, lot geometry) + stage-gate / lifecycle
 * rollup. App-agnostic: `ingestApproval()` returns a typed `IngestResult`; each consuming app plugs
 * in its own Anthropic key (ExtractOptions) and persists the result to its own schema.
 *
 * Consumers: DealFindrs (→ viability) and F2K-Checkpoint (→ the 197-task project workflow).
 */
export { extractApprovalFromPdf, type ExtractOptions } from './extract.js'
export {
  stageGateFromApproval,
  mergeStageGates,
  deriveLifecycleStatus,
  outstandingGates,
  assignStage,
} from './stage-gate.js'
export { ingestApproval } from './ingest.js'
export type {
  DocumentKind,
  ApprovalCondition,
  PlanFeature,
  LotSizeBand,
  ExtractedApproval,
  LifecycleStatus,
  IngestResult,
} from './types.js'
