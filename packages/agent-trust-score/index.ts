// Agent Trust Score — @caistech/agent-trust-score
// "Snyk for agentic AI"

export { scanProject } from "./scanner";
export { calculateGrade } from "./grader";
export { renderBadge, renderExpiredBadge } from "./badge";
export { CRITERIA, getCriteria, getCriterion } from "./criteria";

// Checkers (usable standalone)
export { checkAgentSafety } from "./checkers/agent-safety";
export { checkCodeSecurity } from "./checkers/code-security";
export { checkCostGovernance } from "./checkers/cost-governance";
export { checkCompliance } from "./checkers/compliance";

// Types
export type {
  Dimension,
  CriterionId,
  CriterionDefinition,
  CriterionResult,
  CriterionVerdict,
  CriterionLayer,
  FindingSeverity,
  Grade,
  DimensionScore,
  TrustScoreReport,
  ScanConfig,
} from "./types";
