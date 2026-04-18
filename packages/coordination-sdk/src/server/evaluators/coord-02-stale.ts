// COORD-02: Stale issue
// Fires when no activity for 5+ days on an open issue
import type { NudgeResult, NudgeTarget } from "@caistech/nudge-core";
import type { CoordEvaluatorContext } from "./types";

const STALE_THRESHOLD_DAYS = 5;

export async function evaluateStale(
  ctx: CoordEvaluatorContext
): Promise<NudgeResult> {
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - STALE_THRESHOLD_DAYS);

  const targets: NudgeTarget[] = [];
  const payload: Record<string, unknown> = {};

  for (const issue of ctx.issues) {
    if (issue.status === "completed" || issue.status === "cancelled") continue;

    // Check last activity
    const { data: lastActivity } = await ctx.admin
      .from("issue_activity_log")
      .select("created_at")
      .eq("issue_id", issue.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const lastActivityDate = lastActivity
      ? new Date(lastActivity.created_at)
      : new Date(issue.created_at);

    if (lastActivityDate > staleThreshold) continue;

    // Nudge the responsible party + admin
    const responsible = issue.responsible_id
      ? ctx.participants.find((p) => p.id === issue.responsible_id)
      : null;
    const admin = ctx.participants.find((p) => p.role === "admin");

    const daysStale = Math.floor(
      (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const issuePayload = {
      issue_title: issue.title,
      issue_id: issue.id,
      days_stale: daysStale,
      last_activity: lastActivityDate.toISOString(),
    };

    if (responsible) {
      targets.push({
        userId: responsible.id,
        email: responsible.email,
        fullName: responsible.name,
        orgId: ctx.projectId,
        scopeId: ctx.projectId,
      });
      payload[responsible.id] = issuePayload;
    }

    if (admin && admin.id !== responsible?.id) {
      targets.push({
        userId: admin.id,
        email: admin.email,
        fullName: admin.name,
        orgId: ctx.projectId,
        scopeId: ctx.projectId,
      });
      payload[admin.id] = issuePayload;
    }
  }

  return { shouldFire: targets.length > 0, targets, payload };
}
