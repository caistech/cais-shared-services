import { DEFAULT_CONSTANTS } from "./model.js";
import type {
  CashflowInputs,
  CashflowResult,
  CashflowStage,
} from "./types.js";

/**
 * Staged cashflow / funding model (F2K), companion to the deal model (V7).
 *
 * Faithful to `Seafields_Cashflow_Model_V1.xlsx` (sheet "Cashflow"), cell refs in
 * comments. Answers the funder's question — *how much money, when, and when does the
 * funder get out?* — as a per-stage waterfall: drawdowns fund the works, each stage's
 * settlements repay the funder first, surplus spills to clear the retained contributor
 * debt and then uplift.
 *
 * PURE and STATELESS: same inputs -> same outputs, no I/O. Mirrors {@link computeDeal}.
 *
 * ESTATE-AGNOSTIC OVER N STAGES. The workbook is hard-wired to a 6-column S1..S6 grid
 * and only holds at exactly 5 build stages; this engine loops `buildStages` (N) works
 * stages plus one tail settlement stage (N+1 periods total). Settlements lag works by
 * one stage, so lots settle across periods 2..N+1.
 *
 * NO DOUBLE-COUNT: the funder draws only the pay-out fraction (75%) of contributions;
 * the retained fraction (25%) is cleared from settlement surplus, never re-drawn. Total
 * contributions are recovered once here as a TIMING layer — the deal model recovers them
 * in the base separately. The two must be fed the SAME contributions figure.
 */
export function runCashflow(inputs: CashflowInputs): CashflowResult {
  const {
    totalContributions, // C5
    contributorPayoutPct, // C6
    totalWorksToTitle, // C7
    saleableLots, // C8
    buildStages, // C9
    salePricePerLot, // C10
    stageDurationMonths, // C13
  } = inputs;

  // Shared knobs default to the deal model's constants so the two models can't drift.
  const sellingCostPct = inputs.sellingCostPct ?? DEFAULT_CONSTANTS.agentCommissionPct; // C11
  const rate = inputs.interestRate ?? 0.12; // C12 (flat 12%, matches DEFAULT_EXTERNAL_QUOTES)

  const n = buildStages;

  // --- DERIVED (C16:C20) ---
  const payoutAtStart = totalContributions * contributorPayoutPct; // C16
  const retainedContributorDebt = totalContributions * (1 - contributorPayoutPct); // C17
  const worksPerStage = totalWorksToTitle / n; // C18
  const lotsPerStage = saleableLots / n; // C19 (raw division — faithful to the sheet)
  const netRevenuePerLot = salePricePerLot * (1 - sellingCostPct); // C20

  // --- STAGED CASHFLOW (settlements lag works by one stage) ---
  // Periods 1..n draw works; period 1 also draws the pay-out; settlements land in
  // periods 2..n+1. Period n+1 is the tail (no works drawn).
  const periods = n + 1;
  const stages: CashflowStage[] = [];
  let opening = 0; // C25 = 0

  for (let i = 0; i < periods; i++) {
    const isTail = i === periods - 1;
    const label = isTail ? `S${i + 1} (tail)` : `S${i + 1}`;

    // Row 24: lots settle from period 2 onward (settlements lag works by one stage).
    const lotsSettled = i === 0 ? 0 : lotsPerStage;
    // Row 26: contributor pay-out drawn only in period 1.
    const payoutDrawdown = i === 0 ? payoutAtStart : 0;
    // Row 27: works drawn in periods 1..n, nothing in the tail.
    const worksDrawdown = i < n ? worksPerStage : 0;

    // Row 28: interest on the gross drawn balance for the full stage (capitalised —
    // `opening` already carries prior interest). Conservative: ignores mid-stage inflow.
    const interestAccrued =
      (opening + payoutDrawdown + worksDrawdown) * rate * (stageDurationMonths / 12);

    // Row 29: settlements come in net of the agent.
    const netSalesRevenue = lotsSettled * netRevenuePerLot;

    // Gross funder exposure this stage, BEFORE the settlement repayment (C25+C26+C27+C28).
    const grossExposure = opening + payoutDrawdown + worksDrawdown + interestAccrued;

    // Row 30: settlements repay the funder first, floored at zero.
    const repayment = Math.min(netSalesRevenue, grossExposure);
    const closingBalance = grossExposure - repayment;
    // Row 31: surplus is revenue beyond what the funder needed.
    const surplus = netSalesRevenue - repayment;

    stages.push({
      label,
      lotsSettled,
      openingBalance: opening,
      payoutDrawdown,
      worksDrawdown,
      interestAccrued,
      netSalesRevenue,
      grossExposure,
      closingBalance,
      surplus,
    });

    opening = closingBalance; // next stage opens on this stage's closing (C25 = prior C30)
  }

  // --- KEY OUTPUTS (C34:C39) ---
  const peakFunderExposure = Math.max(...stages.map((s) => s.grossExposure)); // C34
  const totalFunderInterest = stages.reduce((a, s) => a + s.interestAccrued, 0); // C35
  const funderBalanceAtFinalStage = stages[stages.length - 1].closingBalance; // C36
  const totalSurplusReleased = stages.reduce((a, s) => a + s.surplus, 0); // C38
  // The split the workbook only LABELS on row 31 — made explicit here.
  const netUpliftAfterRetainedDebt = totalSurplusReleased - retainedContributorDebt;

  // C39: first works-bearing settlement stage (periods 2..n) whose settlements cover that
  // stage's works drawdown; null => only self-funds after works complete (the tail).
  let selfFundingCrossoverStage: number | null = null;
  for (let i = 1; i < n; i++) {
    if (stages[i].netSalesRevenue >= stages[i].worksDrawdown) {
      selfFundingCrossoverStage = i + 1; // 1-based stage number (S2..Sn)
      break;
    }
  }
  const selfFundingCrossover =
    selfFundingCrossoverStage === null
      ? `after works complete (S${periods})`
      : `by S${selfFundingCrossoverStage}`;

  return {
    derived: {
      payoutAtStart,
      retainedContributorDebt,
      worksPerStage,
      lotsPerStage,
      netRevenuePerLot,
      rate,
      sellingCostPct,
    },
    stages,
    peakFunderExposure,
    totalFunderInterest,
    funderBalanceAtFinalStage,
    retainedContributorDebtToClear: retainedContributorDebt, // C37
    totalSurplusReleased,
    netUpliftAfterRetainedDebt,
    selfFundingCrossover,
    selfFundingCrossoverStage,
  };
}
