import type { StageGateTicks } from '@caistech/deal-model'
import { extractApprovalFromPdf, type ExtractOptions } from './extract.js'
import {
  stageGateFromApproval,
  mergeStageGates,
  deriveLifecycleStatus,
  outstandingGates,
  assignStage,
} from './stage-gate.js'
import type { DocumentKind, IngestResult } from './types.js'

/**
 * Ingest one subdivision-approval / plan PDF end-to-end (the app-agnostic core):
 * extract → stage-gate → merge with any prior gate → derive lifecycle + outstanding → IngestResult.
 *
 * This is the single function each consuming app's route calls; the app then PERSISTS the result to
 * its own schema (DealFindrs → opportunities/viability; F2K-Checkpoint → projects/workflow). The
 * package never touches a database.
 *
 * @param pdfBase64  the uploaded document, base64-encoded.
 * @param kind       the operator-selected document type.
 * @param priorGate  the project's/opportunity's already-accumulated stage gate (null on first doc),
 *                   so multiple documents OR-merge their evidence.
 * @param opts       Anthropic client/key/model (see {@link ExtractOptions}).
 */
export async function ingestApproval(
  pdfBase64: string,
  kind: DocumentKind,
  priorGate: StageGateTicks | null,
  opts?: ExtractOptions,
): Promise<IngestResult> {
  const extracted = await extractApprovalFromPdf(pdfBase64, opts)
  const thisGate = stageGateFromApproval(extracted)
  const stageGate = priorGate ? mergeStageGates([priorGate, thisGate]) : thisGate
  const { status, label } = deriveLifecycleStatus(stageGate)

  return {
    kind,
    extracted,
    stageGate,
    dealModelStage: assignStage(stageGate),
    lifecycleStatus: status,
    lifecycleLabel: label,
    outstanding: outstandingGates(stageGate),
    // The planner referral is resolved once a subdivision approval has been granted.
    referralCleared: stageGate.subdivisionApprovalGranted,
  }
}
