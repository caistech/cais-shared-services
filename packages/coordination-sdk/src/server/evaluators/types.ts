// Coordination-specific evaluator context and types
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Issue, Participant } from "../../types";

export type CoordNudgeType =
  | "COORD-01"  // Overdue action
  | "COORD-02"  // Stale issue
  | "COORD-03"  // Document pending
  | "COORD-04"  // Deadline approaching
  | "COORD-05"  // Comment awaiting response
  | "COORD-06"; // Blocked cascade

export interface CoordEvaluatorContext {
  projectId: string;
  issues: Issue[];
  participants: Participant[];
  admin: SupabaseClient;
}
