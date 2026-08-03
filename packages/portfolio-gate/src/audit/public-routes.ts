/**
 * Public-route reachability audit — can a visitor with no session actually REACH the pages we
 * publish?
 *
 * WHY THIS EXISTS. This is the browser-facing twin of the machine-routes audit, and it exists
 * because that audit's sibling failure was found in production with every automated check green.
 *
 * ExecutorAI shipped `/for-advisers`, a public marketing page, and did not add it to the
 * middleware's public allowlist. Every visitor was 307'd to `/login`. What makes it worth a
 * dedicated check is how thoroughly it defeated the obvious verification:
 *
 *   - `curl -L` FOLLOWED the redirect and returned **200**.
 *   - The deploy gate's `--app-marker` assertion PASSED, because the login page carries the
 *     product name too.
 *   - `portfolio-gate-deploy-status` went green on the commit containing the bug — correctly,
 *     since production genuinely was running the expected SHA.
 *
 * So status-code checks, marker checks and deploy-SHA checks can all pass over a public page that
 * nobody can open. The only thing that exposed it was refusing to follow the redirect.
 *
 * THE ASSERTION, therefore: a route marked `@public-route` must answer **directly** — not via a
 * redirect. `redirect: 'manual'` is the entire point of this file; following redirects is what
 * hides the bug.
 *
 * WHY NOT `probeOnce` (@caistech/health-probe), which this package uses for route smoke: it
 * returns `{status}` only, by design. A useful failure here has to name WHERE the visitor was
 * sent, which needs the Location header. `src/smoke/auth.ts` already uses raw fetch with
 * `redirect: 'manual'` for the same reason, so this follows in-package precedent rather than
 * forking the shared transport.
 *
 * SCOPE, deliberately narrow — mirrors machine-routes: only routes carrying the marker are
 * checked, because "is this page meant to be public?" is not statically decidable. The marker is
 * still something a person must remember, but it lives in the page file they are already editing
 * rather than in an allowlist in another directory — which is precisely the distance that caused
 * the bug.
 *
 * SKIPS when no routes are marked (genuine non-applicability). FAILS when routes ARE marked but
 * no base URL was supplied — a check that quietly does nothing is indistinguishable from one that
 * passed, which is the failure this package exists to end.
 */
import { resolve, relative } from 'node:path'
import { type AuditFinding, type AuditResult, readFileOptional, walkFiles } from './shared.js'
import { urlPathForRoute } from './machine-routes.js'

export const PUBLIC_MARKER = '@public-route'

const APP_DIRS = ['src/app', 'app']
const DEFAULT_TIMEOUT_MS = 15_000
const USER_AGENT = 'portfolio-gate-public-routes/1.0'

/** Paths that a redirect landing on almost certainly means "you were bounced to auth". */
const AUTH_PATH = /\/(login|signin|sign-in|auth|admin\/login|register)(\/|\?|$)/i

export interface PublicRoutesOptions {
  rootDir?: string
  /** Public production/preview origin to probe. Required once any route is marked. */
  baseUrl?: string
  timeoutMs?: number
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export interface PublicRouteProbe {
  urlPath: string
  file: string
  status: number | null
  location: string | null
  error?: string
}

/**
 * Probe one path WITHOUT following redirects.
 *
 * Never throws — a network error becomes a probe with `error` set, which the caller reports as a
 * failure rather than an exception, so one unreachable route cannot abort the whole audit.
 */
export async function probePublicRoute(
  baseUrl: string,
  urlPath: string,
  file: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<PublicRouteProbe & { body: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${baseUrl.replace(/\/+$/, '')}${urlPath}`
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual', // THE point of this audit — following it is what hid the bug.
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' },
    })
    let body = ''
    try {
      body = (await res.text()).slice(0, 200_000)
    } catch {
      // A body we cannot read does not invalidate the status assertion, which is the verdict.
    }
    return {
      urlPath,
      file,
      status: res.status,
      location: res.headers.get('location'),
      body,
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `no response within ${timeoutMs}ms`
        : ((err as Error)?.message ?? 'network error')
    return { urlPath, file, status: null, location: null, error: reason, body: '' }
  } finally {
    clearTimeout(timer)
  }
}

/** Collect every `page.*` under an app dir that carries the public marker. */
export async function findMarkedPublicRoutes(
  rootDir: string
): Promise<{ file: string; urlPath: string }[]> {
  const marked: { file: string; urlPath: string }[] = []
  for (const appDir of APP_DIRS) {
    const abs = resolve(rootDir, appDir)
    let files: string[] = []
    try {
      files = await walkFiles(abs, { extensions: ['.ts', '.tsx', '.js', '.jsx'] })
    } catch {
      continue // app dir absent
    }
    for (const file of files) {
      if (!/[\\/]page\.(ts|tsx|js|jsx)$/.test(file)) continue
      const src = await readFileOptional(file)
      if (!src || !src.includes(PUBLIC_MARKER)) continue
      marked.push({ file: relative(rootDir, file), urlPath: urlPathForRoute(rootDir, appDir, file) })
    }
  }
  return marked
}

export async function runPublicRoutesAudit(
  options: PublicRoutesOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const findings: AuditFinding[] = []

  const marked = await findMarkedPublicRoutes(rootDir)

  if (marked.length === 0) {
    return {
      audit: 'public-routes',
      rule: 'R1',
      passed: true,
      skipped: true,
      skipReason:
        `No pages marked ${PUBLIC_MARKER}. If this repo publishes marketing or landing pages, ` +
        `mark them — an unmarked public page silently gated by auth middleware is exactly what ` +
        `this audit exists to catch, and it will pass every status-code check while doing it.`,
      findings,
      durationMs: Date.now() - start,
    }
  }

  if (!options.baseUrl) {
    return {
      audit: 'public-routes',
      rule: 'R1',
      passed: false,
      findings: [
        {
          severity: 'fail',
          message: `${marked.length} route(s) marked ${PUBLIC_MARKER} but no base URL was supplied — reachability was NOT verified.`,
          detail:
            'Pass --base-url <public production or preview origin>, or PORTFOLIO_GATE_PREVIEW_URL / ' +
            'PUBLIC_ALIAS in the environment. This FAILS rather than skips: an unverified public ' +
            'page is the bug, and a check that quietly does nothing looks identical to one that passed.',
        },
      ],
      durationMs: Date.now() - start,
    }
  }

  for (const route of marked) {
    const probe = await probePublicRoute(options.baseUrl, route.urlPath, route.file, {
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    })

    if (probe.error) {
      findings.push({
        severity: 'fail',
        message: `${route.urlPath} could not be reached: ${probe.error}`,
        file: route.file,
      })
      continue
    }

    const status = probe.status ?? 0

    if (status >= 300 && status < 400) {
      const target = probe.location ?? '(no Location header)'
      const looksLikeAuth = probe.location ? AUTH_PATH.test(probe.location) : false
      findings.push({
        severity: 'fail',
        message: `${route.urlPath} is marked public but answered ${status} → ${target}`,
        file: route.file,
        detail: looksLikeAuth
          ? 'The page is auth-gated: an unauthenticated visitor is redirected to a login page. Add ' +
            'this path to the public allowlist in your middleware. Note that `curl -L`, an HTTP ' +
            'status check and an app-marker assertion would ALL pass here, because the login page ' +
            'answers 200 and carries the product name.'
          : 'A public page must answer directly. A redirect may be benign (a trailing-slash or ' +
            'canonical-host rewrite) — if so, mark the canonical path instead of this one.',
      })
      continue
    }

    if (status !== 200) {
      findings.push({
        severity: 'fail',
        message: `${route.urlPath} is marked public but answered ${status}.`,
        file: route.file,
      })
      continue
    }

    // Secondary signal. A 200 can still be the login page when auth is enforced in the component
    // rather than the middleware. Detect a PASSWORD INPUT rather than the words "sign in" — a
    // marketing page routinely links to sign-in, but should never contain a password field.
    // Reported as a warning, not a failure: a repo may legitimately mark its own /login public.
    if (/type\s*=\s*["']password["']/i.test(probe.body)) {
      findings.push({
        severity: 'warn',
        message: `${route.urlPath} answered 200 but the response contains a password field.`,
        file: route.file,
        detail:
          'That is what a login page looks like. If this route really is a sign-in surface, the ' +
          'warning is expected. Otherwise the page is gated in the component rather than the ' +
          'middleware, and a visitor never sees the content.',
      })
    }
  }

  return {
    audit: 'public-routes',
    rule: 'R1',
    passed: !findings.some((f) => f.severity === 'fail'),
    findings,
    durationMs: Date.now() - start,
  }
}
