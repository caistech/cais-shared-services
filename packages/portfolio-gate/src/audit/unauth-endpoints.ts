/**
 * Unauth-endpoints audit — Portfolio Standard R12 enforcement.
 *
 * Dynamic: discovers every `app/api/**\/route.ts` in the repo, curls each
 * anonymously against `PORTFOLIO_GATE_PREVIEW_URL` (or `--base-url`), and
 * FAILs the build if a non-declared-public endpoint responds 200 with a JSON
 * body carrying more than `dataFieldThreshold` fields AND no auth-related
 * pattern (`auth.users`, `auth_id`, `requestRequiresAuth`).
 *
 * Consumers declare intentionally-public routes via `unauth-endpoints.config.{ts,json}`.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R12.
 */
import { resolve, sep } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
  walkFiles,
} from './shared.js'

export interface UnauthEndpointsConfig {
  /** Preview deploy URL to curl. Overridable via `--base-url`. */
  baseUrl?: string
  /**
   * Repo-relative API routes declared public-by-design. Use the URL path
   * (e.g. `/api/health`, `/api/public/badge`) — not the file path.
   * Each entry needs a `justification` for the audit log.
   */
  publicAllowlist?: PublicRouteEntry[]
  /** Path to the App Router `app/` directory. Default: `app`. */
  appDir?: string
  /** Per-request timeout (ms). Default: 15000. */
  timeoutMs?: number
  /**
   * Heuristic threshold — a response with more than this many top-level
   * JSON fields is treated as data-bearing. Default: 3.
   */
  dataFieldThreshold?: number
  /** Override the User-Agent header. */
  userAgent?: string
}

export interface PublicRouteEntry {
  path: string
  justification: string
}

export interface UnauthEndpointsOptions {
  rootDir?: string
  configPath?: string | null
  baseUrlOverride?: string | null
}

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_USER_AGENT = '@caistech/portfolio-gate unauth-audit/0.2'
const DEFAULT_FIELD_THRESHOLD = 3
const AUTH_GUARD_PATTERNS = [
  /auth\.users/i,
  /auth_id/i,
  /requestRequiresAuth/i,
  /"error"\s*:/i,
  /"unauthorized"/i,
  /"unauthenticated"/i,
]

export async function runUnauthEndpointsAudit(
  options: UnauthEndpointsOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<UnauthEndpointsConfig>(
      options.configPath ?? resolve(rootDir, 'unauth-endpoints.config.json')
    )) ?? {}

  const baseUrl = options.baseUrlOverride ?? config.baseUrl ?? null
  if (!baseUrl) {
    return {
      audit: 'unauth-endpoints',
      rule: 'R12',
      passed: true,
      skipped: true,
      skipReason: 'no baseUrl provided (set via config or --base-url)',
      findings: [],
      durationMs: Date.now() - start,
    }
  }

  const appDir = resolve(rootDir, config.appDir ?? 'app')
  const allowlist = new Set(
    (config.publicAllowlist ?? []).map((entry) => normalisePath(entry.path))
  )
  const allowlistJustifications = new Map(
    (config.publicAllowlist ?? []).map((entry) => [
      normalisePath(entry.path),
      entry.justification,
    ])
  )
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const fieldThreshold = config.dataFieldThreshold ?? DEFAULT_FIELD_THRESHOLD

  // Discover every route handler.
  const handlerFiles = await walkFiles(appDir, {
    extensions: ['route.ts', 'route.tsx', 'route.js', 'route.mjs'],
  })
  const routes = handlerFiles.map((f) => fileToRoutePath(appDir, f))
  if (routes.length === 0) {
    return {
      audit: 'unauth-endpoints',
      rule: 'R12',
      passed: true,
      skipped: true,
      skipReason: `no app/api routes found under ${config.appDir ?? 'app'}`,
      findings: [],
      durationMs: Date.now() - start,
    }
  }

  const findings: AuditFinding[] = []
  const cleanedBaseUrl = baseUrl.replace(/\/+$/, '')

  for (const route of routes) {
    if (allowlist.has(route)) {
      // Sanity warn: the route is declared public but we still hit it once to
      // make sure it 200s. A 5xx on a declared-public endpoint is a smell.
      const probe = await fetchProbe(cleanedBaseUrl + route, {
        timeoutMs,
        userAgent,
      })
      if (probe.status !== null && probe.status >= 500) {
        findings.push({
          severity: 'warn',
          message: `declared-public route ${route} returned 5xx`,
          file: route,
          detail: `status=${probe.status}; justification="${allowlistJustifications.get(route) ?? ''}"`,
        })
      }
      continue
    }

    const probe = await fetchProbe(cleanedBaseUrl + route, {
      timeoutMs,
      userAgent,
    })

    if (probe.status === null) {
      findings.push({
        severity: 'warn',
        message: `${route} did not respond`,
        file: route,
        detail: probe.error ?? 'no response',
      })
      continue
    }

    // 401/403 = auth gate firing as required. Pass.
    if (probe.status === 401 || probe.status === 403) continue
    // 404 / 405 = route declines GET. Acceptable — handler exists for another verb.
    if (probe.status === 404 || probe.status === 405) continue
    // 5xx is a fail but the runtime test (route-smoke) covers that — treat as warn here.
    if (probe.status >= 500) {
      findings.push({
        severity: 'warn',
        message: `${route} returned 5xx`,
        file: route,
        detail: `status=${probe.status}`,
      })
      continue
    }

    // 2xx without auth → run the data-bearing heuristic.
    if (probe.status >= 200 && probe.status < 300) {
      const body = probe.body ?? ''
      const looksLikeAuthGuard = AUTH_GUARD_PATTERNS.some((re) => re.test(body))
      if (looksLikeAuthGuard) continue
      const fieldCount = countJsonFields(body)
      if (fieldCount > fieldThreshold) {
        findings.push({
          severity: 'fail',
          message: `${route} returns data anonymously (${fieldCount} fields, status ${probe.status})`,
          file: route,
          detail: truncate(body, 200),
        })
      }
    }
  }

  return {
    audit: 'unauth-endpoints',
    rule: 'R12',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}

/** Convert `<appDir>/api/foo/bar/route.ts` → `/api/foo/bar`. */
function fileToRoutePath(appDir: string, file: string): string {
  const rel = file.slice(appDir.length).split(sep).join('/')
  // Strip leading slash + `route.ts(x|.js|.mjs)` suffix.
  const withoutLeading = rel.startsWith('/') ? rel.slice(1) : rel
  return `/${withoutLeading.replace(/\/route\.(ts|tsx|js|mjs)$/, '')}`
}

function normalisePath(p: string): string {
  return p.startsWith('/') ? p : `/${p}`
}

interface ProbeResult {
  status: number | null
  body: string | null
  error: string | null
}

async function fetchProbe(
  url: string,
  opts: { timeoutMs: number; userAgent: string }
): Promise<ProbeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': opts.userAgent,
        Accept: 'application/json,text/plain;q=0.5,*/*;q=0.1',
      },
      redirect: 'manual',
      signal: controller.signal,
    })
    let body: string | null = null
    try {
      body = await response.text()
    } catch {
      body = null
    }
    return { status: response.status, body, error: null }
  } catch (err) {
    return {
      status: null,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

function countJsonFields(body: string): number {
  try {
    const parsed = JSON.parse(body)
    if (Array.isArray(parsed)) {
      // Treat first element as the shape proxy.
      return typeof parsed[0] === 'object' && parsed[0] !== null
        ? Object.keys(parsed[0] as Record<string, unknown>).length
        : 0
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.keys(parsed as Record<string, unknown>).length
    }
    return 0
  } catch {
    return 0
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}
