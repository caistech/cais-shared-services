/**
 * Red Team Reporter
 *
 * Stores run results in Supabase and generates comparison reports.
 * Sends alerts on regressions or critical failures.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { RedTeamReport, RedTeamRun, ProbeResult } from "./types";

export class RedTeamReporter {
  private supabase: SupabaseClient | null;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase ?? null;
  }

  /** Store a completed run and its results */
  async saveRun(report: RedTeamReport): Promise<void> {
    if (!this.supabase) {
      console.log("[red-team] No Supabase client — skipping persistence");
      console.log(report.summary);
      return;
    }

    try {
      // Save the run
      await this.supabase.from("red_team_runs").insert({
        id: report.run.id,
        project_id: report.run.project_id,
        endpoint_id: report.run.endpoint_id,
        started_at: report.run.started_at,
        completed_at: report.run.completed_at,
        total_probes: report.run.total_probes,
        passed: report.run.passed,
        failed: report.run.failed,
        inconclusive: report.run.inconclusive,
        score: report.run.score,
        regression: report.run.regression,
        summary: report.summary,
        by_category: report.byCategory,
      } as never);

      // Save individual results
      const resultRows = report.run.results.map((r) => ({
        run_id: report.run.id,
        probe_id: r.probe.id,
        probe_name: r.probe.name,
        probe_category: r.probe.category,
        probe_severity: r.probe.severity,
        verdict: r.verdict,
        response_preview: r.response.slice(0, 500),
        failure_matches: r.failureMatches,
        success_matches: r.successMatches,
        latency_ms: r.latencyMs,
        timestamp: r.timestamp,
      }));

      // Insert in batches of 20
      for (let i = 0; i < resultRows.length; i += 20) {
        const batch = resultRows.slice(i, i + 20);
        await this.supabase
          .from("red_team_results")
          .insert(batch as never);
      }
    } catch (err) {
      console.error("[red-team] Failed to save run:", err);
    }
  }

  /** Get the most recent run for an endpoint */
  async getLastRun(endpointId: string): Promise<RedTeamRun | null> {
    if (!this.supabase) return null;

    try {
      const { data } = await this.supabase
        .from("red_team_runs")
        .select("*")
        .eq("endpoint_id", endpointId)
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      if (!data) return null;

      // Load results for this run
      const { data: results } = await this.supabase
        .from("red_team_results")
        .select("*")
        .eq("run_id", data.id);

      return {
        id: data.id,
        project_id: data.project_id,
        endpoint_id: data.endpoint_id,
        started_at: data.started_at,
        completed_at: data.completed_at,
        total_probes: data.total_probes,
        passed: data.passed,
        failed: data.failed,
        inconclusive: data.inconclusive,
        score: data.score,
        regression: data.regression,
        results: (results ?? []).map(
          (r: Record<string, unknown>) =>
            ({
              probe: {
                id: r.probe_id,
                name: r.probe_name,
                category: r.probe_category,
                severity: r.probe_severity,
              },
              verdict: r.verdict,
              response: r.response_preview,
              failureMatches: r.failure_matches,
              successMatches: r.success_matches,
              latencyMs: r.latency_ms,
              timestamp: r.timestamp,
            }) as unknown as ProbeResult
        ),
      };
    } catch {
      return null;
    }
  }

  /** Get score trend for an endpoint (last N runs) */
  async getScoreTrend(
    endpointId: string,
    limit = 10
  ): Promise<Array<{ score: number; date: string; regression: boolean }>> {
    if (!this.supabase) return [];

    try {
      const { data } = await this.supabase
        .from("red_team_runs")
        .select("score, completed_at, regression")
        .eq("endpoint_id", endpointId)
        .order("completed_at", { ascending: false })
        .limit(limit);

      return (data ?? []).map((d: Record<string, unknown>) => ({
        score: d.score as number,
        date: d.completed_at as string,
        regression: d.regression as boolean,
      }));
    } catch {
      return [];
    }
  }
}
