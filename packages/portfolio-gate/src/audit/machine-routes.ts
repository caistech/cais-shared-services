/**
 * Machine-callable route audit — does the Next.js middleware matcher silently swallow the routes
 * that machines call?
 *
 * WHY THIS EXISTS. A Next middleware matcher usually runs on everything except static assets, and
 * a session-refresh middleware redirects anything without a session. Any route called by something
 * that is NOT a browser — a vendor webhook, a cron, a health probe — is therefore redirected to
 * /login unless it was explicitly excluded.
 *
 * The failure is invisible. A 307 is not an error: nothing throws, nothing logs, the caller often
 * follows the redirect and gets a 200 HTML page, and the feature simply never runs. In ExecutorAI
 * this killed the same feature twice in one day — every ElevenLabs call to the convai webhooks was
 * redirected, so no voice memory was ever written or read; then every scheduled run of the
 * retention purge was redirected, so retention never happened. Both looked healthy from outside.
 *
 * The cause is structural rather than careless: the exclusion lives in a regex in middleware.ts,
 * far from the route that depends on it, so nobody adding a machine-called route thinks to update
 * it. This audit moves the requirement ONTO the route — mark it `@machine-callable` — and fails
 * when the matcher would still capture it.
 *
 * SCOPE, deliberately narrow: it only checks routes that carry the marker. It cannot detect an
 * unmarked machine-called route, because "is this called by a browser?" is not statically
 * decidable. The marker is still a thing a person must remember, but it is small, local, and sits
 * in the file they are already editing — rather than a regex in another directory.
 *
 * SKIPS (not fails) when there is no middleware, or no marked routes: both are genuine
 * non-applicability, unlike a missing config. A repo with neither has nothing this can be wrong
 * about.
 */
import { resolve, relative, sep } from 'node:path'
import { type AuditFinding, type AuditResult, readFileOptional, walkFiles } from './shared.js'

export const MACHINE_MARKER = '@machine-callable'

export interface MachineRoutesOptions {
  rootDir?: string
}

/** Candidate middleware locations, in Next's own resolution order. */
const MIDDLEWARE_PATHS = ['middleware.ts', 'middleware.js', 'src/middleware.ts', 'src/middleware.js']

/** Where an App Router app directory may live. */
const APP_DIRS = ['src/app', 'app']

/**
 * Extract every matcher pattern from a middleware file.
 *
 * Handles a bare string (`matcher: "/x"`) and an array of strings, which is what real middleware
 * files use. Returns [] when the matcher cannot be parsed — the caller treats that as "cannot
 * assert" and warns rather than inventing a verdict from a regex it did not understand.
 */
export function extractMatchers(source: string): string[] {
  const block = source.match(/matcher\s*:\s*(\[[\s\S]*?\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
  if (!block) return []
  const raw = block[1]
  const out: string[] = []
  const strings = raw.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)
  for (const m of strings) out.push(m[1] ?? m[2] ?? '')
  return out.filter(Boolean)
}

/** True when any matcher pattern would capture `urlPath` — i.e. middleware runs on it. */
export function matcherCaptures(patterns: string[], urlPath: string): boolean {
  for (const p of patterns) {
    try {
      if (new RegExp('^' + p + '$').test(urlPath)) return true
    } catch {
      // An unparseable pattern is handled by the caller as a warning; ignore it here.
    }
  }
  return false
}

/** `src/app/api/cron/purge/route.ts` → `/api/cron/purge`. Route groups `(app)` are URL-invisible. */
export function urlPathForRoute(rootDir: string, appDir: string, file: string): string {
  const rel = relative(resolve(rootDir, appDir), file).split(sep)
  rel.pop() // drop route.ts
  return '/' + rel.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/')
}

export async function runMachineRoutesAudit(
  options: MachineRoutesOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const findings: AuditFinding[] = []

  let middlewareSource: string | null = null
  let middlewareFile = ''
  for (const candidate of MIDDLEWARE_PATHS) {
    const src = await readFileOptional(resolve(rootDir, candidate))
    if (src !== null) {
      middlewareSource = src
      middlewareFile = candidate
      break
    }
  }

  if (middlewareSource === null) {
    return {
      audit: 'machine-routes',
      rule: 'R1',
      passed: true,
      skipped: true,
      skipReason: 'No Next.js middleware in this repo — nothing can be redirected by a matcher.',
      findings,
      durationMs: Date.now() - start,
    }
  }

  // Collect marked routes across whichever app dir exists.
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
      if (!/[\\/]route\.(ts|tsx|js|jsx)$/.test(file)) continue
      const src = await readFileOptional(file)
      if (!src || !src.includes(MACHINE_MARKER)) continue
      marked.push({ file: relative(rootDir, file), urlPath: urlPathForRoute(rootDir, appDir, file) })
    }
  }

  if (marked.length === 0) {
    return {
      audit: 'machine-routes',
      rule: 'R1',
      passed: true,
      skipped: true,
      skipReason:
        `No routes marked ${MACHINE_MARKER}. If this repo has webhook/cron routes, mark them — ` +
        `an unmarked machine-called route cannot be checked and is exactly what this audit exists to catch.`,
      findings,
      durationMs: Date.now() - start,
    }
  }

  const patterns = extractMatchers(middlewareSource)
  if (patterns.length === 0) {
    findings.push({
      severity: 'warn',
      message: 'Could not parse a matcher from the middleware — machine routes were NOT verified.',
      file: middlewareFile,
      detail:
        'The audit refuses to report a pass it did not establish. Check the matcher by hand, or ' +
        'simplify it to a string/array of string literals so this can assert on it.',
    })
  } else {
    for (const route of marked) {
      if (matcherCaptures(patterns, route.urlPath)) {
        findings.push({
          severity: 'fail',
          message: `${route.urlPath} is marked ${MACHINE_MARKER} but the middleware matcher still captures it.`,
          file: route.file,
          detail:
            'Session middleware will redirect its caller (307 to a login page), so the route ' +
            'silently never runs — and a redirect is not an error, so nothing logs it. Add this ' +
            `path to the negative lookahead in ${middlewareFile}.`,
        })
      }
    }
  }

  return {
    audit: 'machine-routes',
    rule: 'R1',
    passed: !findings.some((f) => f.severity === 'fail'),
    findings,
    durationMs: Date.now() - start,
  }
}
