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
import { runBehaviouralProbes } from "./probes";

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
  if (config.runBehavioural) {
    console.log("[trust-score] Running behavioural probes via Kira Testing…");
    const behaviouralResults = await runBehaviouralProbes(
      config.projectSlug,
      config.projectRoot
    );
    results.push(...behaviouralResults);
  }

  // Calculate grade — prefer config.graderUrl (BYOK consumer's own grader
  // host); fall back to legacy config.baseUrl for callers written against
  // pre-0.2.2 of this package.
  const report = calculateGrade(
    results,
    config.projectSlug,
    config.graderUrl ?? config.baseUrl
  );

  return report;
}
