/**
 * Type definitions for the Generic Estate Deal Model (F2K), V7.
 *
 * Faithful to `Seafields_Estate_Deal_Model_V7.xlsx` (sheet "Estate Model"). Cell
 * references in comments (e.g. B85) point back to that workbook so the code and
 * the spreadsheet can be reconciled line-by-line. V7 delta over V5: every party's
 * contribution is recovered in the base — the base subtotal now adds the F2K
 * contribution per lot (B82 = SUM(B74:B81) + B61/B37), per the SPV/HoA reset.
 *
 * UNITS CONTRACT (do not conflate — the workbook mixes the two):
 *   - `*PerLot`  fields are entered per lot (workbook column C).
 *   - `*Total`   fields are entered as a whole-of-project total (workbook column D input rows).
 * Everything else is a rate/percentage (0..1) or a count.
 */

export type FundingMode = "Internal" | "External";
export type CivilMode = "Contractor" | "Civil-JV";
export type Stage = "Conception" | "Part-developed" | "De-risked";

/** The headline gate outcome. `REJECT` covers both workbook reject branches; see {@link VerdictDetail}. */
export type Verdict = "GO" | "ADJUST" | "REJECT";

/**
 * The 21 evidence gates (workbook Section 1, cells E11:E33). ALL 21 are stored
 * for the audit trail; only 7 are load-bearing in {@link assignStage} (the C5
 * formula) — the rest are evidence tracking. Keep every one so the record is
 * tamper-evident and the stage is reproducible.
 */
export interface StageGateTicks {
  // PLANNING & APPROVALS (E11:E21)
  landOwnedOrUnderOption: boolean; // E11
  developmentConcept: boolean; // E12
  structurePlanPrepared: boolean; // E13 *
  structurePlanApproved: boolean; // E14
  subdivisionApplicationLodged: boolean; // E15 *
  conditionalApproval: boolean; // E16 *
  subdivisionApprovalGranted: boolean; // E17 *
  conditionsClearanceUnderway: boolean; // E18
  conditionsSubstantiallyCleared: boolean; // E19 *
  depositedPlanLodged: boolean; // E20
  titlesIssuedOrImminent: boolean; // E21
  // ENGINEERING & SERVICING (E23:E28)
  servicingStrategyPrepared: boolean; // E23
  civilFeasibility: boolean; // E24 *
  geotech: boolean; // E25
  detailedCivilDesign: boolean; // E26 *
  headworksAgreements: boolean; // E27
  qsBankableCostPlan: boolean; // E28
  // COMMERCIAL & FINANCIAL (E30:E33)
  realCapitalSunk: boolean; // E30
  registeredValuation: boolean; // E31
  fundingArranged: boolean; // E32
  marketSignalling: boolean; // E33
}

/** Per-tranche finance timing (workbook Section 5, columns E "Term" and F "Avg out."). */
export interface TrancheTerm {
  /** Loan term in years (workbook column E). */
  term: number;
  /** Average-outstanding factor 0..1 (workbook column F). */
  avgOut: number;
}

export interface TrancheTerms {
  land: TrancheTerm; // E66/F66
  infra: TrancheTerm; // E67/F67
  sunk: TrancheTerm; // E68/F68
  f2k: TrancheTerm; // E69/F69
}

/**
 * Constants — "editable if needed" in the workbook. These are policy knobs;
 * defaults mirror V5. Callers normally leave these at default and pass only the
 * per-deal {@link DealModelInputs}. Thresholds and splits here are the values
 * the business signs off (see the architecture doc's policy table).
 */
export interface DealModelConstants {
  /** Internal-rate deduction — fees avoided (C49). */
  internalDeduction: number;
  /** Civil engineering fee, % of per-lot infra cost (C57). */
  civilEngFeePct: number;
  /** Civil contractor margin within the works, % (C62). */
  civilContractorMarginPct: number;
  /** F2K project-management fee, % of base (C83). Base = subtotal / (1 - pmFeePct). */
  pmFeePct: number;
  /** Agent commission, % of SALE price (C91). */
  agentCommissionPct: number;
  /** Introducer fee, % of land value (C81/E136 use 0.01). */
  introducerPctOfLand: number;
  /** F2K uplift share by entry stage (C104). Developer share is the complement. */
  stageSplits: Record<Stage, number>;
  /** Hurdle: reject if net-uplift % of base is below this (C112). */
  rejectBelow: number;
  /** Hurdle: clean GO at or above this net-uplift % of base (C113). */
  cleanGoAt: number;
  /** Hurdle: developer post-split share must be at least this % of base (C114). */
  developerFloorPctOfBase: number;
  /** Per-tranche term + avg-outstanding factors (Section 5). */
  trancheTerms: TrancheTerms;
}

/** The per-deal variables (workbook blue inputs). */
export interface DealModelInputs {
  lots: number; // C37
  marketPricePerLot: number; // C38
  fundingMode: FundingMode; // C40
  /** 0..1 — fraction of lots F2K builds homes on (C41). */
  homeCaptureRate: number;
  civilMode: CivilMode; // C42

  /**
   * Live dev-finance quotes; external average = mean of these (C45:C47).
   * Optional — defaults to `[0.12, 0.12, 0.12]` (V7 flat 12% market rate) when omitted.
   */
  externalQuotes?: number[];

  landPerLot: number; // C54
  developerSunkCostTotal: number; // D55 (TOTAL)
  infraPerLot: number; // C56
  softCostsPerLot: number; // C59
  educationPerLot: number; // C60
  f2kContributionTotal: number; // C61 (TOTAL)
  modularMarginPerHome: number; // C120

  /** The 21 evidence gates. */
  stageGate: StageGateTicks;
  /** Manual stage override (C6). Blank/undefined = use the gate ticks. */
  stageOverride?: Stage;
  /** Optional F2K uplift-share override (C105). Blank/undefined = stage default. */
  f2kShareOverride?: number;

  /** Optional policy overrides; anything omitted falls back to {@link DEFAULT_CONSTANTS}. */
  constants?: Partial<DealModelConstants>;
}

// ---- Result shape ------------------------------------------------------------

export interface FinanceResult {
  externalAverage: number; // C48
  internalRate: number; // C50
  projectRate: number; // C51
  /** Finance cost per tranche (Section 5, column G). */
  tranches: {
    land: number; // G66
    infra: number; // G67
    sunk: number; // G68
    f2k: number; // G69
  };
  baseFinanceTotal: number; // G70
  baseFinancePerLot: number; // G71
}

export interface BaseRateResult {
  /** Per-lot components of the finance-inclusive subtotal (Section 6). */
  components: {
    land: number; // C74
    soft: number; // C75
    infra: number; // C76
    civilEngFee: number; // C77
    education: number; // C78
    developerSunkPerLot: number; // C79
    baseFinancePerLot: number; // C80
    introducerPerLot: number; // C81
    /** F2K contribution per lot (B61/B37) — V7: recovered in the base like every other party's. */
    f2kContributionPerLot: number;
  };
  subtotalPerLot: number; // B82
  /** BASE RATE / lot — the finance-inclusive, PM-loaded price floor (C85). */
  baseRatePerLot: number;
}

export interface MarketResult {
  grossUpliftPerLot: number; // C90
  agentCommissionPerLot: number; // D91
  netUpliftPerLot: number; // C92
  netUpliftPctOfBase: number; // C93
}

export interface SplitResult {
  civilJvSharePerLot: number; // C98 (0 unless Civil-JV)
  upliftToSplitPerLot: number; // C101
  upliftToSplitTotal: number; // D102
  f2kShare: number; // C106
  developerShare: number; // C107
  f2kUpliftTotal: number; // C108
  developerUpliftTotal: number; // C109
}

export interface VerdictDetail {
  verdict: Verdict;
  /** True when the reject reason is a thin developer slice (C116 "REJECT: dev thin"). */
  developerThin: boolean;
  reason: string; // C117
  developerPostSplitPctOfBase: number; // C115
}

export interface F2kIncomeResult {
  homesBuilt: number; // C121
  pmFeeTotal: number; // C122
  upliftShareTotal: number; // C123 (= C108)
  financeCarryTotal: number; // C124 (= G69)
  landOnlyReturn: number; // C125
  modularMarginTotal: number; // C126
  landPlusHomesReturn: number; // C127
}

export interface PartyOutcome {
  party: string;
  capitalBack: number;
  financeOrCarry: number;
  feesOrMargin: number;
  uplift: number;
  /** Profit total — EXCLUDES return of own capital (workbook Section 12 note). */
  total: number;
}

export interface DealModelResult {
  stageAssignedFromGate: Stage; // C5
  stageUsed: Stage; // C7 (override or gate)
  projectRate: number; // convenience mirror of finance.projectRate
  finance: FinanceResult;
  baseRate: BaseRateResult;
  market: MarketResult;
  split: SplitResult;
  hurdle: VerdictDetail;
  f2kIncome: F2kIncomeResult;
  partyOutcomes: PartyOutcome[];
}
