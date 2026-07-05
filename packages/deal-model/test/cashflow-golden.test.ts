import { describe, it, expect } from "vitest";
import { runCashflow } from "../src/index.js";
import type { CashflowInputs } from "../src/types.js";

/**
 * Golden conformance test — reproduces the Seafields cashflow workbook exactly
 * (Seafields_Cashflow_Model_V1.xlsx, sheet "Cashflow"). Cached workbook values are the
 * source of truth; any drift in the engine breaks this test. Cell refs in comments.
 *
 * Sample: $3.5M contributions (75% pay-out), $14M works, 145 lots, 5 build stages,
 * $155k/lot, 3.5% agent, flat 12%, 9-month stages
 *  -> peak funder exposure $9,497,442.50, funder interest $3,415,250.29,
 *     surplus released $1,648,124.71, self-funding crossover "by S2".
 */
const SEAFIELDS_CASHFLOW: CashflowInputs = {
  totalContributions: 3_500_000, // C5
  contributorPayoutPct: 0.75, // C6
  totalWorksToTitle: 14_000_000, // C7
  saleableLots: 145, // C8
  buildStages: 5, // C9
  salePricePerLot: 155_000, // C10
  sellingCostPct: 0.035, // C11 (== the deal-model default)
  interestRate: 0.12, // C12 (== the flat-12% default)
  stageDurationMonths: 9, // C13
};

describe("Seafields cashflow golden sample", () => {
  const r = runCashflow(SEAFIELDS_CASHFLOW);

  it("computes the derived block (C16:C20)", () => {
    expect(r.derived.payoutAtStart).toBeCloseTo(2_625_000, 2); // C16
    expect(r.derived.retainedContributorDebt).toBeCloseTo(875_000, 2); // C17
    expect(r.derived.worksPerStage).toBeCloseTo(2_800_000, 2); // C18
    expect(r.derived.lotsPerStage).toBeCloseTo(29, 6); // C19
    expect(r.derived.netRevenuePerLot).toBeCloseTo(149_575, 2); // C20
  });

  it("produces N+1 stages (5 works stages + tail) with the right settlement lag", () => {
    expect(r.stages).toHaveLength(6);
    expect(r.stages.map((s) => s.label)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6 (tail)",
    ]);
    // Row 24: S1 settles nothing; S2..S6 each settle a stage's worth.
    expect(r.stages[0].lotsSettled).toBe(0);
    expect(r.stages.slice(1).every((s) => s.lotsSettled === 29)).toBe(true);
    // Works drawn S1..S5 only; nothing in the tail.
    expect(r.stages[4].worksDrawdown).toBeCloseTo(2_800_000, 2);
    expect(r.stages[5].worksDrawdown).toBe(0);
  });

  it("reproduces per-stage interest accrued (row 28)", () => {
    const interest = r.stages.map((s) => s.interestAccrued);
    expect(interest[0]).toBeCloseTo(488_250, 2); // C28
    expect(interest[1]).toBeCloseTo(784_192.5, 2); // D28
    expect(interest[2]).toBeCloseTo(716_379.075, 2); // E28
    expect(interest[3]).toBeCloseTo(642_462.44175, 4); // F28
    expect(interest[4]).toBeCloseTo(561_893.3115075, 4); // G28
    expect(interest[5]).toBeCloseTo(222_072.959543175, 4); // H28
  });

  it("reproduces per-stage closing funder balance (row 30)", () => {
    const closing = r.stages.map((s) => s.closingBalance);
    expect(closing[0]).toBeCloseTo(5_913_250, 2); // C30
    expect(closing[1]).toBeCloseTo(5_159_767.5, 2); // D30
    expect(closing[2]).toBeCloseTo(4_338_471.575, 2); // E30
    expect(closing[3]).toBeCloseTo(3_443_259.01675, 4); // F30
    expect(closing[4]).toBeCloseTo(2_467_477.3282575, 4); // G30
    expect(closing[5]).toBeCloseTo(0, 2); // H30 — funder fully repaid by the tail
  });

  it("spills surplus only in the tail (row 31)", () => {
    // S1..S5 fully absorbed by the funder; the surplus lands in the S6 tail.
    expect(r.stages.slice(0, 5).every((s) => s.surplus === 0)).toBe(true);
    expect(r.stages[5].surplus).toBeCloseTo(1_648_124.71219933, 4); // H31
  });

  it("reproduces the KEY OUTPUTS (C34:C39)", () => {
    expect(r.peakFunderExposure).toBeCloseTo(9_497_442.5, 2); // C34
    expect(r.totalFunderInterest).toBeCloseTo(3_415_250.28780068, 4); // C35
    expect(r.funderBalanceAtFinalStage).toBeCloseTo(0, 2); // C36
    expect(r.retainedContributorDebtToClear).toBeCloseTo(875_000, 2); // C37
    expect(r.totalSurplusReleased).toBeCloseTo(1_648_124.71219933, 4); // C38
    expect(r.selfFundingCrossover).toBe("by S2"); // C39
    expect(r.selfFundingCrossoverStage).toBe(2);
  });

  it("makes explicit the retained-debt-first split the sheet only labels (C38 - C37)", () => {
    // Uplift after the retained contributor debt is cleared from surplus.
    expect(r.netUpliftAfterRetainedDebt).toBeCloseTo(773_124.71219933, 4);
  });

  it("does not double-count contributions: funder draws only the 75% pay-out", () => {
    const totalPayoutDrawn = r.stages.reduce((a, s) => a + s.payoutDrawdown, 0);
    expect(totalPayoutDrawn).toBeCloseTo(2_625_000, 2); // never the full 3.5M
    // The 25% retained is recovered from surplus, not re-drawn from the funder.
    expect(r.derived.retainedContributorDebt).toBeCloseTo(875_000, 2);
  });
});

describe("estate-agnostic behaviour (what the fixed Excel grid can't do)", () => {
  it("varies the stage count instead of a hard-wired 6-column grid", () => {
    const four = runCashflow({ ...SEAFIELDS_CASHFLOW, buildStages: 4 });
    // 4 works stages + 1 tail = 5 periods; lots split 4 ways.
    expect(four.stages).toHaveLength(5);
    expect(four.derived.lotsPerStage).toBeCloseTo(145 / 4, 6);
    expect(four.derived.worksPerStage).toBeCloseTo(14_000_000 / 4, 2);
    // Total lots still settle across the settlement periods.
    const settled = four.stages.reduce((a, s) => a + s.lotsSettled, 0);
    expect(settled).toBeCloseTo(145, 6);
  });

  it("defaults the shared knobs to the deal-model constants when omitted", () => {
    const { sellingCostPct: _s, interestRate: _i, ...bare } = SEAFIELDS_CASHFLOW;
    const r = runCashflow(bare);
    expect(r.derived.sellingCostPct).toBeCloseTo(0.035, 6); // DEFAULT_CONSTANTS agent %
    expect(r.derived.rate).toBeCloseTo(0.12, 6); // flat-12% default
    // Same numbers as the pinned fixture, proving the defaults match.
    expect(r.peakFunderExposure).toBeCloseTo(9_497_442.5, 2);
  });

  it("flags an estate that only self-funds after works complete", () => {
    // Crush the sale price so no stage's settlements cover its works drawdown.
    const r = runCashflow({ ...SEAFIELDS_CASHFLOW, salePricePerLot: 50_000 });
    expect(r.selfFundingCrossoverStage).toBeNull();
    expect(r.selfFundingCrossover).toBe("after works complete (S6)");
  });
});
