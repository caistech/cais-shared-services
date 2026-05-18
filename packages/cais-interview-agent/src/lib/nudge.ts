/**
 * Nudge templates — short follow-ups after interview submission.
 *
 * All three are deliberately low-pressure: reply-to-a-human, two sentences,
 * no calls to action that require the recipient to do work. The interview
 * agent's job is to capture intent — these nudges keep the door open
 * without sounding like a marketing list.
 */

export type NudgeKind = "day3" | "day14" | "day30";

export interface NudgeContext {
  respondentEmail: string;
  freeText: string | null;
  routing: "connexions" | "data_only" | null;
  triggeredByTool: string | null;
}

export function buildNudge(
  kind: NudgeKind,
  ctx: NudgeContext,
): { subject: string; text: string } {
  switch (kind) {
    case "day3":
      return {
        subject: "Quick check — anything land with the CAIS AU Compliance MCP?",
        text: [
          "Hi,",
          "",
          "A few days back you told us what you're building. Quick check: has anything landed with the MCP since then — a win, a blocker, anything missing?",
          "",
          "Just hit reply. Goes to a real person.",
          "",
          "— Corporate AI Solutions",
        ].join("\n"),
      };
    case "day14":
      return {
        subject: "Two weeks in — what's the next gap we could fill?",
        text: [
          "Hi,",
          "",
          "If the AU Compliance MCP is part of your stack now, we'd love to know what's actually useful and what's not.",
          "",
          "More importantly: what's the *next* AU regulatory or compliance gap that's slowing you down? Sanctions update cadence? Director ID? GST registration? Something else?",
          "",
          "Reply to this email with anything that comes to mind.",
          "",
          "— Corporate AI Solutions",
        ].join("\n"),
      };
    case "day30":
      return {
        subject: "Month-out — still using the AU Compliance MCP?",
        text: [
          "Hi,",
          "",
          "Thirty days in. Two possible truths:",
          "",
          "1. You're still using us — in which case, what's the one thing that would make this 10× more useful?",
          "2. You've moved on — in which case, what changed? Genuinely useful feedback either way.",
          "",
          "Hit reply. No pitch, no list, no sequence after this one.",
          "",
          "— Corporate AI Solutions",
        ].join("\n"),
      };
  }
}

export const NUDGE_OFFSET_DAYS: Record<NudgeKind, number> = {
  day3: 3,
  day14: 14,
  day30: 30,
};
