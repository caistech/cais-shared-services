import type { ApiKeyRow, SupabaseLike } from './types.js'

export interface IncrementResult {
  ok: boolean
  current_period_calls: number
  period_start: string
  monthly_limit: number
  error?: string
}

/**
 * Atomically increment the call counter for an API key. Rolls the period
 * over if the stored period_start is in a previous calendar month.
 *
 * Calls the increment_api_usage(uuid, int) SQL function shipped in
 * migrations/001_api_key_auth.sql. Returns the post-increment state so
 * withApiKey() can populate X-RateLimit-Remaining without a second query.
 *
 * For monthly_limit = -1 (Enterprise unlimited), the increment still runs
 * — the counter is kept for analytics (Decision #4 in STEP_5_HUB_AUDIT).
 */
export async function incrementUsage(
  supabase: SupabaseLike,
  key: Pick<ApiKeyRow, 'id'>,
  weight: number = 1
): Promise<IncrementResult> {
  const { data, error } = await supabase.rpc('increment_api_usage', {
    p_key_id: key.id,
    p_weight: weight,
  })

  if (error) {
    return {
      ok: false,
      current_period_calls: 0,
      period_start: new Date().toISOString(),
      monthly_limit: 0,
      error: error.message,
    }
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return {
      ok: false,
      current_period_calls: 0,
      period_start: new Date().toISOString(),
      monthly_limit: 0,
      error: 'key_not_found_or_inactive',
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    current_period_calls: number
    period_start: string
    monthly_limit: number
  }
  return {
    ok: true,
    current_period_calls: row.current_period_calls,
    period_start: row.period_start,
    monthly_limit: row.monthly_limit,
  }
}
