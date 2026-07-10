import { emptyStageGate, assignStage } from '@caistech/deal-model'
import type { StageGateTicks } from '@caistech/deal-model'
import type { ExtractedApproval, LifecycleStatus } from './types.js'

/**
 * Which stage gates a WAPC subdivision-approval letter + plan evidences. An approval means the
 * application was lodged, a conditional approval issued, and the subdivision GRANTED; a modified
 * plan being approved means a structure/plan was prepared + approved; and the servicing conditions
 * (power/water/sewer to each lot) evidence a servicing strategy. It does NOT clear conditions
 * (Form 1C pending), design civil works, or issue titles — those stay false until their own
 * documents arrive. This conservatism is the point: the gate reflects real evidence, not optimism.
 */
export function stageGateFromApproval(x: ExtractedApproval): StageGateTicks {
  const gate = emptyStageGate()
  const hasApproval = x.wapcRef != null || x.residentialLots != null
  if (hasApproval) {
    gate.landOwnedOrUnderOption = true // an owner lodged a subdivision → land is held/optioned
    gate.developmentConcept = true
    gate.structurePlanPrepared = true
    gate.structurePlanApproved = true
    gate.subdivisionApplicationLodged = true
    gate.conditionalApproval = true
    gate.subdivisionApprovalGranted = true
    // Servicing is CONDITIONED (arrangements mandated with the authorities), which evidences a
    // servicing strategy — but not headworks agreements (still to be made).
    if (x.conditions.some((c) => c.category === 'servicing')) gate.servicingStrategyPrepared = true
  }
  return gate
}

/** Merge stage gates from several documents — a tick is set if ANY document evidences it. */
export function mergeStageGates(gates: StageGateTicks[]): StageGateTicks {
  const merged = emptyStageGate()
  for (const g of gates) {
    for (const k of Object.keys(merged) as (keyof StageGateTicks)[]) {
      if (g[k]) merged[k] = true
    }
  }
  return merged
}

/** The lifecycle ladder, low → high. The status is the highest rung the evidence reaches. */
const LADDER: { status: LifecycleStatus; label: string; test: (t: StageGateTicks) => boolean }[] = [
  { status: 'titled', label: 'Titled', test: (t) => t.titlesIssuedOrImminent },
  { status: 'conditions_clearing', label: 'Conditions clearing (Form 1C)', test: (t) => t.conditionsClearanceUnderway || t.conditionsSubstantiallyCleared || t.depositedPlanLodged },
  { status: 'subdivision_approved', label: 'Subdivision approved', test: (t) => t.subdivisionApprovalGranted },
  { status: 'conditional_approval', label: 'Conditional approval', test: (t) => t.conditionalApproval },
  { status: 'subdivision_lodged', label: 'Subdivision lodged', test: (t) => t.subdivisionApplicationLodged },
  { status: 'structure_plan', label: 'Structure plan', test: (t) => t.structurePlanPrepared || t.structurePlanApproved },
  { status: 'concept', label: 'Development concept', test: (t) => t.developmentConcept },
  { status: 'greenfield', label: 'Greenfield / raw land', test: (t) => t.landOwnedOrUnderOption },
]

export function deriveLifecycleStatus(t: StageGateTicks): { status: LifecycleStatus; label: string } {
  for (const rung of LADDER) {
    if (rung.test(t)) return { status: rung.status, label: rung.label }
  }
  return { status: 'greenfield', label: 'Greenfield / raw land' }
}

/** The de-risking gates still outstanding — what the deal needs next to progress to "De-risked". */
const DE_RISK_GATES: { key: keyof StageGateTicks; label: string }[] = [
  { key: 'conditionsSubstantiallyCleared', label: 'Conditions substantially cleared (Form 1C)' },
  { key: 'civilFeasibility', label: 'Civil feasibility' },
  { key: 'geotech', label: 'Geotechnical report' },
  { key: 'detailedCivilDesign', label: 'Detailed civil design' },
  { key: 'headworksAgreements', label: 'Headworks / servicing agreements' },
  { key: 'qsBankableCostPlan', label: 'QS bankable cost plan' },
  { key: 'registeredValuation', label: 'Registered valuation' },
  { key: 'fundingArranged', label: 'Funding arranged' },
]

export function outstandingGates(t: StageGateTicks): string[] {
  return DE_RISK_GATES.filter((g) => !t[g.key]).map((g) => g.label)
}

/** The coarse deal-model stage the uplift split uses. */
export { assignStage }
