/**
 * Cost Governance Checkers (CG-01 through CG-05)
 */

import type { CriterionResult } from "../types";
import { findFiles, grepFiles, hasPattern } from "./static-utils";

export function checkCostGovernance(root: string): CriterionResult[] {
  return [
    checkCG01(root),
    checkCG02(root),
    checkCG03(root),
    checkCG04(root),
    checkCG05(root),
  ];
}

/** CG-01: Per-Session Token Budget */
function checkCG01(root: string): CriterionResult {
  const hasBudget = hasPattern(root, /MAX_SESSION_TOKENS|token.*budget|session.*token.*limit|budget.*cap/i);
  const hasAlert = hasPattern(root, /budget.*alert|threshold.*alert|80%|token.*warning|spend.*warning/i);

  if (hasBudget && hasAlert) {
    return {
      id: "CG-01", dimension: "cost_governance", verdict: "pass",
      severity: "high", title: "Per-Session Token Budget",
      detail: "Token budget and threshold alerting detected",
      remediation: "", effort: "low",
    };
  }

  if (hasBudget) {
    return {
      id: "CG-01", dimension: "cost_governance", verdict: "partial",
      severity: "high", title: "Per-Session Token Budget",
      detail: "Token budget defined but no threshold alerting",
      remediation: "Add alert at 80% of MAX_SESSION_TOKENS threshold.",
      effort: "low",
    };
  }

  return {
    id: "CG-01", dimension: "cost_governance", verdict: "fail",
    severity: "high", title: "Per-Session Token Budget",
    detail: "No per-session token budget enforcement found",
    remediation: "Add MAX_SESSION_TOKENS env var. Alert at 80% threshold.",
    effort: "low",
  };
}

/** CG-02: Model Tier Governance */
function checkCG02(root: string): CriterionResult {
  const hasRoutingTable = hasPattern(root, /ROUTING_TABLE|model.*registry|MODEL_REGISTRY|route.*model/i);
  const hasHaikuUsage = hasPattern(root, /haiku|claude-haiku|gpt-4o-mini/i);
  const hasTierPolicy = hasPattern(root, /permission.*tier|tier.*model|model.*tier|locked.*haiku|standard.*sonnet/i);

  if (hasRoutingTable && hasHaikuUsage) {
    return {
      id: "CG-02", dimension: "cost_governance",
      verdict: hasTierPolicy ? "pass" : "partial",
      severity: "medium", title: "Model Tier Governance",
      detail: hasTierPolicy
        ? "Model routing with tier-appropriate selection detected"
        : "Model routing exists but no explicit tier-to-model policy",
      remediation: hasTierPolicy ? "" : "Add tier-based model restrictions (e.g. locked tier → Haiku only).",
      effort: "low",
    };
  }

  return {
    id: "CG-02", dimension: "cost_governance", verdict: "fail",
    severity: "medium", title: "Model Tier Governance",
    detail: "No model routing or tier governance detected",
    remediation: "Use model routing table. Route lightweight tasks to Haiku.",
    effort: "medium",
  };
}

/** CG-03: Parallel Agent Budget Control */
function checkCG03(root: string): CriterionResult {
  const hasConcurrencyLimit = hasPattern(root, /MAX_AGENTS_CONCURRENT|concurrency.*limit|max.*concurrent|parallel.*limit/i);
  const hasBudgetCap = hasPattern(root, /budget.*cap|cost.*cap|max.*cost|spend.*limit/i);
  const hasParallelAgents = hasPattern(root, /Promise\.all|parallel|concurrent.*agent|multi.*agent/i);

  if (!hasParallelAgents) {
    return {
      id: "CG-03", dimension: "cost_governance", verdict: "pass",
      severity: "medium", title: "Parallel Agent Budget Control",
      detail: "No parallel agent patterns detected — criterion not applicable",
      remediation: "", effort: "low",
    };
  }

  if (hasConcurrencyLimit || hasBudgetCap) {
    return {
      id: "CG-03", dimension: "cost_governance",
      verdict: hasConcurrencyLimit && hasBudgetCap ? "pass" : "partial",
      severity: "medium", title: "Parallel Agent Budget Control",
      detail: `Concurrency limit: ${hasConcurrencyLimit ? "yes" : "no"}, Budget cap: ${hasBudgetCap ? "yes" : "no"}`,
      remediation: "Add MAX_AGENTS_CONCURRENT and per-session cost budget.",
      effort: "low",
    };
  }

  return {
    id: "CG-03", dimension: "cost_governance", verdict: "fail",
    severity: "medium", title: "Parallel Agent Budget Control",
    detail: "Parallel agent patterns found but no concurrency or budget limits",
    remediation: "Add MAX_AGENTS_CONCURRENT. Add per-session cost budget.",
    effort: "medium",
  };
}

/** CG-04: Pre-Flight Cost Estimation */
function checkCG04(root: string): CriterionResult {
  const hasPreFlight = hasPattern(root, /pre.?flight.*cost|cost.*estimat.*before|estimated.*cost.*display|cost.*preview/i);
  const hasPostCost = hasPattern(root, /meterCall|meter.*call|track.*usage|log.*cost|cost.*after/i);

  if (hasPreFlight) {
    return {
      id: "CG-04", dimension: "cost_governance", verdict: "pass",
      severity: "medium", title: "Pre-Flight Cost Estimation",
      detail: "Pre-flight cost estimation detected",
      remediation: "", effort: "low",
    };
  }

  if (hasPostCost) {
    return {
      id: "CG-04", dimension: "cost_governance", verdict: "partial",
      severity: "medium", title: "Pre-Flight Cost Estimation",
      detail: "Cost tracking exists but only post-execution (no pre-flight estimate)",
      remediation: "Add cost estimation step before dispatch. Show estimated cost to user.",
      effort: "medium",
    };
  }

  return {
    id: "CG-04", dimension: "cost_governance", verdict: "fail",
    severity: "medium", title: "Pre-Flight Cost Estimation",
    detail: "No cost visibility at any point",
    remediation: "Add cost estimation step before dispatch.",
    effort: "medium",
  };
}

/** CG-05: Spend Alerting */
function checkCG05(root: string): CriterionResult {
  const hasSpendAlert = hasPattern(root, /spend.*alert|alert.*spend|cost.*threshold|daily.*spend|budget.*exceeded/i);
  const hasDailyTracking = hasPattern(root, /daily.*cost|cost.*daily|daily_cost|cumulative.*spend/i);

  if (hasSpendAlert && hasDailyTracking) {
    return {
      id: "CG-05", dimension: "cost_governance", verdict: "pass",
      severity: "medium", title: "Spend Alerting",
      detail: "Spend alerting with daily tracking detected",
      remediation: "", effort: "low",
    };
  }

  if (hasDailyTracking) {
    return {
      id: "CG-05", dimension: "cost_governance", verdict: "partial",
      severity: "medium", title: "Spend Alerting",
      detail: "Daily cost tracking exists but no alerting configured",
      remediation: "Add spend alerts at configurable daily and per-session thresholds.",
      effort: "low",
    };
  }

  return {
    id: "CG-05", dimension: "cost_governance", verdict: "fail",
    severity: "medium", title: "Spend Alerting",
    detail: "No spend alerting or daily tracking",
    remediation: "Add spend tracking. Alert at configurable thresholds.",
    effort: "low",
  };
}
