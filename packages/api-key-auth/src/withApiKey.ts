import type { ApiKeyRow, SupabaseLike } from './types.js'
import { verifyApiKey } from './verifyApiKey.js'
import { checkMonthlyQuota, UNLIMITED_LIMIT } from './checkMonthlyQuota.js'
import { incrementUsage } from './incrementUsage.js'
import { logUsage } from './logUsage.js'

export interface WithApiKeyContext {
  apiKey: ApiKeyRow
}

export type WeightFn = (request: Request) => number

export interface WithApiKeyOptions {
  /** Service-role Supabase client (or anything matching SupabaseLike). */
  supabase: SupabaseLike
  /** Endpoint label for usage logs, e.g. '/derive' or '/assess'. */
  endpoint: string
  /**
   * How many quota units this call costs. Either a number, or a function
   * that inspects the request (e.g. force-refresh = 2). Default: 1.
   */
  weight?: number | WeightFn
  /** Header name to look in. Default: 'x-api-key' (case-insensitive). */
  headerName?: string
}

export type ApiKeyHandler = (
  request: Request,
  ctx: WithApiKeyContext
) => Promise<Response> | Response

/**
 * Compose API-key auth, monthly quota, and usage logging around a Deno-
 * compatible Request → Response handler.
 *
 * Behaviour:
 *   - 401 if header is missing or the key is invalid/revoked/inactive.
 *   - 429 if the call would exceed monthly_limit. Body includes the
 *     upgrade nudge fields (`limit`, `reset_at`, `plan_tier`).
 *   - On success: increments usage atomically, calls the inner handler,
 *     logs the call, and returns the handler's response decorated with
 *     `X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset`.
 *
 * monthly_limit = -1 (Enterprise) short-circuits the quota check — the
 * increment still runs for analytics (Decision #4).
 */
export function withApiKey(
  options: WithApiKeyOptions,
  handler: ApiKeyHandler
): (request: Request) => Promise<Response> {
  const headerName = (options.headerName ?? 'x-api-key').toLowerCase()

  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now()
    const presented = request.headers.get(headerName)

    const verify = await verifyApiKey(options.supabase, presented)
    if (!verify.ok || !verify.key) {
      return jsonResponse(
        401,
        {
          error: 'unauthorized',
          reason: verify.error ?? 'invalid',
          message: 'Provide a valid API key in the X-API-Key header.',
        },
        {}
      )
    }
    const key = verify.key
    const weight = resolveWeight(options.weight, request)

    // Pre-flight quota check (skipped for unlimited tier).
    if (key.monthly_limit !== UNLIMITED_LIMIT) {
      const quota = checkMonthlyQuota(key, { weight })
      if (!quota.ok) {
        return jsonResponse(
          429,
          {
            error: 'quota_exceeded',
            limit: quota.limit,
            remaining: quota.remaining,
            reset_at: quota.reset_at,
            plan_tier: key.plan_tier,
            message:
              `Monthly quota of ${quota.limit} calls exceeded for plan '${key.plan_tier}'. ` +
              `Quota resets at ${quota.reset_at}. Upgrade for higher limits.`,
          },
          {
            'X-RateLimit-Limit': String(quota.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': quota.reset_at,
            'Retry-After': retryAfterSeconds(quota.reset_at),
          }
        )
      }
    }

    // Commit the call atomically.
    const inc = await incrementUsage(options.supabase, key, weight)
    if (!inc.ok) {
      return jsonResponse(
        500,
        {
          error: 'increment_failed',
          message: inc.error ?? 'Could not record API call. Please retry.',
        },
        {}
      )
    }

    // Run the inner handler.
    let response: Response
    try {
      response = await handler(request, { apiKey: key })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response = jsonResponse(500, { error: 'handler_error', message: msg }, {})
    }

    // Decorate with rate-limit headers and log usage.
    const decorated = decorateRateLimitHeaders(response, key, inc)
    await logUsage(options.supabase, key, {
      endpoint: options.endpoint,
      duration_ms: Date.now() - startedAt,
      status_code: decorated.status,
      cache_hit: readCacheHitFlag(decorated),
    })

    return decorated
  }
}

function resolveWeight(weight: WithApiKeyOptions['weight'], request: Request): number {
  if (typeof weight === 'function') return Math.max(1, Math.floor(weight(request)))
  if (typeof weight === 'number') return Math.max(1, Math.floor(weight))
  return 1
}

function decorateRateLimitHeaders(
  response: Response,
  key: ApiKeyRow,
  inc: { current_period_calls: number; monthly_limit: number }
): Response {
  const resetAt = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1, 0, 0, 0, 0)
  ).toISOString()

  const headers = new Headers(response.headers)
  if (inc.monthly_limit === UNLIMITED_LIMIT) {
    headers.set('X-RateLimit-Limit', 'unlimited')
    headers.set('X-RateLimit-Remaining', 'unlimited')
  } else {
    const remaining = Math.max(0, inc.monthly_limit - inc.current_period_calls)
    headers.set('X-RateLimit-Limit', String(inc.monthly_limit))
    headers.set('X-RateLimit-Remaining', String(remaining))
  }
  headers.set('X-RateLimit-Reset', resetAt)
  headers.set('X-Plan-Tier', key.plan_tier)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function readCacheHitFlag(response: Response): boolean | null {
  const flag = response.headers.get('x-cache-hit')
  if (flag === '1' || flag === 'true') return true
  if (flag === '0' || flag === 'false') return false
  return null
}

function retryAfterSeconds(resetAtIso: string): string {
  const resetMs = new Date(resetAtIso).getTime()
  const seconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))
  return String(seconds)
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}
