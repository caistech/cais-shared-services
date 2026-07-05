import type { GstInputs, GstResult, GstScheme, GstSummaryLine } from "./types.js";

/**
 * GST engine (F2K) — the margin-scheme / standard-scheme tax layer the report generators
 * were missing. Australian development feasibility + valuation run **GST-inclusive**; the QS
 * cost pack runs **GST-exclusive** — this engine produces the netting both need so a bank
 * doesn't reject a report that ignores or mixes GST.
 *
 * PURE and STATELESS: same inputs -> same outputs, no I/O. Mirrors {@link computeDeal} /
 * {@link runCashflow}. Anchored to the Feastudy "…(Inclusive of GST) − Margin Scheme" reports
 * (Subdivision Devt Demo) + ATO Div 75 margin-scheme rules.
 *
 * The two schemes (see {@link GstScheme}):
 *  - **margin** (DEFAULT for subdivision): GST = `(sale − land) / 11`, floored at 0; NO ITC on land.
 *  - **standard**: GST = `sale / 11`; land ITC only if it was acquired taxably.
 * ITCs on construction/consultant/soft costs are claimable under BOTH schemes.
 *
 * GST is 10%, so the GST component of a GST-inclusive amount is `amount / 11`.
 */

/** The GST divisor for a GST-inclusive amount (10% GST -> 1/11 is the GST component). */
const GST_DIVISOR = 11;

/** Default scheme for englobo/subdivision deals (land bought without a GST credit). */
export const DEFAULT_GST_SCHEME: GstScheme = "margin";

/** GST component of a GST-inclusive amount. */
function gstOf(inclusiveAmount: number): number {
  return inclusiveAmount / GST_DIVISOR;
}

export function computeGst(inputs: GstInputs): GstResult {
  const { scheme, grossRealisation, landAcquisitionCost, creditableCosts } = inputs;

  // Output GST on sales.
  const gstOnSales =
    scheme === "margin"
      ? Math.max(0, gstOf(grossRealisation - landAcquisitionCost)) // Div 75: GST on the margin only
      : gstOf(grossRealisation);

  // Input tax credits: always on creditable dev costs; on land only under the standard scheme
  // when the land itself was acquired taxably (margin-scheme land carries no ITC — the trade-off).
  const landCredit = scheme === "standard" && inputs.landIsCreditable ? gstOf(landAcquisitionCost) : 0;
  const inputTaxCredits = gstOf(creditableCosts) + landCredit;

  const netGstPayable = gstOnSales - inputTaxCredits;
  const realisationExGst = grossRealisation - gstOnSales;

  const summary: GstSummaryLine[] = [
    {
      label: "Gross realisation (sales)",
      withGst: grossRealisation,
      gst: gstOnSales,
      preGst: realisationExGst,
    },
    {
      label: "Creditable development costs",
      withGst: creditableCosts,
      gst: gstOf(creditableCosts),
      preGst: creditableCosts - gstOf(creditableCosts),
    },
    ...(landCredit > 0
      ? [
          {
            label: "Land acquisition",
            withGst: landAcquisitionCost,
            gst: landCredit,
            preGst: landAcquisitionCost - landCredit,
          },
        ]
      : []),
    { label: "Net GST payable to ATO", withGst: netGstPayable, gst: netGstPayable, preGst: 0 },
  ];

  return { scheme, gstOnSales, inputTaxCredits, netGstPayable, realisationExGst, summary };
}
