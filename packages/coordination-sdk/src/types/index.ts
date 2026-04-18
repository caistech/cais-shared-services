// @gbta/coordination — Core Types

export type ParticipantRole =
  | "admin"
  | "internal"
  | "engineer"
  | "certifier"
  | "supplier"
  | "client";

export type IssueCriticality = "high" | "medium" | "low";

export type IssueStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type ActivityType =
  | "created"
  | "status_changed"
  | "reassigned"
  | "commented"
  | "document_uploaded"
  | "document_removed"
  | "due_date_changed"
  | "criticality_changed"
  | "nudge_sent"
  | "email_sent"
  | "magic_link_used"
  | "approved"
  | "rejected";

export type CommentSource = "dashboard" | "magic_link" | "email";

// ---------- Row types ----------

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "active" | "archived";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  project_id: string;
  name: string;
  email: string;
  role: ParticipantRole;
  company: string | null;
  phone: string | null;
  user_id: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Issue {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  criticality: IssueCriticality;
  status: IssueStatus;
  created_by: string;
  responsible_id: string | null;
  next_action: string | null;
  due_date: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IssueComment {
  id: string;
  issue_id: string;
  participant_id: string;
  content: string;
  source: CommentSource;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface IssueActivityLog {
  id: string;
  issue_id: string;
  participant_id: string | null;
  activity_type: ActivityType;
  description: string;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface IssueDocument {
  id: string;
  issue_id: string;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  source: CommentSource;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MagicLink {
  id: string;
  token_hash: string;
  participant_id: string;
  issue_id: string;
  allowed_actions: string[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

// ---------- Enriched types for UI ----------

export interface IssueWithRelations extends Issue {
  creator?: Participant;
  responsible?: Participant;
  comments_count?: number;
  documents_count?: number;
  last_activity_at?: string;
}

export interface IssueDetail extends Issue {
  creator: Participant;
  responsible: Participant | null;
  comments: (IssueComment & { participant: Participant })[];
  activity_log: (IssueActivityLog & { participant: Participant | null })[];
  documents: (IssueDocument & { participant: Participant })[];
  participants: Participant[];
}

export interface DashboardStats {
  total: number;
  high_priority: number;
  overdue: number;
  awaiting_response: number;
}

// ---------- Input types ----------

export interface CreateIssueInput {
  project_id: string;
  title: string;
  description?: string;
  criticality?: IssueCriticality;
  responsible_id?: string;
  next_action?: string;
  due_date?: string;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  criticality?: IssueCriticality;
  status?: IssueStatus;
  responsible_id?: string | null;
  next_action?: string | null;
  due_date?: string | null;
}

// ---------- Valid status transitions ----------

export const VALID_STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  open: ["in_progress", "blocked", "completed", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "completed", "cancelled"],
  completed: ["open"], // reopen
  cancelled: [], // terminal
};
