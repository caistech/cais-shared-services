// @gbta/coordination — Server-side actions (run in consuming project's Next.js runtime)
// All mutations go through service role client

import { getCoordinationServiceClient } from "../client";
import type {
  Issue,
  IssueComment,
  IssueDocument,
  Participant,
  Project,
  CreateIssueInput,
  UpdateIssueInput,
  IssueStatus,
  VALID_STATUS_TRANSITIONS,
} from "../types";
import { VALID_STATUS_TRANSITIONS as transitions } from "../types";

const db = () => getCoordinationServiceClient();

// ---------- Projects ----------

export async function createProject(data: {
  name: string;
  slug: string;
  description?: string;
}): Promise<Project> {
  const { data: project, error } = await db()
    .from("projects")
    .insert(data as never)
    .select()
    .single();
  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return project as Project;
}

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await db()
    .from("projects")
    .select("*")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return (data ?? []) as Project[];
}

// ---------- Participants ----------

export async function addParticipant(data: {
  project_id: string;
  name: string;
  email: string;
  role: string;
  company?: string;
  phone?: string;
  user_id?: string;
}): Promise<Participant> {
  const { data: participant, error } = await db()
    .from("participants")
    .insert(data as never)
    .select()
    .single();
  if (error) throw new Error(`Failed to add participant: ${error.message}`);
  return participant as Participant;
}

export async function getProjectParticipants(
  projectId: string
): Promise<Participant[]> {
  const { data, error } = await db()
    .from("participants")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("role")
    .order("name");
  if (error) throw new Error(`Failed to fetch participants: ${error.message}`);
  return (data ?? []) as Participant[];
}

// ---------- Issues ----------

export async function createIssue(
  input: CreateIssueInput,
  createdById: string
): Promise<Issue> {
  const { data: issue, error } = await db()
    .from("issues")
    .insert({
      ...input,
      created_by: createdById,
    } as never)
    .select()
    .single();
  if (error) throw new Error(`Failed to create issue: ${error.message}`);

  // Log activity
  await logActivity(issue.id, createdById, "created", `Issue created: ${input.title}`);

  return issue as Issue;
}

export async function updateIssue(
  issueId: string,
  changes: UpdateIssueInput,
  updatedById: string
): Promise<Issue> {
  // Fetch current issue for transition validation and activity logging
  const { data: current, error: fetchError } = await db()
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .single();
  if (fetchError || !current)
    throw new Error(`Issue not found: ${fetchError?.message}`);

  // Validate status transition
  if (changes.status && changes.status !== current.status) {
    const allowed = transitions[current.status as IssueStatus];
    if (!allowed.includes(changes.status)) {
      throw new Error(
        `Invalid status transition: ${current.status} → ${changes.status}. ` +
          `Allowed: ${allowed.join(", ")}`
      );
    }
    // Set resolved_at when completing
    if (changes.status === "completed") {
      (changes as Record<string, unknown>).resolved_at = new Date().toISOString();
    }
    // Clear resolved_at when reopening
    if (changes.status === "open" && current.status === "completed") {
      (changes as Record<string, unknown>).resolved_at = null;
    }
  }

  const { data: updated, error } = await db()
    .from("issues")
    .update(changes as never)
    .eq("id", issueId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update issue: ${error.message}`);

  // Log activities for each changed field
  if (changes.status && changes.status !== current.status) {
    await logActivity(
      issueId, updatedById, "status_changed",
      `Status changed from ${current.status} to ${changes.status}`,
      current.status, changes.status
    );
  }
  if (changes.responsible_id !== undefined && changes.responsible_id !== current.responsible_id) {
    const newResponsible = changes.responsible_id
      ? await getParticipantName(changes.responsible_id)
      : "unassigned";
    await logActivity(
      issueId, updatedById, "reassigned",
      `Reassigned to ${newResponsible}`,
      current.responsible_id, changes.responsible_id ?? undefined
    );
  }
  if (changes.due_date !== undefined && changes.due_date !== current.due_date) {
    await logActivity(
      issueId, updatedById, "due_date_changed",
      `Due date changed to ${changes.due_date ?? "removed"}`,
      current.due_date, changes.due_date ?? undefined
    );
  }
  if (changes.criticality && changes.criticality !== current.criticality) {
    await logActivity(
      issueId, updatedById, "criticality_changed",
      `Criticality changed from ${current.criticality} to ${changes.criticality}`,
      current.criticality, changes.criticality
    );
  }

  return updated as Issue;
}

export async function getProjectIssues(
  projectId: string,
  statusFilter?: IssueStatus[]
): Promise<Issue[]> {
  let query = db()
    .from("issues")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch issues: ${error.message}`);
  return (data ?? []) as Issue[];
}

export async function getIssueDetail(issueId: string) {
  const [issueRes, commentsRes, activityRes, docsRes] = await Promise.all([
    db().from("issues").select("*, creator:participants!created_by(*), responsible:participants!responsible_id(*)").eq("id", issueId).single(),
    db().from("issue_comments").select("*, participant:participants(*)").eq("issue_id", issueId).order("created_at"),
    db().from("issue_activity_log").select("*, participant:participants(*)").eq("issue_id", issueId).order("created_at"),
    db().from("issue_documents").select("*, participant:participants!uploaded_by(*)").eq("issue_id", issueId).order("created_at", { ascending: false }),
  ]);

  if (issueRes.error) throw new Error(`Issue not found: ${issueRes.error.message}`);

  // Get all participants for this project
  const { data: participants } = await db()
    .from("participants")
    .select("*")
    .eq("project_id", issueRes.data.project_id)
    .eq("is_active", true);

  return {
    ...issueRes.data,
    comments: commentsRes.data ?? [],
    activity_log: activityRes.data ?? [],
    documents: docsRes.data ?? [],
    participants: participants ?? [],
  };
}

export async function getDashboardStats(projectId: string) {
  const { data: issues, error } = await db()
    .from("issues")
    .select("id, status, criticality, due_date, responsible_id, updated_at")
    .eq("project_id", projectId)
    .not("status", "in", '("cancelled")');

  if (error) throw new Error(`Failed to fetch stats: ${error.message}`);

  const now = new Date().toISOString().split("T")[0];
  const active = (issues ?? []).filter((i) => i.status !== "completed");

  return {
    total: active.length,
    high_priority: active.filter((i) => i.criticality === "high").length,
    overdue: active.filter((i) => i.due_date && i.due_date < now).length,
    awaiting_response: active.filter((i) => i.responsible_id !== null).length,
  };
}

// ---------- Comments ----------

export async function addComment(
  issueId: string,
  participantId: string,
  content: string,
  source: "dashboard" | "magic_link" | "email" = "dashboard"
): Promise<IssueComment> {
  const { data: comment, error } = await db()
    .from("issue_comments")
    .insert({ issue_id: issueId, participant_id: participantId, content, source } as never)
    .select()
    .single();
  if (error) throw new Error(`Failed to add comment: ${error.message}`);

  await logActivity(issueId, participantId, "commented", `Comment added via ${source}`);

  return comment as IssueComment;
}

// ---------- Documents ----------

export async function uploadDocument(
  issueId: string,
  participantId: string,
  file: File,
  source: "dashboard" | "magic_link" = "dashboard"
): Promise<IssueDocument> {
  // Get issue for project scoping
  const { data: issue } = await db()
    .from("issues")
    .select("project_id")
    .eq("id", issueId)
    .single();
  if (!issue) throw new Error("Issue not found");

  const storagePath = `${issue.project_id}/${issueId}/${Date.now()}-${file.name}`;

  // Upload to storage
  const { error: uploadError } = await db().storage
    .from("coordination-documents")
    .upload(storagePath, file);
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // Create document record
  const { data: doc, error } = await db()
    .from("issue_documents")
    .insert({
      issue_id: issueId,
      uploaded_by: participantId,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
      source,
    } as never)
    .select()
    .single();
  if (error) throw new Error(`Failed to record document: ${error.message}`);

  await logActivity(
    issueId, participantId, "document_uploaded",
    `Document uploaded: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`
  );

  return doc as IssueDocument;
}

export async function getDocumentUrl(storagePath: string): Promise<string> {
  const { data } = await db().storage
    .from("coordination-documents")
    .createSignedUrl(storagePath, 3600); // 1 hour expiry
  if (!data?.signedUrl) throw new Error("Failed to generate download URL");
  return data.signedUrl;
}

// ---------- Activity Log ----------

async function logActivity(
  issueId: string,
  participantId: string,
  activityType: string,
  description: string,
  oldValue?: string | null,
  newValue?: string | null
) {
  await db()
    .from("issue_activity_log")
    .insert({
      issue_id: issueId,
      participant_id: participantId,
      activity_type: activityType,
      description,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
    } as never);
}

async function getParticipantName(participantId: string): Promise<string> {
  const { data } = await db()
    .from("participants")
    .select("name")
    .eq("id", participantId)
    .single();
  return data?.name ?? "Unknown";
}
