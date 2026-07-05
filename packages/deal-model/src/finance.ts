import type { CashflowResult } from "./types.js";

/**
 * Discounted-cashflow finance primitives (F2K) — IRR + NPV, the outputs the report-generator audit
 * flagged as "advertised but not computed anywhere". Pure/stateless, mirrors {@link computeDeal} /
 * {@link runCashflow} / {@link computeGst}.
 *
 * Convention: a cash-flow vector `flows` is indexed by PERIOD, `flows[0]` = period 0 (usually the
 * initial land outlay, negative). Rates are per-period; use {@link annualToPeriodRate} /
 * {@link periodToAnnualRate} to move between annual and per-period when a period ≠ one year.
 */

/** Net Present Value of a period cash-flow vector at a per-period discount rate. */
export function npv(ratePerPeriod: number, flows: number[]): number {
  return flows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + ratePerPeriod, t), 0);
}

/** Annual rate -> per-period rate, given periods per year (e.g. 12/stageMonths). */
export function annualToPeriodRate(annual: number, periodsPerYear: number): number {
  return Math.pow(1 + annual, 1 / periodsPerYear) - 1;
}

/** Per-period rate -> annualised rate. */
export function periodToAnnualRate(perPeriod: number, periodsPerYear: number): number {
  return Math.pow(1 + perPeriod, periodsPerYear) - 1;
}

/**
 * Internal Rate of Return (per period) of a cash-flow vector, by bisection — robust where
 * Newton-Raphson diverges. Returns `null` when there is no sign change (no real IRR) or the flows
 * don't bracket a root in the search range. `flows` needs at least one negative and one positive.
 */
export function irr(
  flows: number[],
  opts?: { low?: number; high?: number; tol?: number; maxIter?: number },
): number | null {
  if (!flows.some((f) => f < 0) || !flows.some((f) => f > 0)) return null;
  let lo = opts?.low ?? -0.9999; // rate > -100%
  let hi = opts?.high ?? 10; // up to 1000% per period
  const tol = opts?.tol ?? 1e-10; // rate-interval precision (NPV residual scales with flow size)
  const maxIter = opts?.maxIter ?? 200;

  let fLo = npv(lo, flows);
  const fHi = npv(hi, flows);
  if (fLo * fHi > 0) return null; // no sign change in [lo, hi] -> no bracketed root

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < tol || (hi - lo) / 2 < tol) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** DCF metrics derived from a staged funder-cashflow + the land outlay. */
export interface CashflowMetrics {
  /**
   * UNLEVERED project net cash flow per period: `flows[0] = −land`, then per stage
   * `netSalesRevenue − worksDrawdown` (financing/funder mechanics excluded — this is the project's
   * own return, not the funder's).
   */
  netFlows: number[];
  /** IRR per stage-period, or null when not computable. */
  irrPerPeriod: number | null;
  /** Annualised IRR (per stage duration), or null. */
  irrAnnual: number | null;
  /** NPV at the supplied annual discount rate. */
  npvAtDiscount: number;
  /** The annual discount rate used for `npvAtDiscount`. */
  discountRateAnnual: number;
}

/**
 * Build the unlevered project cash-flow from a {@link runCashflow} result + the land outlay, and
 * return its IRR (annualised) + NPV at a discount rate. This is the "IRR + NPV" the feasibility
 * hurdle and the NPV-basis RLV need — computed on the SAME staged cashflow the funder model uses,
 * so the two can't drift.
 */
export function cashflowMetrics(
  result: CashflowResult,
  opts: { landOutlay: number; stageDurationMonths: number; discountRateAnnual: number },
): CashflowMetrics {
  const stageFlows = result.stages.map((s) => s.netSalesRevenue - s.worksDrawdown);
  const netFlows = [-Math.abs(opts.landOutlay), ...stageFlows];

  const periodsPerYear = 12 / opts.stageDurationMonths;
  const perPeriod = irr(netFlows);
  const irrAnnual = perPeriod == null ? null : periodToAnnualRate(perPeriod, periodsPerYear);
  const ratePerPeriod = annualToPeriodRate(opts.discountRateAnnual, periodsPerYear);
  const npvAtDiscount = npv(ratePerPeriod, netFlows);

  return {
    netFlows,
    irrPerPeriod: perPeriod,
    irrAnnual,
    npvAtDiscount,
    discountRateAnnual: opts.discountRateAnnual,
  };
}
