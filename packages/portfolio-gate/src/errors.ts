/**
 * errorResponse() — Portfolio Standard R10 enforcement.
 *
 * Sanitises arbitrary backend errors (Postgres, Stripe, Supabase, Anthropic, etc.)
 * into a safe API response. The raw error.message / detail / code MUST NOT reach
 * the client. The full error is logged server-side, keyed by a generated
 * request_id; the client receives only { error, request_id }.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R10 for rationale.
 */
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

export interface ErrorResponseOptions {
  /** HTTP status code. Defaults to 500. */
  status?: number
  /**
   * Message returned to the client. Defaults to a generic
   * "Internal server error" so no implementation detail leaks.
   */
  publicMessage?: string
  /**
   * Custom logger. Defaults to console.error. Override in tests or to
   * route to a structured logger (pino, Sentry, etc.).
   */
  logger?: (msg: string, ctx: Record<string, unknown>) => void
}

export interface ErrorResponseBody {
  error: string
  request_id: string
}

/**
 * Sanitise an arbitrary error into a safe NextResponse.
 *
 * - Generates a UUID `request_id` for cross-referencing logs.
 * - Logs the full error server-side (uses console.error by default).
 * - Returns ONLY { error, request_id } to the client — never `error.message`,
 *   `error.detail`, or `error.code` from the underlying driver.
 *
 * @example
 *   try {
 *     const data = await supabase.from('foo').select('*')
 *     if (data.error) throw data.error
 *     return NextResponse.json(data)
 *   } catch (err) {
 *     return errorResponse(err)
 *   }
 */
export function errorResponse(
  error: unknown,
  opts: ErrorResponseOptions = {}
): NextResponse<ErrorResponseBody> {
  const requestId = randomUUID()
  const log = opts.logger ?? defaultLogger

  log('[portfolio-gate] errorResponse', {
    request_id: requestId,
    error: serialiseError(error),
  })

  const body: ErrorResponseBody = {
    error: opts.publicMessage ?? 'Internal server error',
    request_id: requestId,
  }

  return NextResponse.json(body, { status: opts.status ?? 500 })
}

/**
 * Default logger writes to stderr via console.error. Replaced via
 * `errorResponse(err, { logger })` if a structured logger is wired.
 */
function defaultLogger(msg: string, ctx: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(msg, ctx)
}

/**
 * Reduce arbitrary error shapes to a structured object the logger can stringify
 * safely. Native Errors keep name/message/stack; everything else passes through.
 */
function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  if (typeof error === 'object' && error !== null) {
    return { value: error as Record<string, unknown> }
  }
  return { value: String(error) }
}
