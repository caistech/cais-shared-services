import type { Stage, StageGateTicks } from "./types.js";

/**
 * Assign the entry stage from the evidence gates — the workbook C5 formula:
 *
 *   =IF(AND(E17,E19,OR(E24,E26)),"De-risked",
 *       IF(AND(OR(E15,E16),E13,E24),"Part-developed","Conception"))
 *
 * Only 7 of the 21 ticks are load-bearing here; the rest are audit evidence.
 * Order matters: De-risked is tested before Part-developed.
 */
export function assignStage(t: StageGateTicks): Stage {
  const deRisked =
    t.subdivisionApprovalGranted && // E17
    t.conditionsSubstantiallyCleared && // E19
    (t.civilFeasibility || t.detailedCivilDesign); // OR(E24,E26)
  if (deRisked) return "De-risked";

  const partDeveloped =
    (t.subdivisionApplicationLodged || t.conditionalApproval) && // OR(E15,E16)
    t.structurePlanPrepared && // E13
    t.civilFeasibility; // E24
  if (partDeveloped) return "Part-developed";

  return "Conception";
}

/** The stage actually used downstream — manual override wins if present (workbook C7). */
export function resolveStage(t: StageGateTicks, override?: Stage): Stage {
  return override ?? assignStage(t);
}

/** A blank gate — convenience for callers building a record incrementally. */
export function emptyStageGate(): StageGateTicks {
  return {
    landOwnedOrUnderOption: false,
    developmentConcept: false,
    structurePlanPrepared: false,
    structurePlanApproved: false,
    subdivisionApplicationLodged: false,
    conditionalApproval: false,
    subdivisionApprovalGranted: false,
    conditionsClearanceUnderway: false,
    conditionsSubstantiallyCleared: false,
    depositedPlanLodged: false,
    titlesIssuedOrImminent: false,
    servicingStrategyPrepared: false,
    civilFeasibility: false,
    geotech: false,
    detailedCivilDesign: false,
    headworksAgreements: false,
    qsBankableCostPlan: false,
    realCapitalSunk: false,
    registeredValuation: false,
    fundingArranged: false,
    marketSignalling: false,
  };
}
