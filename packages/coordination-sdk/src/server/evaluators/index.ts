// Coordination nudge evaluator registry
import type { EvaluatorFn, NudgeChannel } from "@caistech/nudge-core";
import type { CoordNudgeType, CoordEvaluatorContext } from "./types";
import { evaluateOverdue } from "./coord-01-overdue";
import { evaluateStale } from "./coord-02-stale";
import { evaluateDocumentPending } from "./coord-03-document-pending";
import { evaluateDeadlineApproaching } from "./coord-04-deadline";
import { evaluateCommentAwaiting } from "./coord-05-comment-awaiting";
import { evaluateBlockedCascade } from "./coord-06-blocked";

export const coordEvaluatorRegistry: Record<
  CoordNudgeType,
  EvaluatorFn<CoordEvaluatorContext>
> = {
  "COORD-01": evaluateOverdue,
  "COORD-02": evaluateStale,
  "COORD-03": evaluateDocumentPending,
  "COORD-04": evaluateDeadlineApproaching,
  "COORD-05": evaluateCommentAwaiting,
  "COORD-06": evaluateBlockedCascade,
};

export const COORD_CHANNELS: Record<CoordNudgeType, NudgeChannel[]> = {
  "COORD-01": ["email"],
  "COORD-02": ["email"],
  "COORD-03": ["email"],
  "COORD-04": ["email"],
  "COORD-05": ["email"],
  "COORD-06": ["email"],
};

export const COORD_FREQUENCY_CAP_BYPASS: CoordNudgeType[] = ["COORD-04"];

export type { CoordNudgeType, CoordEvaluatorContext } from "./types";
