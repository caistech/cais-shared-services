/**
 * Route smoke test runner — Portfolio Standard R13 enforcement.
 *
 * Reads a per-product `routes.config.{ts,json}` from the consumer repo, hits
 * each listed route on the preview deploy, and fails the build on any
 * unexpected non-2xx response. Wired into the gate.yml GitHub Action template.
 *
 * Config shape:
 *   {
 *     baseUrl: 'https://my-product.vercel.app',
 *     routes: [
 *       { path: '/' },
 *       { path: '/pricing' },
 *       { path: '/login' },
 *       { path: '/api/health', expectedStatus: 200 },
 *       { path: '/admin', expectedStatus: 401, requiresAuth: true },
 *     ],
 *   }
 *
 * See foundation/PORTFOLIO_STANDARD.md → R13 for rationale.
 */

export interface RouteSpec {
  /** Path relative to baseUrl, e.g. '/login' or '/api/health'. */
  path: string
  /** Expected HTTP status. Defaults to 200. */
  expectedStatus?: number
  /**
   * If true, indicates the route should require auth — a 401/403 is treated as
   * a pass (the gate is verifying the route exists and the auth check fires,
   * not that it returns data). Pair with explicit `expectedStatus` when known.
   */
  requiresAuth?: boolean
  /** Optional human-readable label used in failure output. */
  label?: string
}

export interface RouteSmokeConfig {
  baseUrl: string
  routes: RouteSpec[]
  /** Per-request timeout (ms). Defaults to 15000. */
  timeoutMs?: number
  /** Override the User-Agent header. */
  userAgent?: string
}

export interface RouteFailure {
  path: string
  status: number | null
  expected: number | string
  label?: string
  reason: string
}

export interface RouteSmokeResult {
  passed: boolean
  total: number
  failures: RouteFailure[]
  durationMs: number
}

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_USER_AGENT = '@caistech/portfolio-gate route-smoke/0.1'

/**
 * Run the route smoke test against the supplied config.
 *
 * Returns a structured result; never throws on a route failure. Callers (e.g.
 * the CLI wrapper) inspect `passed` to decide exit status.
 */
export async function runRouteSmoke(
  config: RouteSmokeConfig
): Promise<RouteSmokeResult> {
  if (!config.baseUrl) {
    throw new Error('runRouteSmoke: baseUrl is required')
  }
  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error('runRouteSmoke: routes must be a non-empty array')
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const start = Date.now()
  const failures: RouteFailure[] = []

  for (const route of config.routes) {
    const expected = route.expectedStatus ?? 200
    const url = `${baseUrl}${route.path.startsWith('/') ? route.path : `/${route.path}`}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let status: number | null = null
    let reason = ''
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': userAgent, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
        redirect: 'manual',
        signal: controller.signal,
      })
      status = response.status
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err)
    } finally {
      clearTimeout(timeout)
    }

    if (status === null) {
      failures.push({
        path: route.path,
        status: null,
        expected,
        label: route.label,
        reason: reason || 'fetch failed',
      })
      continue
    }

    if (!isAcceptable(status, expected, route.requiresAuth)) {
      failures.push({
        path: route.path,
        status,
        expected: route.requiresAuth ? `${expected} or 401/403` : expected,
        label: route.label,
        reason: `unexpected status ${status}`,
      })
    }
  }

  return {
    passed: failures.length === 0,
    total: config.routes.length,
    failures,
    durationMs: Date.now() - start,
  }
}

function isAcceptable(
  status: number,
  expected: number,
  requiresAuth: boolean | undefined
): boolean {
  if (status === expected) return true
  // Any 2xx counts when expected is 200 and no explicit override.
  if (expected === 200 && status >= 200 && status < 300) return true
  // Auth-protected routes pass on 401/403 unless an exact status was demanded.
  if (requiresAuth && (status === 401 || status === 403)) return true
  return false
}

/**
 * Load a routes config from a JSON file path. TypeScript configs are loaded
 * via the CLI's dynamic import; this helper is JSON-only so it has no runtime
 * dependency on the consumer's TS toolchain.
 */
export async function loadRoutesConfigJson(path: string): Promise<RouteSmokeConfig> {
  const { readFile } = await import('node:fs/promises')
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as RouteSmokeConfig
  return parsed
}

/**
 * Format the result as a single human-readable string for stdout / CI logs.
 */
export function formatRouteResult(result: RouteSmokeResult): string {
  const lines: string[] = []
  lines.push(
    `[portfolio-gate] route smoke: ${result.passed ? 'PASS' : 'FAIL'} ` +
      `(${result.total - result.failures.length}/${result.total} ok, ${result.durationMs}ms)`
  )
  for (const f of result.failures) {
    const tag = f.label ? ` [${f.label}]` : ''
    lines.push(
      `  FAIL ${f.path}${tag}: ${f.reason} (got ${f.status ?? 'no-response'}, expected ${f.expected})`
    )
  }
  return lines.join('\n')
}
