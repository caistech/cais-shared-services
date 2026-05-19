/**
 * Auth smoke test runner — Portfolio Standard R1 + R4 enforcement.
 *
 * Verifies the four critical auth legs (login, signup, forgot-password,
 * magic-link) are reachable and that their underlying form-action endpoints
 * don't 5xx. Designed as a CI gate (preview-deploy verification) and as the
 * gate fired by the AUTH SMOKE-TEST ON EVERY MEMORY SAVE hook.
 *
 * This does NOT create real accounts or send real emails — that's an end-to-end
 * concern. The job here is to confirm the routes exist, render, and that their
 * POST endpoints fail gracefully (400-class) rather than blowing up (500-class).
 *
 * Config shape:
 *   {
 *     baseUrl: 'https://my-product.vercel.app',
 *     loginPath: '/login',
 *     signupPath: '/signup',
 *     forgotPasswordPath: '/forgot-password',
 *     magicLinkPath: '/login',          // page that hosts the magic-link button
 *     loginActionPath: '/api/auth/login',          // optional — POST target
 *     signupActionPath: '/api/auth/signup',        // optional
 *     forgotPasswordActionPath: '/api/auth/forgot',// optional
 *     magicLinkActionPath: '/api/auth/magic-link', // optional
 *     testEmail: 'gate-probe@example.invalid',     // optional, defaults provided
 *   }
 *
 * See foundation/PORTFOLIO_STANDARD.md → R1 and R4 for rationale.
 */

export type AuthLeg = 'login' | 'signup' | 'forgot-password' | 'magic-link'

export interface AuthSmokeConfig {
  baseUrl: string
  loginPath: string
  signupPath: string
  forgotPasswordPath: string
  magicLinkPath: string
  /** Optional POST endpoints. If omitted, only the page GET is exercised. */
  loginActionPath?: string
  signupActionPath?: string
  forgotPasswordActionPath?: string
  magicLinkActionPath?: string
  /** Throwaway probe email — never used to create real accounts. */
  testEmail?: string
  /** Throwaway probe password. Used only to shape the POST body. */
  testPassword?: string
  /** Per-request timeout (ms). Defaults to 15000. */
  timeoutMs?: number
  /** Override the User-Agent header. */
  userAgent?: string
}

export interface AuthFailure {
  leg: AuthLeg
  step: 'page' | 'action'
  url: string
  status: number | null
  reason: string
}

export interface AuthSmokeResult {
  passed: boolean
  total: number
  failures: AuthFailure[]
  durationMs: number
}

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_USER_AGENT = '@caistech/portfolio-gate auth-smoke/0.1'
const DEFAULT_TEST_EMAIL = 'gate-probe@example.invalid'
const DEFAULT_TEST_PASSWORD = 'gate-probe-pw-not-used'

interface LegSpec {
  leg: AuthLeg
  pagePath: string
  actionPath?: string
  actionBody?: Record<string, unknown>
}

/**
 * Run the auth smoke test against the supplied config.
 *
 * Each leg runs two checks:
 *   1. GET <pagePath>  → must respond 2xx (or 3xx redirect to itself).
 *   2. POST <actionPath> (if provided) → must respond < 500. A 4xx is a PASS
 *      because that means the validation layer is alive; a 5xx is a FAIL.
 */
export async function runAuthSmoke(
  config: AuthSmokeConfig
): Promise<AuthSmokeResult> {
  if (!config.baseUrl) {
    throw new Error('runAuthSmoke: baseUrl is required')
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const testEmail = config.testEmail ?? DEFAULT_TEST_EMAIL
  const testPassword = config.testPassword ?? DEFAULT_TEST_PASSWORD
  const start = Date.now()
  const failures: AuthFailure[] = []

  const legs: LegSpec[] = [
    {
      leg: 'login',
      pagePath: config.loginPath,
      actionPath: config.loginActionPath,
      actionBody: { email: testEmail, password: testPassword },
    },
    {
      leg: 'signup',
      pagePath: config.signupPath,
      actionPath: config.signupActionPath,
      actionBody: { email: testEmail, password: testPassword },
    },
    {
      leg: 'forgot-password',
      pagePath: config.forgotPasswordPath,
      actionPath: config.forgotPasswordActionPath,
      actionBody: { email: testEmail },
    },
    {
      leg: 'magic-link',
      pagePath: config.magicLinkPath,
      actionPath: config.magicLinkActionPath,
      actionBody: { email: testEmail },
    },
  ]

  let total = 0
  for (const leg of legs) {
    // Page check.
    total += 1
    const pageUrl = buildUrl(baseUrl, leg.pagePath)
    const pageResult = await fetchWithTimeout(pageUrl, {
      method: 'GET',
      headers: { 'User-Agent': userAgent, Accept: 'text/html' },
      redirect: 'manual',
      timeoutMs,
    })
    if (!isPageAcceptable(pageResult.status)) {
      failures.push({
        leg: leg.leg,
        step: 'page',
        url: pageUrl,
        status: pageResult.status,
        reason: pageResult.error ?? `unexpected status ${pageResult.status}`,
      })
    }

    // Action check (only if config provides an actionPath).
    if (!leg.actionPath) continue
    total += 1
    const actionUrl = buildUrl(baseUrl, leg.actionPath)
    const actionResult = await fetchWithTimeout(actionUrl, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(leg.actionBody ?? {}),
      redirect: 'manual',
      timeoutMs,
    })
    if (!isActionAcceptable(actionResult.status)) {
      failures.push({
        leg: leg.leg,
        step: 'action',
        url: actionUrl,
        status: actionResult.status,
        reason:
          actionResult.error ?? `action returned ${actionResult.status} (5xx is a fail)`,
      })
    }
  }

  return {
    passed: failures.length === 0,
    total,
    failures,
    durationMs: Date.now() - start,
  }
}

interface FetchOutcome {
  status: number | null
  error: string | null
}

interface FetchOpts {
  method: string
  headers: Record<string, string>
  body?: string
  redirect: 'manual' | 'follow' | 'error'
  timeoutMs: number
}

async function fetchWithTimeout(url: string, opts: FetchOpts): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const response = await fetch(url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
      redirect: opts.redirect,
      signal: controller.signal,
    })
    return { status: response.status, error: null }
  } catch (err) {
    return {
      status: null,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

function isPageAcceptable(status: number | null): boolean {
  if (status === null) return false
  // 2xx is the happy path. 3xx redirects are common for auth flows that
  // bounce a logged-in visitor away — treat as acceptable.
  if (status >= 200 && status < 400) return true
  return false
}

function isActionAcceptable(status: number | null): boolean {
  if (status === null) return false
  // The probe email is invalid by design; the action layer is expected to
  // reject. 2xx, 3xx, and 4xx all signal "endpoint alive and validating".
  // Only 5xx (or no response) is a failure.
  return status < 500
}

/**
 * Load an auth config from a JSON file path. TypeScript configs are loaded
 * via the CLI's dynamic import.
 */
export async function loadAuthConfigJson(path: string): Promise<AuthSmokeConfig> {
  const { readFile } = await import('node:fs/promises')
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as AuthSmokeConfig
}

/**
 * Format the result as a single human-readable string for stdout / CI logs.
 */
export function formatAuthResult(result: AuthSmokeResult): string {
  const lines: string[] = []
  lines.push(
    `[portfolio-gate] auth smoke: ${result.passed ? 'PASS' : 'FAIL'} ` +
      `(${result.total - result.failures.length}/${result.total} ok, ${result.durationMs}ms)`
  )
  for (const f of result.failures) {
    lines.push(
      `  FAIL ${f.leg} (${f.step}) ${f.url}: ${f.reason} (status ${f.status ?? 'no-response'})`
    )
  }
  return lines.join('\n')
}
