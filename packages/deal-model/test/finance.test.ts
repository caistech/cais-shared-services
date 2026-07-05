import { describe, it, expect } from "vitest";
import {
  npv,
  irr,
  annualToPeriodRate,
  periodToAnnualRate,
  cashflowMetrics,
  runCashflow,
} from "../src/index.js";
import type { CashflowInputs } from "../src/types.js";

/**
 * Finance-primitive conformance. IRR/NPV values are hand-derived closed-form so any drift breaks.
 */

describe("npv", () => {
  it("at rate 0 is the plain sum of flows", () => {
    expect(npv(0, [-1000, 500, 660])).toBeCloseTo(160, 6);
  });
  it("discounts future flows", () => {
    // -1000 + 500/1.1 + 660/1.21 = 0
    expect(npv(0.1, [-1000, 500, 660])).toBeCloseTo(0, 6);
  });
});

describe("irr", () => {
  it("solves a one-period return: [-1000, 1210] -> 21%", () => {
    expect(irr([-1000, 1210])!).toBeCloseTo(0.21, 6);
  });
  it("solves a two-period return: [-1000, 500, 660] -> 10%", () => {
    expect(irr([-1000, 500, 660])!).toBeCloseTo(0.1, 6);
  });
  it("returns null when there is no sign change", () => {
    expect(irr([100, 200, 300])).toBeNull();
    expect(irr([-100, -200])).toBeNull();
  });
  it("its rate zeroes the NPV (residual tiny vs flow scale)", () => {
    const flows = [-5000, 1200, 1500, 1800, 2100];
    const r = irr(flows)!;
    expect(Math.abs(npv(r, flows))).toBeLessThan(0.01);
  });
});

describe("rate conversion", () => {
  it("round-trips annual <-> per-period", () => {
    const annual = 0.12;
    const perQuarter = annualToPeriodRate(annual, 4);
    expect(periodToAnnualRate(perQuarter, 4)).toBeCloseTo(annual, 9);
  });
  it("a monthly rate compounds to the annual", () => {
    const perMonth = annualToPeriodRate(0.12, 12);
    expect(Math.pow(1 + perMonth, 12) - 1).toBeCloseTo(0.12, 9);
  });
});

describe("cashflowMetrics — over a runCashflow result", () => {
  const inputs: CashflowInputs = {
    totalContributions: 3_500_000,
    contributorPayoutPct: 0.75,
    totalWorksToTitle: 14_000_000,
    saleableLots: 145,
    buildStages: 5,
    salePricePerLot: 155_000,
    sellingCostPct: 0.035,
    interestRate: 0.12,
    stageDurationMonths: 9,
  };
  const cf = runCashflow(inputs);
  const m = cashflowMetrics(cf, { landOutlay: 5_000_000, stageDurationMonths: 9, discountRateAnnual: 0.12 });

  it("puts the land outlay at period 0 (negative)", () => {
    expect(m.netFlows[0]).toBe(-5_000_000);
    expect(m.netFlows.length).toBe(cf.stages.length + 1);
  });
  it("computes an annualised IRR and an NPV at the discount rate", () => {
    expect(m.irrAnnual).not.toBeNull();
    expect(Number.isFinite(m.irrAnnual as number)).toBe(true);
    expect(Number.isFinite(m.npvAtDiscount)).toBe(true);
  });
  it("NPV at the project's own IRR is ~0 (residual tiny vs the multi-million flows)", () => {
    if (m.irrPerPeriod != null) {
      // residual scales with flow magnitude; assert it's a negligible fraction of the land outlay
      expect(Math.abs(npv(m.irrPerPeriod, m.netFlows))).toBeLessThan(Math.abs(m.netFlows[0]) * 1e-4);
    }
  });
});
