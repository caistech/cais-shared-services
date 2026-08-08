/**
 * Flag-coherence audit — is the live site entirely in ONE mode, or half-flipped?
 *
 * WHY THIS EXISTS. On 8 August 2026 MMC Build opened for business by setting one environment
 * variable, `NEXT_PUBLIC_PURCHASE_CTA_ENABLED=true`. Eight surfaces switched from "Join Waitlist"
 * to "Get started". **Two did not, because they had never been wired to the flag** — including the
 * homepage hero, the single largest button on the site, which went on offering a waitlist and
 * pointing at a contact form on a site that had just started selling.
 *
 * Every signal was green and every signal was correct: the build passed, the deploy succeeded, the
 * variable was set in both projects, and all thirteen public pages returned 200. `deploy-status`
 * would have passed, `public-routes` would have passed, `first-paint` would have passed. A feature
 * flag can only switch the surfaces somebody remembered to attach to it, and **there is no error
 * for the one they forgot.**
 *
 * It is not a one-off. It is the fourth instance in a week of a single shape: the control is
 * changed and the words around it are left saying something that is no longer true.
 *
 * ⚠️ TWO DESIGN DECISIONS CARRY THE WHOLE CHECK, and the obvious implementation gets both wrong.
 *
 * 1. IT DETECTS THE MODE RATHER THAN BEING TOLD IT. The obvious design is a config saying "the
 *    site should be in purchase mode" — which then has to be edited at flip time, the exact moment
 *    nobody wants to stop and update a test, and which is silent about a ROLLBACK that strands
 *    purchase copy behind restored waitlist copy. Since flipping such a flag back is usually the
 *    fastest rollback a product has, guarding only one direction guards the wrong half. Instead:
 *    score each declared mode by its markers across all pages, take the winner, and assert nothing
 *    from another mode survives. No edit at flip time, both directions covered.
 *
 * 2. IT MATCHES THE SHORTEST DISTINGUISHING TOKEN, NEVER A PHRASE. This is the trap that hid the
 *    original bug for an hour from the person looking straight at it: a grep of the live HTML for
 *    `join waitlist` returned **zero** while "Join THE Waitlist" sat in the hero. A phrase proves
 *    only that one wording is absent. Config must therefore carry `waitlist`, not any phrase built
 *    around it — and this file cannot enforce that, so it is stated loudly in the config comment.
 *
 * A stale config FAILS rather than passes. If none of a flag's markers appear anywhere, the check
 * has quietly stopped guarding the thing it was written for — an assertion that no longer matches
 * reality reads as green forever, which is worse than having no assertion at all.
 *
 * Raw HTML is searched, not rendered text: it over-counts (a term may appear in the RSC payload as
 * well as the markup) and never under-counts, which is the safe direction for a check whose whole
 * job is to prove ABSENCE.
 *
 * Config: `flag-coherence.config.json` in the repo root. No config → SKIP (a product with no
 * user-visible mode flags genuinely has nothing to assert, unlike a missing deploy target).
 */
import { join } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
} from './shared.js'

export interface FlagMode {
  /** Strings that appear ONLY when this mode is active. Used to detect the live mode. */
  markers: string[]
  /** Strings that must NOT survive while this mode is active. Shortest token, never a phrase. */
  forbidden?: string[]
}

export interface FlagSpec {
  /** Human name, ideally naming the env var, so a failure says what to flip. */
  name: string
  modes: Record<string, FlagMode>
}

export interface FlagCoherenceSite {
  name: string
  baseUrl: string
  /** Paths to fetch, relative to baseUrl. */
  pages: string[]
  flags: FlagSpec[]
}

export interface FlagCoherenceConfig {
  sites: FlagCoherenceSite[]
}

export interface FlagCoherenceOptions {
  cwd?: string
  configPath?: string | null
  /** Injected for tests, so the pure logic can be exercised without network. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface Doc {
  path: string
  html: string
}

/** Case-insensitive count of non-overlapping occurrences. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  let count = 0
  let from = 0
  for (;;) {
    const at = h.indexOf(n, from)
    if (at === -1) return count
    count += 1
    from = at + n.length
  }
}

/**
 * Which mode is the site in? Returns `null` when nothing scores (stale config) and
 * `'__ambiguous__'` on a tie — the site showing two modes equally IS the defect, so it is reported
 * rather than resolved by picking one.
 */
export function detectMode(modes: Record<string, FlagMode>, docs: Doc[]): string | null {
  const scores = Object.entries(modes).map(([name, mode]) => ({
    name,
    total: (mode.markers ?? []).reduce(
      (sum, marker) => sum + docs.reduce((s, d) => s + countOccurrences(d.html, marker), 0),
      0,
    ),
  }))
  scores.sort((a, b) => b.total - a.total)
  const best = scores[0]
  if (!best || best.total === 0) return null
  if (scores[1] && scores[1].total === best.total) return '__ambiguous__'
  return best.name
}

export interface Violation {
  path: string
  term: string
  count: number
  context: string
}

/**
 * Every surviving occurrence of a term the active mode forbids, WITH context.
 *
 * The context is not decoration. On the day, the count said something was wrong and the snippet
 * said what — that the survivor was a hero button pointing at /contact rather than an incidental
 * mention in a footer. A bare number sends somebody hunting through thirteen pages.
 */
export function findViolations(
  activeMode: string,
  modes: Record<string, FlagMode>,
  docs: Doc[],
): Violation[] {
  const forbidden = modes[activeMode]?.forbidden ?? []
  const out: Violation[] = []
  for (const doc of docs) {
    for (const term of forbidden) {
      const count = countOccurrences(doc.html, term)
      if (count === 0) continue
      const at = doc.html.toLowerCase().indexOf(term.toLowerCase())
      const context = doc.html
        .slice(Math.max(0, at - 70), at + term.length + 70)
        .replace(/\s+/g, ' ')
        .trim()
      out.push({ path: doc.path, term, count, context })
    }
  }
  return out
}

export async function runFlagCoherenceAudit(
  options: FlagCoherenceOptions = {},
): Promise<AuditResult> {
  const started = Date.now()
  const cwd = options.cwd ?? process.cwd()
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 20_000
  const findings: AuditFinding[] = []

  const configPath = options.configPath ?? join(cwd, 'flag-coherence.config.json')
  const config = await loadConfigOptional<FlagCoherenceConfig>(configPath)

  if (!config || !config.sites?.length) {
    return {
      audit: 'flag-coherence',
      rule: 'flag-coherence',
      passed: true,
      skipped: true,
      skipReason:
        'no flag-coherence.config.json — this product declares no user-visible mode flags',
      findings: [],
      durationMs: Date.now() - started,
    }
  }

  for (const site of config.sites) {
    const docs: Doc[] = []
    for (const path of site.pages) {
      const url = new URL(path, site.baseUrl).toString()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await doFetch(url, { signal: controller.signal, redirect: 'follow' })
        const html = await res.text()
        if (res.status !== 200) {
          findings.push({
            severity: 'fail',
            message: `${site.name}: ${path} answered ${res.status}`,
            detail:
              'An unreachable page is deliberately not a pass — a check that quietly does ' +
              'nothing is indistinguishable from one that succeeded.',
          })
          continue
        }
        docs.push({ path, html })
      } catch (e) {
        findings.push({
          severity: 'fail',
          message: `${site.name}: ${path} could not be read`,
          detail: e instanceof Error ? e.message : String(e),
        })
      } finally {
        clearTimeout(timer)
      }
    }

    if (docs.length === 0) {
      findings.push({
        severity: 'fail',
        message: `${site.name}: no pages could be read`,
      })
      continue
    }

    for (const flag of site.flags) {
      const mode = detectMode(flag.modes, docs)

      if (mode === null) {
        findings.push({
          severity: 'fail',
          message: `${site.name}: "${flag.name}" — no declared mode matched the live site`,
          detail:
            'None of the configured markers appear anywhere, so this check has stopped guarding ' +
            'what it was written for. A stale assertion reads as green forever. Update the config.',
        })
        continue
      }

      if (mode === '__ambiguous__') {
        findings.push({
          severity: 'fail',
          message: `${site.name}: "${flag.name}" — markers for two modes are equally present`,
          detail: 'The site is showing both modes at once, which is the defect itself.',
        })
        continue
      }

      for (const v of findViolations(mode, flag.modes, docs)) {
        findings.push({
          severity: 'fail',
          message:
            `${site.name}: "${flag.name}" is HALF-FLIPPED — site is in "${mode}" mode but ` +
            `"${v.term}" still appears ${v.count}x on ${v.path}`,
          file: v.path,
          detail: `…${v.context}…`,
        })
      }
    }
  }

  return {
    audit: 'flag-coherence',
    rule: 'flag-coherence',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - started,
  }
}
