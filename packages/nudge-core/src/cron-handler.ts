import type {
  CronHandlerConfig,
  CronResult,
  NudgeChannel,
} from "./types.js";
import { buildFrequencyCapIndex } from "./frequency-cap.js";

// ---------------------------------------------------------------------------
// Generic cron evaluation loop
// ---------------------------------------------------------------------------

/**
 * Run the nudge evaluation loop.
 *
 * 1. Batch-load all recent nudge_log rows (eliminates N+1)
 * 2. For each org, build context and run every evaluator
 * 3. Apply frequency cap, snooze, quiet-hours, and SMS dedup checks
 * 4. Deliver via configured channels (email, in_app, sms)
 *
 * Returns a summary of what happened.
 */
export async function runNudgeCron<
  TNudgeType extends string,
  TContext,
>(
  config: CronHandlerConfig<TNudgeType, TContext>,
): Promise<CronResult> {
  const errors: string[] = [];
  let evaluated = 0;
  let fired = 0;
  let skipped = 0;

  // Step 1: batch-load nudge logs
  const recentLogs = await config.loadRecentNudgeLogs();

  const bypassSet = new Set<string>(config.frequencyCapBypass ?? []);
  const capIndex = buildFrequencyCapIndex(recentLogs, bypassSet);

  const smsDedupSet = new Set<string>(config.smsDedupTypes ?? []);

  // Step 2: get all org IDs
  const orgIds = await config.getOrgIds();
  if (orgIds.length === 0) {
    return { evaluated: 0, fired: 0, skipped: 0 };
  }

  for (const orgId of orgIds) {
    let ctx: TContext;
    try {
      ctx = await config.buildContext(orgId);
    } catch (err) {
      errors.push(`org ${orgId}: context build failed — ${errorMsg(err)}`);
      continue;
    }

    for (const [nudgeType, evaluator] of typedEntries(config.evaluators)) {
      evaluated++;

      try {
        const result = await evaluator(ctx);
        if (!result.shouldFire) continue;

        const channels: NudgeChannel[] = config.channels[nudgeType] ?? [];

        for (const target of result.targets) {
          const targetPayload = (
            result.payload[target.userId] ?? result.payload
          ) as Record<string, unknown>;

          // Frequency cap check (in-memory)
          if (capIndex.isCapped(target.userId, nudgeType)) {
            skipped++;
            continue;
          }

          // Snooze check (in-memory)
          if (capIndex.isSnoozed(target.userId, nudgeType)) {
            skipped++;
            continue;
          }

          // SMS dedup check
          if (
            smsDedupSet.has(nudgeType) &&
            config.checkActiveSms
          ) {
            try {
              const hasActiveSms = await config.checkActiveSms(
                target.userId,
                orgId,
              );
              if (hasActiveSms) {
                skipped++;
                continue;
              }
            } catch {
              // If SMS check fails, don't suppress the nudge
            }
          }

          // Deliver via each channel
          for (const channel of channels) {
            try {
              if (channel === "email") {
                // Quiet hours
                if (config.isQuietHours?.()) {
                  skipped++;
                  continue;
                }

                // Build and send email
                if (config.getEmailContent && config.sendEmail) {
                  const content = config.getEmailContent(
                    nudgeType,
                    target,
                    result.payload,
                  );
                  if (content) {
                    await config.sendEmail({
                      to: target.email,
                      ...content,
                    });
                  }
                }
              }

              // Log the nudge
              await config.insertNudgeLog({
                orgId,
                scopeId: target.scopeId ?? null,
                nudgeType,
                channel,
                userId: target.userId,
                recipientEmail: target.email,
                payload: targetPayload,
              });

              fired++;
            } catch (err) {
              errors.push(
                `${nudgeType}/${channel}/${target.userId}: ${errorMsg(err)}`,
              );
            }
          }
        }
      } catch (err) {
        errors.push(`${nudgeType}: evaluator error — ${errorMsg(err)}`);
      }
    }
  }

  return {
    evaluated,
    fired,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function typedEntries<K extends string, V>(
  obj: Record<K, V>,
): [K, V][] {
  return Object.entries(obj) as [K, V][];
}
