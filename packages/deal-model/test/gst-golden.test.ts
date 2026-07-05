import { describe, it, expect } from "vitest";
import { computeGst, DEFAULT_GST_SCHEME } from "../src/index.js";
import type { GstInputs } from "../src/types.js";

/**
 * GST engine conformance. Numbers are hand-derived from the ATO rules (10% GST = 1/11 of a
 * GST-inclusive amount; Div 75 margin scheme taxes `(sale − land)/11`), so any drift breaks.
 *
 * Sample: $12,000,000 gross realisation, $3,000,000 land, $4,400,000 creditable dev costs.
 */
const SAMPLE: GstInputs = {
  scheme: "margin",
  grossRealisation: 12_000_000,
  landAcquisitionCost: 3_000_000,
  creditableCosts: 4_400_000,
};

describe("computeGst — margin scheme", () => {
  const r = computeGst(SAMPLE);

  it("taxes only the margin: (12M − 3M)/11", () => {
    expect(r.gstOnSales).toBeCloseTo(9_000_000 / 11, 2); // 818,181.82
  });
  it("gives ITCs on creditable costs but NOT on land", () => {
    expect(r.inputTaxCredits).toBeCloseTo(4_400_000 / 11, 2); // 400,000 — land excluded
  });
  it("nets GST payable = GST on sales − ITCs", () => {
    expect(r.netGstPayable).toBeCloseTo(9_000_000 / 11 - 4_400_000 / 11, 2); // 418,181.82
  });
  it("realisation ex-GST = gross − GST on sales", () => {
    expect(r.realisationExGst).toBeCloseTo(12_000_000 - 9_000_000 / 11, 2); // 11,181,818.18
  });
  it("summary reconciles (withGst = gst + preGst on the sales line)", () => {
    const sales = r.summary.find((s) => s.label.startsWith("Gross realisation"))!;
    expect(sales.gst + sales.preGst).toBeCloseTo(sales.withGst, 2);
  });
  it("emits no land ITC line under the margin scheme", () => {
    expect(r.summary.some((s) => s.label === "Land acquisition")).toBe(false);
  });
});

describe("computeGst — standard scheme", () => {
  it("taxes the full sale price: 12M/11", () => {
    const r = computeGst({ ...SAMPLE, scheme: "standard" });
    expect(r.gstOnSales).toBeCloseTo(12_000_000 / 11, 2); // 1,090,909.09
  });
  it("claims a land ITC only when the land was acquired taxably", () => {
    const noCredit = computeGst({ ...SAMPLE, scheme: "standard" });
    const withCredit = computeGst({ ...SAMPLE, scheme: "standard", landIsCreditable: true });
    expect(noCredit.inputTaxCredits).toBeCloseTo(4_400_000 / 11, 2);
    expect(withCredit.inputTaxCredits).toBeCloseTo((4_400_000 + 3_000_000) / 11, 2);
    expect(withCredit.summary.some((s) => s.label === "Land acquisition")).toBe(true);
  });
});

describe("computeGst — edge cases + defaults", () => {
  it("floors margin GST at 0 when land cost exceeds realisation", () => {
    const r = computeGst({ ...SAMPLE, landAcquisitionCost: 15_000_000 });
    expect(r.gstOnSales).toBe(0);
  });
  it("defaults to the margin scheme for subdivision", () => {
    expect(DEFAULT_GST_SCHEME).toBe("margin");
  });
});
