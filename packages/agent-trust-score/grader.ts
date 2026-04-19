/**
 * Grade Calculator
 *
 * Computes dimension scores, overall grade, and applies
 * critical-finding overrides per the spec.
 */

import { CRITERIA } from "./criteria";
import type {
  CriterionResult,
  Dimension,
  DimensionScore,
  Grade,
  TrustScoreReport,
  DIMENSION_WEIGHTS,
} from "./types";
import { DIMENSION_WEIGHTS as WEIGHTS } from "./types";

// ---------------------------------------------------------------------------
// Grade Thresholds
// ---------------------------------------------------------------------------

function scoreToGrade(score: number): Grade {
  if (score >= 95) return "A";
  if (score >= 90) return "A-";
  if (score >= 85) return "B+";
  if (score >= 80) return "B";
  if (score >= 75) return "B-";
  if (score >= 65) return "C+";
  if (score >= 55) return "C";
  if (score >= 45) return "C-";
  return "D";
}

// ---------------------------------------------------------------------------
// Dimension Scoring
// ---------------------------------------------------------------------------

/** Max points available per dimension (sum of criterion weights) */
const DIMENSION_MAX_POINTS: Record<Dimension, number> = {
  agent_safety: 95, // AS-01(15)+AS-02(15)+AS-03(10)+AS-04(10)+AS-05(5)+AS-06(15)+AS-07(10)+AS-08(10)+AS-09(5)
  code_security: 100,
  cost_governance: 100,
  compliance: 100,
};

function scoreDimension(
  dimension: Dimension,
  results: CriterionResult[]
): DimensionScore {
  const dimensionResults = results.filter((r) => r.dimension === dimension);
  const dimensionCriteria = CRITERIA.filter((c) => c.dimension === dimension);
  const maxPoints = DIMENSION_MAX_POINTS[dimension];

  let earnedPoints = 0;

  for (const criterion of dimensionCriteria) {
    const result = dimensionResults.find((r) => r.id === criterion.id);
    if (!result) continue;

    if (result.verdict === "pass") {
      earnedPoints += criterion.weight;
    } else if (result.verdict === "partial") {
      earnedPoints += criterion.weight * 0.5;
    }
    // fail = 0 points
  }

  const score = Math.round((earnedPoints / maxPoints) * 100);
  const grade = scoreToGrade(score);

  return { dimension, score, grade, criteria: dimensionResults };
}

// ---------------------------------------------------------------------------
// Overall Grade
// ---------------------------------------------------------------------------

export function calculateGrade(
  results: CriterionResult[],
  projectSlug: string,
  baseUrl = "https://platform-trust.vercel.app"
): TrustScoreReport {
  const scanDate = new Date().toISOString();

  // Score each dimension
  const dimensions: Record<Dimension, DimensionScore> = {
    agent_safety: scoreDimension("agent_safety", results),
    code_security: scoreDimension("code_security", results),
    cost_governance: scoreDimension("cost_governance", results),
    compliance: scoreDimension("compliance", results),
  };

  // Weighted overall score
  let overallScore = 0;
  for (const [dim, weight] of Object.entries(WEIGHTS)) {
    overallScore += dimensions[dim as Dimension].score * weight;
  }
  overallScore = Math.round(overallScore);

  // Count findings by severity
  const criticalFindings = results.filter(
    (r) => r.verdict === "fail" && r.severity === "critical"
  ).length;
  const highFindings = results.filter(
    (r) => r.verdict === "fail" && r.severity === "high"
  ).length;
  const mediumFindings = results.filter(
    (r) => r.verdict === "fail" && r.severity === "medium"
  ).length;
  const lowFindings = results.filter(
    (r) => r.verdict === "fail" && r.severity === "low"
  ).length;

  // Apply critical-finding override
  let overallGrade = scoreToGrade(overallScore);

  if (criticalFindings >= 2) {
    // Two or more criticals → capped at D
    if (gradeRank(overallGrade) < gradeRank("D")) {
      overallGrade = "D";
    }
  } else if (criticalFindings >= 1) {
    // One critical → capped at C
    if (gradeRank(overallGrade) < gradeRank("C")) {
      overallGrade = "C";
    }
  }

  // Collect all failing/partial results as findings
  const findings = results.filter(
    (r) => r.verdict === "fail" || r.verdict === "partial"
  );

  return {
    project_slug: projectSlug,
    scan_date: scanDate,
    overall_grade: overallGrade,
    overall_score: overallScore,
    dimensions,
    critical_findings: criticalFindings,
    high_findings: highFindings,
    medium_findings: mediumFindings,
    low_findings: lowFindings,
    findings,
    badge_url: `${baseUrl}/badge/${projectSlug}`,
    report_url: `${baseUrl}/report/${projectSlug}/${scanDate.slice(0, 10)}`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GRADE_RANKS: Record<Grade, number> = {
  A: 0,
  "A-": 1,
  "B+": 2,
  B: 3,
  "B-": 4,
  "C+": 5,
  C: 6,
  "C-": 7,
  D: 8,
};

function gradeRank(grade: Grade): number {
  return GRADE_RANKS[grade] ?? 8;
}
