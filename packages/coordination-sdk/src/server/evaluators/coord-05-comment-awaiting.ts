// COORD-05: Comment awaiting response
// Fires when the last comment was from a different party and no reply in 48h+
import type { NudgeResult, NudgeTarget } from "@caistech/nudge-core";
import type { CoordEvaluatorContext } from "./types";

const RESPONSE_THRESHOLD_HOURS = 48;

export async function evaluateCommentAwaiting(
  ctx: CoordEvaluatorContext
): Promise<NudgeResult> {
  const thresholdMs = RESPONSE_THRESHOLD_HOURS * 60 * 60 * 1000;
  const targets: NudgeTarget[] = [];
  const payload: Record<string, unknown> = {};

  for (const issue of ctx.issues) {
    if (issue.status === "completed" || issue.status === "cancelled") continue;
    if (!issue.responsible_id) continue;

    // Get last 2 comments to see if responsible hasn't replied
    const { data: comments } = await ctx.admin
      .from("issue_comments")
      .select("participant_id, created_at")
      .eq("issue_id", issue.id)
      .order("created_at", { ascending: false })
      .limit(2);

    if (!comments || comments.length === 0) continue;

    const lastComment = comments[0];
    const commentAge = Date.now() - new Date(lastComment.created_at).getTime();

    // Last comment is from someone else, responsible hasn't replied, and it's been 48h+
    if (
      lastComment.participant_id !== issue.responsible_id &&
      commentAge > thresholdMs
    ) {
      const responsible = ctx.participants.find(
        (p) => p.id === issue.responsible_id
      );
      if (!responsible) continue;

      const hoursWaiting = Math.floor(commentAge / (1000 * 60 * 60));

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
        hours_waiting: hoursWaiting,
        comment_from: ctx.participants.find(
          (p) => p.id === lastComment.participant_id
        )?.name ?? "Unknown",
      };
    }
  }

  return { shouldFire: targets.length > 0, targets, payload };
}
