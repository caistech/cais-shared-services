import { describe, it, expect } from "vitest";
import { computeDeal, assignStage } from "../src/index.js";
import { emptyStageGate } from "../src/stage-gate.js";
import type { DealModelInputs } from "../src/types.js";

/**
 * Golden conformance test — reproduces the V5 workbook sample exactly
 * (Generic_Estate_Deal_Model_V5.xlsx). Cached workbook values are the source of
 * truth; any drift in the engine breaks this test. Cell refs in comments.
 *
 * Sample: 100 lots, $170k comps, Conception, Internal funding, Contractor,
 * 100% home-capture -> base ≈ $136,991.23/lot, net uplift ≈ 21.61%, ADJUST.
 */
const V5_SAMPLE: DealModelInputs = {
  lots: 100, // C37
  marketPricePerLot: 170_000, // C38
  fundingMode: "Internal", // C40
  homeCaptureRate: 1, // C41
  civilMode: "Contractor", // C42
  externalQuotes: [0.08, 0.09, 0.12], // C45:C47
  landPerLot: 20_000, // C54
  developerSunkCostTotal: 300_000, // D55
  infraPerLot: 80_000, // C56
  softCostsPerLot: 6_000, // C59
  educationPerLot: 4_000, // C60
  f2kContributionTotal: 0, // C61
  modularMarginPerHome: 30_000, // C120
  stageGate: emptyStageGate(), // all FALSE -> Conception
};

describe("V5 golden sample", () => {
  const r = computeDeal(V5_SAMPLE);

  it("assigns Conception from an empty gate", () => {
    expect(r.stageAssignedFromGate).toBe("Conception");
    expect(r.stageUsed).toBe("Conception");
  });

  it("derives the finance rates (C48/C50/C51)", () => {
    expect(r.finance.externalAverage).toBeCloseTo(0.0966667, 6);
    expect(r.finance.internalRate).toBeCloseTo(0.0766667, 6);
    expect(r.finance.projectRate).toBeCloseTo(0.0766667, 6);
  });

  it("computes finance cost by tranche (G66/G67/G68/G70/G71)", () => {
    expect(r.finance.tranches.land).toBeCloseTo(383_333.333, 2);
    expect(r.finance.tranches.infra).toBeCloseTo(613_333.333, 2);
    expect(r.finance.tranches.sunk).toBeCloseTo(57_500, 2);
    expect(r.finance.tranches.f2k).toBeCloseTo(0, 6);
    expect(r.finance.baseFinanceTotal).toBeCloseTo(1_054_166.667, 2);
    expect(r.finance.baseFinancePerLot).toBeCloseTo(10_541.667, 2);
  });

  it("builds the finance-inclusive base rate (C82/C85)", () => {
    expect(r.baseRate.subtotalPerLot).toBeCloseTo(130_141.667, 2);
    expect(r.baseRate.baseRatePerLot).toBeCloseTo(136_991.228, 2);
  });

  it("runs the market test (C90/C92/C93)", () => {
    expect(r.market.grossUpliftPerLot).toBeCloseTo(33_008.772, 2);
    expect(r.market.agentCommissionPerLot).toBeCloseTo(3_400, 2);
    expect(r.market.netUpliftPerLot).toBeCloseTo(29_608.772, 2);
    expect(r.market.netUpliftPctOfBase).toBeCloseTo(0.2161363, 6);
  });

  it("splits the uplift 60/40 at Conception (C106/C108/C109)", () => {
    expect(r.split.f2kShare).toBeCloseTo(0.6, 6);
    expect(r.split.developerShare).toBeCloseTo(0.4, 6);
    expect(r.split.civilJvSharePerLot).toBe(0); // Contractor mode
    expect(r.split.f2kUpliftTotal).toBeCloseTo(1_776_526.316, 2);
    expect(r.split.developerUpliftTotal).toBeCloseTo(1_184_350.877, 2);
  });

  it("returns ADJUST with the developer above floor (C115/C116)", () => {
    expect(r.hurdle.developerPostSplitPctOfBase).toBeCloseTo(0.0864545, 6);
    expect(r.hurdle.verdict).toBe("ADJUST");
    expect(r.hurdle.developerThin).toBe(false);
    expect(r.hurdle.reason).toBe("Proceeds but tighten");
  });

  it("computes F2K income land-only vs land+homes (C125/C127)", () => {
    expect(r.f2kIncome.pmFeeTotal).toBeCloseTo(684_956.14, 2);
    expect(r.f2kIncome.landOnlyReturn).toBeCloseTo(2_461_482.456, 2);
    expect(r.f2kIncome.modularMarginTotal).toBeCloseTo(3_000_000, 2);
    expect(r.f2kIncome.landPlusHomesReturn).toBeCloseTo(5_461_482.456, 2);
  });

  it("computes the party-outcomes waterfall (Section 12)", () => {
    const by = (p: string) => r.partyOutcomes.find((o) => o.party.startsWith(p))!;
    // Developer carries the infra works finance in Contractor mode (resolved D131):
    // land+sunk uplift 1,625,184.21 + infra finance carry 613,333.33 = 2,238,517.54.
    expect(by("Developer").financeOrCarry).toBeCloseTo(1_054_166.667, 2); // = base finance total
    expect(by("Developer").total).toBeCloseTo(2_238_517.544, 2); // G131 (resolved)
    expect(by("Civil").total).toBeCloseTo(960_000, 2); // G134
    expect(by("Agents").total).toBeCloseTo(340_000, 2); // G135
    expect(by("Introducer").total).toBeCloseTo(20_000, 2); // G136
  });

  it("reconciles: base finance charged = developer carry (Contractor mode)", () => {
    // the infra carry is no longer orphaned — everything charged into the base is
    // credited to a party (developer land+infra+sunk; F2K contribution tranche).
    const by = (p: string) => r.partyOutcomes.find((o) => o.party.startsWith(p))!;
    const f2kCarry = by("Factory2Key (land-only)").financeOrCarry;
    expect(by("Developer").financeOrCarry + f2kCarry).toBeCloseTo(
      r.finance.baseFinanceTotal,
      2,
    );
  });
});

describe("stage gate (C5 formula)", () => {
  it("assigns Part-developed on DA-lodged + structure-plan + civil-feasibility", () => {
    const g = emptyStageGate();
    g.subdivisionApplicationLodged = true; // E15
    g.structurePlanPrepared = true; // E13
    g.civilFeasibility = true; // E24
    expect(assignStage(g)).toBe("Part-developed");
  });

  it("assigns De-risked on approval + conditions-cleared + civil evidence", () => {
    const g = emptyStageGate();
    g.subdivisionApprovalGranted = true; // E17
    g.conditionsSubstantiallyCleared = true; // E19
    g.detailedCivilDesign = true; // E26
    expect(assignStage(g)).toBe("De-risked");
  });

  it("stays Conception when the load-bearing gates are not met", () => {
    const g = emptyStageGate();
    g.developmentConcept = true; // not load-bearing
    g.geotech = true; // not load-bearing
    expect(assignStage(g)).toBe("Conception");
  });

  it("De-risked takes precedence over Part-developed", () => {
    const g = emptyStageGate();
    // satisfies both branches; De-risked must win
    g.subdivisionApplicationLodged = true;
    g.structurePlanPrepared = true;
    g.civilFeasibility = true;
    g.subdivisionApprovalGranted = true;
    g.conditionsSubstantiallyCleared = true;
    expect(assignStage(g)).toBe("De-risked");
  });
});

describe("verdict branches", () => {
  it("REJECTs when net uplift is below the reject floor", () => {
    // crush the market price so uplift collapses
    const r = computeDeal({ ...V5_SAMPLE, marketPricePerLot: 150_000 });
    expect(r.hurdle.verdict).toBe("REJECT");
    expect(r.hurdle.developerThin).toBe(false);
  });

  it("GOes when uplift clears the clean-GO threshold", () => {
    const r = computeDeal({ ...V5_SAMPLE, marketPricePerLot: 200_000 });
    expect(r.hurdle.verdict).toBe("GO");
    expect(r.hurdle.reason).toBe("Clears with room");
  });

  it("Civil-JV takes the finance cost off-the-top before the split", () => {
    const contractor = computeDeal(V5_SAMPLE);
    const jv = computeDeal({ ...V5_SAMPLE, civilMode: "Civil-JV" });
    // Civil-JV removes infra finance from the base -> lower base rate...
    expect(jv.baseRate.baseRatePerLot).toBeLessThan(
      contractor.baseRate.baseRatePerLot,
    );
    // ...but takes an off-the-top share, so uplift-to-split shrinks vs raw net uplift
    expect(jv.split.civilJvSharePerLot).toBeGreaterThan(0);
    expect(jv.split.upliftToSplitPerLot).toBeLessThan(jv.market.netUpliftPerLot);
  });
});
