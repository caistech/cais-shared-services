import type { NudgeLogRow } from "./types.js";

// ---------------------------------------------------------------------------
// In-memory frequency cap checker
// ---------------------------------------------------------------------------

/** Default minimum gap between nudges of the same type per user */
const DEFAULT_CAP_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface FrequencyCapIndex {
  /**
   * Check whether a nudge should be suppressed.
   * Returns true if the nudge is capped (should NOT fire).
   */
  isCapped(userId: string, nudgeType: string): boolean;

  /**
   * Check whether a nudge is currently snoozed.
   * Returns true if snoozed (should NOT fire).
   */
  isSnoozed(userId: string, nudgeType: string): boolean;
}

/**
 * Build an in-memory index from a batch of recent nudge_log rows.
 *
 * Call this once at the start of a cron run to eliminate N+1 queries.
 *
 * @param rows       Recent nudge_log rows (typically last 24h)
 * @param bypassSet  Nudge types that ignore the frequency cap
 * @param capMs      Minimum gap in milliseconds (default 24h)
 * @param now        Current timestamp (injectable for testing)
 */
export function buildFrequencyCapIndex(
  rows: NudgeLogRow[],
  bypassSet: Set<string> = new Set(),
  capMs: number = DEFAULT_CAP_MS,
  now: Date = new Date(),
): FrequencyCapIndex {
  // Key: `${userId}::${nudgeType}` -> latest sent_at timestamp
  const latestSent = new Map<string, number>();
  // Key: `${userId}::${nudgeType}` -> snoozed_until timestamp (only for un-actioned rows)
  const snoozedUntil = new Map<string, number>();

  const nowMs = now.getTime();
  const cutoff = nowMs - capMs;

  for (const row of rows) {
    const key = `${row.user_id}::${row.nudge_type}`;

    // Track latest sent_at for frequency cap
    const sentAt = new Date(row.sent_at).getTime();
    if (sentAt >= cutoff) {
      const existing = latestSent.get(key);
      if (!existing || sentAt > existing) {
        latestSent.set(key, sentAt);
      }
    }

    // Track snooze state (only un-actioned rows matter)
    if (row.actioned_at === null && row.snoozed_until) {
      const snoozedTs = new Date(row.snoozed_until).getTime();
      if (snoozedTs > nowMs) {
        const existing = snoozedUntil.get(key);
        if (!existing || snoozedTs > existing) {
          snoozedUntil.set(key, snoozedTs);
        }
      }
    }
  }

  return {
    isCapped(userId: string, nudgeType: string): boolean {
      if (bypassSet.has(nudgeType)) return false;
      const key = `${userId}::${nudgeType}`;
      return latestSent.has(key);
    },

    isSnoozed(userId: string, nudgeType: string): boolean {
      const key = `${userId}::${nudgeType}`;
      return snoozedUntil.has(key);
    },
  };
}
