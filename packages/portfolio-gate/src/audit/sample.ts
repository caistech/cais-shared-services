/**
 * Sample artefact presence audit — Portfolio Standard R14 enforcement.
 *
 * Static + dynamic. FAILs if NONE of the following exist:
 *   - `app/sample/page.tsx`
 *   - `app/demo/page.tsx`
 *   - `app/sample-report/page.tsx`
 *   - a `<SampleArtefact>` import on the homepage (`app/page.tsx`)
 *
 * If `baseUrl` is provided, also curls the sample URL and confirms it 200s.
 *
 * INTERNAL_ONLY products (no public landing) can opt out via
 * `sample.config.{ts,json}` with `{ internalOnly: true }`.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R14.
 */
import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
  readFileOptional,
  relativeTo,
} from './shared.js'

export interface SampleAuditConfig {
  /** Set true if the product has no public landing — exempts from R14. */
  internalOnly?: boolean
  /**
   * Override the list of candidate sample paths (App Router page files,
   * repo-relative). Default covers the standard four locations.
   */
  candidatePaths?: string[]
  /** Path to the App Router root. Default: `app`. */
  appDir?: string
  /** Where to look for `<SampleArtefact>` import. Default: `app/page.tsx`. */
  homepageFile?: string
  /** Optional preview deploy URL — if set, GETs the sample URL too. */
  baseUrl?: string
  /** URL path of the sample to GET (default: derives from whichever exists). */
  sampleUrl?: string
  /** Per-request timeout (ms). Default: 15000. */
  timeoutMs?: number
  /** Override the User-Agent header. */
  userAgent?: string
}

export interface SampleAuditOptions {
  rootDir?: string
  configPath?: string | null
  baseUrlOverride?: string | null
}

const DEFAULT_CANDIDATES = [
  'app/sample/page.tsx',
  'app/demo/page.tsx',
  'app/sample-report/page.tsx',
  'app/sample/page.ts',
  'app/demo/page.ts',
]
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_USER_AGENT = '@caistech/portfolio-gate sample-audit/0.2'

export async function runSampleAudit(
  options: SampleAuditOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<SampleAuditConfig>(
      options.configPath ?? resolve(rootDir, 'sample.config.json')
    )) ?? {}

  if (config.internalOnly) {
    return {
      audit: 'sample-artefact',
      rule: 'R14',
      passed: true,
      skipped: true,
      skipReason: 'internalOnly product — exempt per config',
      findings: [],
      durationMs: Date.now() - start,
    }
  }

  const candidates = config.candidatePaths ?? DEFAULT_CANDIDATES
  const findings: AuditFinding[] = []
  const foundCandidates: string[] = []

  for (const candidate of candidates) {
    const absolute = resolve(rootDir, candidate)
    try {
      await stat(absolute)
      foundCandidates.push(candidate)
    } catch {
      // file missing — keep looking
    }
  }

  // Fallback: check the homepage for a `<SampleArtefact>` import.
  let homepageHasImport = false
  const homepageFile = config.homepageFile ?? 'app/page.tsx'
  const homepageAbsolute = resolve(rootDir, homepageFile)
  const homepageContent = await readFileOptional(homepageAbsolute)
  if (homepageContent) {
    // Tolerant of `SampleArtefact`, `<SampleArtefact`, `SampleReport`, etc.
    homepageHasImport = /SampleArtefact|SampleReport|SampleOutput/.test(homepageContent)
  }

  if (foundCandidates.length === 0 && !homepageHasImport) {
    findings.push({
      severity: 'fail',
      message:
        'no sample artefact found — expected one of app/sample, app/demo, app/sample-report, or a <SampleArtefact> import on the homepage',
      file: relativeTo(rootDir, homepageAbsolute),
      detail: `searched: ${candidates.join(', ')}`,
    })
  }

  // Optional dynamic check.
  const baseUrl = options.baseUrlOverride ?? config.baseUrl ?? null
  if (baseUrl && (foundCandidates.length > 0 || config.sampleUrl)) {
    const sampleUrl = config.sampleUrl ?? `/${foundCandidates[0]?.replace(/^app\//, '').replace(/\/page\.(tsx|ts)$/, '') ?? 'sample'}`
    const fullUrl = `${baseUrl.replace(/\/+$/, '')}${sampleUrl.startsWith('/') ? sampleUrl : `/${sampleUrl}`}`
    const probe = await fetchProbe(fullUrl, {
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    })
    if (probe.status === null) {
      findings.push({
        severity: 'warn',
        message: `sample URL did not respond: ${fullUrl}`,
        detail: probe.error ?? 'no response',
      })
    } else if (probe.status < 200 || probe.status >= 400) {
      findings.push({
        severity: 'fail',
        message: `sample URL ${sampleUrl} returned ${probe.status}`,
        detail: fullUrl,
      })
    }
  }

  return {
    audit: 'sample-artefact',
    rule: 'R14',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}

interface ProbeResult {
  status: number | null
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
      headers: { 'User-Agent': opts.userAgent, Accept: 'text/html' },
      redirect: 'manual',
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
