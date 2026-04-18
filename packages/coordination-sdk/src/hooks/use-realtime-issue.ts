"use client";

import { useEffect, useState, useCallback } from "react";
import { getCoordinationClient } from "../client";
import type {
  Issue,
  IssueComment,
  IssueActivityLog,
  IssueDocument,
  Participant,
} from "../types";

interface IssueDetailState {
  issue: Issue | null;
  comments: (IssueComment & { participant: Participant })[];
  activity_log: (IssueActivityLog & { participant: Participant | null })[];
  documents: (IssueDocument & { participant: Participant })[];
  participants: Participant[];
  loading: boolean;
  error: string | null;
}

export function useRealtimeIssue(issueId: string | null) {
  const [state, setState] = useState<IssueDetailState>({
    issue: null,
    comments: [],
    activity_log: [],
    documents: [],
    participants: [],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    if (!issueId) return;

    try {
      const client = getCoordinationClient();

      const [issueRes, commentsRes, activityRes, docsRes] = await Promise.all([
        client.from("issues").select("*").eq("id", issueId).single(),
        client
          .from("issue_comments")
          .select("*, participant:participants(*)")
          .eq("issue_id", issueId)
          .order("created_at"),
        client
          .from("issue_activity_log")
          .select("*, participant:participants(*)")
          .eq("issue_id", issueId)
          .order("created_at"),
        client
          .from("issue_documents")
          .select("*, participant:participants!uploaded_by(*)")
          .eq("issue_id", issueId)
          .order("created_at", { ascending: false }),
      ]);

      if (issueRes.error) throw issueRes.error;

      // Get participants for this project
      const { data: participants } = await client
        .from("participants")
        .select("*")
        .eq("project_id", issueRes.data.project_id)
        .eq("is_active", true);

      setState({
        issue: issueRes.data as Issue,
        comments: (commentsRes.data ?? []) as never[],
        activity_log: (activityRes.data ?? []) as never[],
        documents: (docsRes.data ?? []) as never[],
        participants: (participants ?? []) as Participant[],
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
  }, [issueId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscriptions for all related tables
  useEffect(() => {
    if (!issueId) return;

    const client = getCoordinationClient();
    const channel = client
      .channel(`coordination-issue-${issueId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "issues",
        filter: `id=eq.${issueId}`,
      }, () => fetchData())
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "issue_comments",
        filter: `issue_id=eq.${issueId}`,
      }, () => fetchData())
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "issue_activity_log",
        filter: `issue_id=eq.${issueId}`,
      }, () => fetchData())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "issue_documents",
        filter: `issue_id=eq.${issueId}`,
      }, () => fetchData())
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [issueId, fetchData]);

  return {
    ...state,
    refresh: fetchData,
  };
}
