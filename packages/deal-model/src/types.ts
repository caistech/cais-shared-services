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

// ---- Staged cashflow model (companion; Seafields_Cashflow_Model_V1.xlsx) ----------

/**
 * The staged cashflow inputs (workbook yellow "INPUTS", C5:C13). Answers the funder's
 * question — how much money, when, and when does the funder get out. `sellingCostPct`
 * and `interestRate` are OPTIONAL: they default to the deal model's shared knobs
 * (`DEFAULT_CONSTANTS.agentCommissionPct` and flat 12%) so the two models cannot drift.
 *
 * CONTRIBUTIONS CONTRACT: `totalContributions` is the WHOLE contribution pool (founders +
 * F2K, cash + kind) — deliberately BROADER than the deal model's `f2kContributionTotal`
 * (F2K's slice). Feed both from the same contribution schedule; this layer only re-times
 * the pool (75% now / 25% from surplus), it does not re-recover it against the base.
 */
export interface CashflowInputs {
  totalContributions: number; // C5
  /** Contributor pay-out in the first tranche, 0..1 (C6). Retained = 1 - this. */
  contributorPayoutPct: number; // C6
  totalWorksToTitle: number; // C7 (civil + eng + soft + education)
  saleableLots: number; // C8
  buildStages: number; // C9 (N — the sheet's fixed grid holds only at N=5)
  salePricePerLot: number; // C10
  /** Selling/agent cost, % of sale price (C11). Default: DEFAULT_CONSTANTS.agentCommissionPct. */
  sellingCostPct?: number; // C11
  /** All-in interest rate (C12). Default: 0.12 (matches DEFAULT_EXTERNAL_QUOTES). */
  interestRate?: number; // C12
  stageDurationMonths: number; // C13
}

/** One stage (period) of the cashflow waterfall. Rows 24:31, one column each. */
export interface CashflowStage {
  /** "S1".."S{N}", tail as "S{N+1} (tail)". */
  label: string;
  lotsSettled: number; // row 24
  openingBalance: number; // row 25 (= prior closing)
  payoutDrawdown: number; // row 26 (pay-out, period 1 only)
  worksDrawdown: number; // row 27 (works, periods 1..N)
  interestAccrued: number; // row 28
  netSalesRevenue: number; // row 29 (lots settled x net rev/lot)
  /** Gross funder exposure this stage, BEFORE settlement repayment (C25+C26+C27+C28). */
  grossExposure: number;
  closingBalance: number; // row 30 (funder balance after repayment, floored at 0)
  surplus: number; // row 31 (revenue beyond funder need -> retained debt then uplift)
}

export interface CashflowResult {
  /** Derived block, workbook C16:C20 (+ the resolved shared knobs). */
  derived: {
    payoutAtStart: number; // C16
    retainedContributorDebt: number; // C17
    worksPerStage: number; // C18
    lotsPerStage: number; // C19
    netRevenuePerLot: number; // C20
    rate: number; // resolved C12
    sellingCostPct: number; // resolved C11
  };
  stages: CashflowStage[];
  peakFunderExposure: number; // C34
  totalFunderInterest: number; // C35
  funderBalanceAtFinalStage: number; // C36
  retainedContributorDebtToClear: number; // C37
  totalSurplusReleased: number; // C38 (gross — retained debt + uplift)
  /** C38 - C37: the retained-debt-first / uplift split the sheet only LABELS on row 31. */
  netUpliftAfterRetainedDebt: number;
  selfFundingCrossover: string; // C39 label ("by S2" | "after works complete (S6)")
  /** 1-based stage number of the crossover, or null when it only self-funds post-works. */
  selfFundingCrossoverStage: number | null;
}

// ---- GST engine (feasibility + valuation are GST-inclusive; QS is GST-exclusive) ----

/**
 * How GST on the sale is calculated.
 *  - `"margin"` (the DEFAULT for englobo/subdivision): land was bought without a GST credit,
 *    so GST is charged only on the developer's MARGIN — `(sale − land) / 11`, and NO input
 *    tax credit is available on the land. This is the Feastudy "Margin Scheme" treatment.
 *  - `"standard"`: GST is `sale / 11` on the full price, and land carries an ITC if it was
 *    acquired taxably (`landIsCreditable`). This is the AEC study's treatment.
 */
export type GstScheme = "margin" | "standard";

/**
 * GST inputs. All money figures are **GST-INCLUSIVE** amounts (the $ actually paid/received),
 * because GST on a GST-inclusive amount is `amount / 11` (10% GST). Report GST is derived from
 * these; a report that mixes GST-inclusive and GST-exclusive figures is a defect (the QS pack
 * must state its GST-exclusive basis — see PRODUCT_STANDARDS report checklist).
 */
export interface GstInputs {
  scheme: GstScheme;
  /** Total GST-inclusive gross realisation (all lot sales). */
  grossRealisation: number;
  /** GST-inclusive land acquisition cost — the margin-scheme "purchase price" the margin is measured from. */
  landAcquisitionCost: number;
  /**
   * GST-inclusive development costs that carry claimable GST (construction, civil, consultants,
   * soft costs) — i.e. taxable acquisitions. EXCLUDES land (handled by `scheme`), borrowing
   * interest, wages, and other GST-free / input-taxed items.
   */
  creditableCosts: number;
  /** STANDARD scheme only: was the land bought taxably (so its GST is claimable)? Default false. */
  landIsCreditable?: boolean;
}

/** One line of the with-GST / GST / pre-GST reconciliation (the Feastudy GST Summary Report shape). */
export interface GstSummaryLine {
  label: string;
  withGst: number;
  gst: number;
  preGst: number;
}

export interface GstResult {
  scheme: GstScheme;
  /** GST payable on sales (output tax). Margin: `(realisation − land)/11` floored at 0; standard: `realisation/11`. */
  gstOnSales: number;
  /** Input tax credits reclaimed on creditable costs (+ land under the standard scheme when creditable). */
  inputTaxCredits: number;
  /** Net GST remitted to the ATO = `gstOnSales − inputTaxCredits` (negative = net refund). */
  netGstPayable: number;
  /** Gross realisation less GST on sales — the ex-GST revenue that flows to the P&L. */
  realisationExGst: number;
  /** Three-column reconciliation (with-GST / GST / pre-GST) per the Feastudy GST Summary Report. */
  summary: GstSummaryLine[];
}
