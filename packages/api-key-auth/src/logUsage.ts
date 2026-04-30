import type { ApiKeyRow, SupabaseLike, UsageLogInput } from './types.js'

/**
 * Insert a row into api_usage_logs. Fire-and-forget — failures are logged
 * to console but do not throw, since usage logging must never block the
 * request path.
 */
export async function logUsage(
  supabase: SupabaseLike,
  key: Pick<ApiKeyRow, 'id'>,
  input: UsageLogInput
): Promise<void> {
  const { error } = await supabase.from('api_usage_logs').insert({
    api_key_id: key.id,
    endpoint: input.endpoint,
    cache_hit: input.cache_hit ?? null,
    duration_ms: input.duration_ms ?? null,
    status_code: input.status_code ?? null,
  })

  if (error) {
    console.warn(
      `[api-key-auth] logUsage failed for key ${key.id} on ${input.endpoint}: ${error.message}`
    )
  }
}
