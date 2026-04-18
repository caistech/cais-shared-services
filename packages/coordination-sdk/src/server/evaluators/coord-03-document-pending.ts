// COORD-03: Document pending
// Fires when next_action mentions upload/document and no doc uploaded in 24h+
import type { NudgeResult, NudgeTarget } from "@caistech/nudge-core";
import type { CoordEvaluatorContext } from "./types";

const UPLOAD_KEYWORDS = ["upload", "provide", "submit", "send", "certificate", "report", "document"];

export async function evaluateDocumentPending(
  ctx: CoordEvaluatorContext
): Promise<NudgeResult> {
  const targets: NudgeTarget[] = [];
  const payload: Record<string, unknown> = {};

  for (const issue of ctx.issues) {
    if (issue.status === "completed" || issue.status === "cancelled") continue;
    if (!issue.next_action || !issue.responsible_id) continue;

    const actionLower = issue.next_action.toLowerCase();
    const mentionsUpload = UPLOAD_KEYWORDS.some((kw) => actionLower.includes(kw));
    if (!mentionsUpload) continue;

    // Check if any document was uploaded recently
    const { data: recentDoc } = await ctx.admin
      .from("issue_documents")
      .select("created_at")
      .eq("issue_id", issue.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (recentDoc) {
      const docAge = Date.now() - new Date(recentDoc.created_at).getTime();
      if (docAge < 24 * 60 * 60 * 1000) continue; // uploaded within 24h, skip
    }

    const responsible = ctx.participants.find(
      (p) => p.id === issue.responsible_id
    );
    if (!responsible) continue;

    targets.push({
      userId: responsible.id,
      email: responsible.email,
      fullName: responsible.name,
      orgId: ctx.projectId,
      scopeId: ctx.projectId,
    });

    payload[responsible.id] = {
      issue_title: issue.title,
      issue_id: issue.id,
      next_action: issue.next_action,
      due_date: issue.due_date,
    };
  }

  return { shouldFire: targets.length > 0, targets, payload };
}
