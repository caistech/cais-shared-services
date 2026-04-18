// COORD-01: Overdue action
// Fires immediately when due date has passed and no activity since
import type { NudgeResult, NudgeTarget } from "@caistech/nudge-core";
import type { CoordEvaluatorContext } from "./types";

export async function evaluateOverdue(
  ctx: CoordEvaluatorContext
): Promise<NudgeResult> {
  const now = new Date().toISOString().split("T")[0];
  const overdueIssues = ctx.issues.filter(
    (i) =>
      i.due_date &&
      i.due_date < now &&
      i.status !== "completed" &&
      i.status !== "cancelled" &&
      i.responsible_id
  );

  if (overdueIssues.length === 0) {
    return { shouldFire: false, targets: [], payload: {} };
  }

  const targets: NudgeTarget[] = [];
  const payload: Record<string, unknown> = {};

  for (const issue of overdueIssues) {
    const responsible = ctx.participants.find(
      (p) => p.id === issue.responsible_id
    );
    if (!responsible) continue;

    const target: NudgeTarget = {
      userId: responsible.id,
      email: responsible.email,
      fullName: responsible.name,
      orgId: ctx.projectId,
      scopeId: ctx.projectId,
    };
    targets.push(target);

    const daysOverdue = Math.floor(
      (Date.now() - new Date(issue.due_date + "T00:00:00").getTime()) /
        (1000 * 60 * 60 * 24)
    );

    payload[responsible.id] = {
      issue_title: issue.title,
      issue_id: issue.id,
      days_overdue: daysOverdue,
      next_action: issue.next_action,
      due_date: issue.due_date,
    };
  }

  return { shouldFire: targets.length > 0, targets, payload };
}
