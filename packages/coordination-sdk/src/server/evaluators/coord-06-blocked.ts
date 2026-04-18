// COORD-06: Blocked cascade
// Fires when issue is marked blocked and the blocking party hasn't responded in 24h+
import type { NudgeResult, NudgeTarget } from "@caistech/nudge-core";
import type { CoordEvaluatorContext } from "./types";

const BLOCKED_THRESHOLD_HOURS = 24;

export async function evaluateBlockedCascade(
  ctx: CoordEvaluatorContext
): Promise<NudgeResult> {
  const thresholdMs = BLOCKED_THRESHOLD_HOURS * 60 * 60 * 1000;
  const targets: NudgeTarget[] = [];
  const payload: Record<string, unknown> = {};

  const blockedIssues = ctx.issues.filter((i) => i.status === "blocked");

  for (const issue of blockedIssues) {
    if (!issue.responsible_id) continue;

    // When was it marked blocked?
    const { data: blockedEvent } = await ctx.admin
      .from("issue_activity_log")
      .select("created_at")
      .eq("issue_id", issue.id)
      .eq("activity_type", "status_changed")
      .eq("new_value", "blocked")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!blockedEvent) continue;

    const blockedSince = new Date(blockedEvent.created_at).getTime();
    const blockedDuration = Date.now() - blockedSince;

    if (blockedDuration < thresholdMs) continue;

    const responsible = ctx.participants.find(
      (p) => p.id === issue.responsible_id
    );
    if (!responsible) continue;

    const admin = ctx.participants.find((p) => p.role === "admin");
    const hoursBlocked = Math.floor(blockedDuration / (1000 * 60 * 60));

    // Nudge the responsible party
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
      hours_blocked: hoursBlocked,
      next_action: issue.next_action,
      escalation: hoursBlocked > 72, // escalating tone after 3 days
    };

    // Also alert admin
    if (admin && admin.id !== responsible.id) {
      targets.push({
        userId: admin.id,
        email: admin.email,
        fullName: admin.name,
        orgId: ctx.projectId,
        scopeId: ctx.projectId,
      });
      payload[admin.id] = {
        issue_title: issue.title,
        issue_id: issue.id,
        hours_blocked: hoursBlocked,
        blocker_name: responsible.name,
        blocker_role: responsible.role,
        escalation: hoursBlocked > 72,
      };
    }
  }

  return { shouldFire: targets.length > 0, targets, payload };
}
