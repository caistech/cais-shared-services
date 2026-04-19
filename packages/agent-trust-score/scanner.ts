/**
 * Trust Score Scanner — Main Entry Point
 *
 * Runs all static checkers against a project, computes grades,
 * and optionally stores results in Supabase.
 *
 * Usage:
 *   const report = await scanProject({
 *     projectRoot: '/path/to/project',
 *     projectSlug: 'mmc-build',
 *     projectId: 'uuid-here',
 *   })
 */

import type { CriterionResult, ScanConfig, TrustScoreReport } from "./types";
import { checkAgentSafety } from "./checkers/agent-safety";
import { checkCodeSecurity } from "./checkers/code-security";
import { checkCostGovernance } from "./checkers/cost-governance";
import { checkCompliance } from "./checkers/compliance";
import { calculateGrade } from "./grader";

/**
 * Run a full trust score scan on a project.
 * Layer 1 (static) always runs. Layer 2 (behavioural) runs if configured.
 */
export async function scanProject(config: ScanConfig): Promise<TrustScoreReport> {
  const results: CriterionResult[] = [];

  // Layer 1: Static Analysis
  results.push(...checkAgentSafety(config.projectRoot));
  results.push(...checkCodeSecurity(config.projectRoot));
  results.push(...checkCostGovernance(config.projectRoot));
  results.push(...checkCompliance(config.projectRoot));

  // Layer 2: Behavioural Probes (if enabled)
  if (config.runBehavioural && config.modelCallFn) {
    // TODO: Wire behavioural probes from red-team runner
    // This maps AS-01 synonym attacks, AS-05 social engineering,
    // AS-06 prompt injection, etc. to the probe runner
    console.log("[trust-score] Behavioural probes not yet wired — using static results only");
  }

  // Calculate grade
  const report = calculateGrade(
    results,
    config.projectSlug,
    config.baseUrl
  );

  return report;
}
