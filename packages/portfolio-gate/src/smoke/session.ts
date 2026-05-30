/**
 * Authenticated route smoke test — Portfolio Standard R1 + R4 extension.
 *
 * Tests that protected routes actually work after authentication.
 * This catches issues like:
 * - Missing SUPABASE_SERVICE_ROLE_KEY (causes SSR crashes)
 * - Database tables not created
 * - RLS blocking service client
 * - Missing profile/org data
 *
 * Config shape:
 *   {
 *     baseUrl: 'https://my-product.vercel.app',
 *     loginPath: '/login',
 *     loginActionPath: '/api/auth/login',
 *     magicLinkActionPath: '/api/auth/magic-link',
 *     protectedRoutes: ['/dashboard', '/settings'],
 *     testEmail: 'qa@corporateaisolutions.com',     // real test account
 *     testPassword: 'RealPassword123!',
 *   }
 *
 * The test:
 * 1. Logs in via form or magic-link
 * 2. Extracts session cookie
 * 3. Visits each protected route with cookie
 * 4. Checks for SSR errors in response
 */

export interface AuthSessionConfig {
  baseUrl: string
  loginPath: string
  loginActionPath?: string
  magicLinkActionPath?: string
  protectedRoutes: string[]
  testEmail?: string
  testPassword?: string
  timeoutMs?: number
  userAgent?: string
}

export interface SessionFailure {
  route: string
  step: 'login' | 'visit' | 'parse'
  status: number | null
  reason: string
  ssrError?: string
}

export interface AuthSessionResult {
  passed: boolean
  total: number
  failures: SessionFailure[]
  durationMs: number
  sessionCreated: boolean
  testedRoutes: string[]
}

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_USER_AGENT = '@caistech/portfolio-gate auth-session/0.1'

async function fetchWithTimeout(
  url: string,
  opts: {
    method: string
    headers: Record<string, string>
    body?: string
    redirect: 'manual' | 'follow' | 'error'
    timeoutMs: number
    cookie?: string
  }
): Promise<{ status: number | null; data?: string; cookies?: string[]; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const headers: Record<string, string> = { ...opts.headers }
    if (opts.cookie) headers['Cookie'] = opts.cookie

    const response = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body,
      redirect: opts.redirect,
      signal: controller.signal,
    })

    const cookies = response.headers.getSetCookie?.() || []
    const data = await response.text().catch(() => undefined)

    return { status: response.status, data, cookies }
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

function extractSessionCookie(cookies: string[]): string | undefined {
  for (const cookie of cookies) {
    if (cookie.includes('sb-') && cookie.includes('auth-token')) {
      return cookie.split(';')[0]
    }
  }
  return undefined
}

function detectSsrError(html: string): string | null {
  const patterns = [
    /An error occurred in the Server Components render/i,
    /500.*Internal Server Error/i,
    /Failed to compile/i,
    /Module not found/i,
    /Cannot read properties of undefined/i,
    /is not a function/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return match[0]
  }

  return null
}

/**
 * Create a session by logging in.
 * Tries login form first, then magic-link as fallback.
 */
async function createSession(config: AuthSessionConfig): Promise<{
  cookie?: string
  error?: string
}> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const testEmail = config.testEmail ?? ''
  const testPassword = config.testPassword ?? ''

  // Try login form first
  if (config.loginActionPath) {
    const loginUrl = buildUrl(baseUrl, config.loginActionPath)
    const result = await fetchWithTimeout(loginUrl, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
      redirect: 'manual',
      timeoutMs,
    })

    if (result.status === 200 && result.cookies) {
      const cookie = extractSessionCookie(result.cookies)
      if (cookie) {
        return { cookie }
      }
    }
  }

  // Fallback: try magic-link
  if (config.magicLinkActionPath) {
    const magicUrl = buildUrl(baseUrl, config.magicLinkActionPath)
    const result = await fetchWithTimeout(magicUrl, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: testEmail }),
      redirect: 'manual',
      timeoutMs,
    })

    // Magic-link returns 200 with email sent, but we can't use it without
    // accessing the email. For smoke tests, we need a pre-existing session.
    // In CI, use a service-role minted session instead.
  }

  return { error: 'Could not create session' }
}

/**
 * Run authenticated route smoke test.
 *
 * This requires:
 * - A pre-created test account (QA account in docs/TESTING.md)
 * - Or SUPABASE_SERVICE_ROLE_KEY to mint sessions programmatically
 */
export async function runAuthSessionSmoke(
  config: AuthSessionConfig
): Promise<AuthSessionResult> {
  if (!config.baseUrl) {
    throw new Error('runAuthSessionSmoke: baseUrl is required')
  }

  if (!config.testEmail || !config.testPassword) {
    throw new Error('runAuthSessionSmoke: testEmail and testPassword required for authenticated test')
  }

  const start = Date.now()
  const failures: SessionFailure[] = []

  // Create session
  const sessionResult = await createSession(config)

  if (!sessionResult.cookie) {
    return {
      passed: false,
      total: config.protectedRoutes.length,
      failures: config.protectedRoutes.map(route => ({
        route,
        step: 'login',
        status: null,
        reason: sessionResult.error ?? 'Failed to create session - ensure QA account exists',
      })),
      durationMs: Date.now() - start,
      sessionCreated: false,
      testedRoutes: config.protectedRoutes,
    }
  }

  // Visit protected routes
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT

  for (const route of config.protectedRoutes) {
    const url = buildUrl(config.baseUrl, route)
    const result = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html',
      },
      redirect: 'manual',
      timeoutMs,
      cookie: sessionResult.cookie,
    })

    // Check status
    if (result.status === null) {
      failures.push({
        route,
        step: 'visit',
        status: result.status,
        reason: result.error ?? 'connection failed',
      })
      continue
    }

    if (result.status === 401 || result.status === 403) {
      failures.push({
        route,
        step: 'visit',
        status: result.status,
        reason: 'Authentication failed - session not valid',
      })
      continue
    }

    if (result.status >= 500) {
      failures.push({
        route,
        step: 'visit',
        status: result.status,
        reason: `Server error ${result.status}`,
      })
      continue
    }

    // Check for SSR errors in HTML
    if (result.data) {
      const ssrError = detectSsrError(result.data)
      if (ssrError) {
        failures.push({
          route,
          step: 'visit',
          status: result.status,
          reason: `SSR error detected: ${ssrError}`,
          ssrError,
        })
      }
    }
  }

  return {
    passed: failures.length === 0,
    total: config.protectedRoutes.length,
    failures,
    durationMs: Date.now() - start,
    sessionCreated: true,
    testedRoutes: config.protectedRoutes,
  }
}

/**
 * Load config from JSON file.
 */
export async function loadSessionConfigJson(path: string): Promise<AuthSessionConfig> {
  const { readFile } = await import('node:fs/promises')
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as AuthSessionConfig
}

/**
 * Format result for stdout.
 */
export function formatSessionResult(result: AuthSessionResult): string {
  const lines: string[] = []
  const status = result.passed ? 'PASS' : 'FAIL'

  lines.push(
    `[portfolio-gate] auth session: ${status} ` +
      `(${result.sessionCreated ? 'session ok' : 'no session'}, ${result.testedRoutes.length} routes, ${result.durationMs}ms)`
  )

  for (const f of result.failures) {
    lines.push(
      `  FAIL ${f.route} (${f.step}): ${f.reason} (status ${f.status ?? 'n/a'})`
    )
  }

  return lines.join('\n')
}
