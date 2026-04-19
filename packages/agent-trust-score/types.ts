/**
 * Agent Trust Score — Type Definitions
 *
 * 4 dimensions, 23 criteria, weighted grade A–D.
 * Based on Shapira et al. "Agents of Chaos" (arXiv:2602.20021v1)
 */

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

export type Dimension =
  | "agent_safety"
  | "code_security"
  | "cost_governance"
  | "compliance";

export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  agent_safety: 0.4,
  code_security: 0.25,
  cost_governance: 0.2,
  compliance: 0.15,
};

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

export type CriterionId =
  // Agent Safety (AS-01 through AS-09)
  | "AS-01" | "AS-02" | "AS-03" | "AS-04" | "AS-05"
  | "AS-06" | "AS-07" | "AS-08" | "AS-09"
  // Code Security (CS-01 through CS-05)
  | "CS-01" | "CS-02" | "CS-03" | "CS-04" | "CS-05"
  // Cost Governance (CG-01 through CG-05)
  | "CG-01" | "CG-02" | "CG-03" | "CG-04" | "CG-05"
  // Compliance (CO-01 through CO-04)
  | "CO-01" | "CO-02" | "CO-03" | "CO-04";

export type CriterionLayer = "static" | "behavioural" | "both";
export type CriterionVerdict = "pass" | "partial" | "fail";
export type FindingSeverity = "critical" | "high" | "medium" | "low";

export interface CriterionDefinition {
  id: CriterionId;
  dimension: Dimension;
  title: string;
  weight: number;
  layer: CriterionLayer;
  description: string;
  passDescription: string;
  failDescription: string;
  remediation: string;
}

export interface CriterionResult {
  id: CriterionId;
  dimension: Dimension;
  verdict: CriterionVerdict;
  severity: FindingSeverity;
  title: string;
  detail: string;
  remediation: string;
  effort: "low" | "medium" | "high";
  /** File paths and line numbers where issues were found */
  locations?: Array<{ file: string; line?: number; snippet?: string }>;
}

// ---------------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------------

export type Grade = "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D";

export interface DimensionScore {
  dimension: Dimension;
  score: number; // 0–100
  grade: Grade;
  criteria: CriterionResult[];
}

// ---------------------------------------------------------------------------
// Scan Report
// ---------------------------------------------------------------------------

export interface TrustScoreReport {
  project_slug: string;
  scan_date: string;
  overall_grade: Grade;
  overall_score: number;
  dimensions: Record<Dimension, DimensionScore>;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  findings: CriterionResult[];
  badge_url: string;
  report_url: string;
}

// ---------------------------------------------------------------------------
// Scanner Config
// ---------------------------------------------------------------------------

export interface ScanConfig {
  /** Absolute path to the project root to scan */
  projectRoot: string;
  /** Project slug for reporting */
  projectSlug: string;
  /** Project ID (Platform Trust UUID) */
  projectId: string;
  /** Run behavioural probes (Layer 2)? Default: false (static only) */
  runBehavioural?: boolean;
  /** Model call function for behavioural probes */
  modelCallFn?: import("../security-gate/types").ModelCallFn;
  /** Base URL for badge/report links */
  baseUrl?: string;
}
