import type { ApiKeyRow, QuotaResult, SupabaseLike } from './types.js'

const UNLIMITED = -1

/**
 * Compute remaining monthly quota and the next reset boundary for a key.
 *
 * Read-only — call this BEFORE the work to decide 429-vs-proceed.
 * The actual increment happens via incrementUsage(), which atomically rolls
 * the period over if the stored period_start is in a previous month.
 *
 * monthly_limit = -1 → unlimited (Enterprise tier). Returns ok=true with
 * remaining = Number.POSITIVE_INFINITY so withApiKey() can short-circuit.
 *
 * `weight` is how many calls the upcoming request will count as (e.g. 2 for
 * force-refresh per the property-services pricing rule). Defaults to 1.
 */
export function checkMonthlyQuota(
  key: ApiKeyRow,
  opts: { weight?: number } = {}
): QuotaResult {
  const weight = opts.weight ?? 1
  const limit = key.monthly_limit
  const resetAt = nextMonthBoundary(new Date()).toISOString()

  if (limit === UNLIMITED) {
    return {
      ok: true,
      remaining: Number.POSITIVE_INFINITY,
      limit: UNLIMITED,
      reset_at: resetAt,
      current_period_calls: key.current_period_calls,
    }
  }

  // If the stored period_start is in a previous calendar month, the next
  // increment will roll it over — treat current usage as 0 for this check.
  const storedPeriodMonth = monthKey(new Date(key.period_start))
  const nowMonth = monthKey(new Date())
  const effectiveCalls = storedPeriodMonth === nowMonth ? key.current_period_calls : 0
  const wouldBeAfter = effectiveCalls + weight

  return {
    ok: wouldBeAfter <= limit,
    remaining: Math.max(0, limit - effectiveCalls),
    limit,
    reset_at: resetAt,
    current_period_calls: effectiveCalls,
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function nextMonthBoundary(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0))
}

/** Re-export so consumers/withApiKey can compare without re-importing the constant. */
export const UNLIMITED_LIMIT = UNLIMITED

/**
 * RPC variant: ask the database for the post-increment state. Used by
 * incrementUsage() — kept here so withApiKey() can call a single function.
 *
 * Not exported in the public surface — use checkMonthlyQuota() (above) for
 * pre-flight checks and incrementUsage() to commit a call.
 */
export async function fetchKeyState(
  supabase: SupabaseLike,
  keyId: string
): Promise<{ data: ApiKeyRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('id', keyId)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as ApiKeyRow, error: null }
}
