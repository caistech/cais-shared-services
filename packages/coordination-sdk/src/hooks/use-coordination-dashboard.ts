"use client";

import { useEffect, useState, useCallback } from "react";
import { getCoordinationClient } from "../client";
import type { Issue, IssueStatus, DashboardStats } from "../types";

interface DashboardState {
  issues: Issue[];
  stats: DashboardStats;
  loading: boolean;
  error: string | null;
}

export function useCoordinationDashboard(projectId?: string) {
  const [state, setState] = useState<DashboardState>({
    issues: [],
    stats: { total: 0, high_priority: 0, overdue: 0, awaiting_response: 0 },
    loading: true,
    error: null,
  });
  const [statusFilter, setStatusFilter] = useState<IssueStatus[] | undefined>();

  const fetchData = useCallback(async () => {
    try {
      const client = getCoordinationClient();
      let query = client
        .from("issues")
        .select("*")
        .order("created_at", { ascending: false });

      if (projectId) query = query.eq("project_id", projectId);
      if (statusFilter && statusFilter.length > 0)
        query = query.in("status", statusFilter);

      const { data: issues, error } = await query;
      if (error) throw error;

      const allIssues = (issues ?? []) as Issue[];
      const now = new Date().toISOString().split("T")[0];
      const active = allIssues.filter(
        (i) => i.status !== "completed" && i.status !== "cancelled"
      );

      setState({
        issues: allIssues,
        stats: {
          total: active.length,
          high_priority: active.filter((i) => i.criticality === "high").length,
          overdue: active.filter((i) => i.due_date && i.due_date < now).length,
          awaiting_response: active.filter((i) => i.responsible_id !== null)
            .length,
        },
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [projectId, statusFilter]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const client = getCoordinationClient();

    const channel = client
      .channel(`coordination-dashboard-${projectId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issues",
          ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}),
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [projectId, fetchData]);

  return {
    ...state,
    statusFilter,
    setStatusFilter,
    refresh: fetchData,
  };
}
