/**
 * @caistech/deal-model — the canonical Generic Estate Deal Model (F2K), V7.
 *
 * Pure, stateless calculation engine. Turns an ingested feasibility study into a
 * finance-inclusive base price, an entry-stage uplift split, and a
 * GO / ADJUST / REJECT verdict. Single source of truth: DealFindrs computes with
 * it and owns the verdict; F2K-Checkpoint / F2K-Projects read the locked snapshot.
 */
export * from "./types.js";
export { computeDeal, DEFAULT_CONSTANTS, DEFAULT_EXTERNAL_QUOTES } from "./model.js";
export { runCashflow } from "./cashflow.js";
export { assignStage, resolveStage, emptyStageGate } from "./stage-gate.js";
