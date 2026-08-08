/**
 * Sibling-parity audit — things that must be true in MORE THAN ONE PLACE at once.
 *
 * WHY THIS EXISTS. Three separate incidents in one week, all the same structural fact:
 *
 *   1. **A feature flag switched eight surfaces and not the ninth.** The variable was set in both
 *      Vercel projects; one surface had never been wired to it.
 *   2. **A Stripe tax registration was configured in one mode and not the other.** Test and live
 *      are separate stores; the dashboard looks identical in both.
 *   3. **Web analytics was enabled for two projects, and one repo had no analytics component.**
 *      The toggle was on, the dashboard agreed, and the site had nothing to send.
 *
 * None of these were carelessness, and that is the point. In each case **a setting and the code it
 * depends on lived in different places, and only one of them was visible from where the person was
 * standing.** Every one looked green from the side you could see. There is no error for a thing
 * that is missing somewhere you are not looking.
 *
 * Existing checks in this package all interrogate ONE deployment. This one interrogates the
 * relationship between two, which is where that class of failure lives.
 *
 * THREE ASSERTIONS, each mechanical and none requiring judgement:
 *
 *   - `identicalFiles` — a file that is byte-identical BY DESIGN across sibling repos really is.
 *     MMC's `purchase-cta.ts` was verified by hand with `diff` when it was written, which works
 *     exactly once; the two pricing pages had already drifted apart before anyone noticed.
 *   - `sharedDependencies` — a package present in every sibling that needs it. This is incident 3
 *     precisely: `@vercel/analytics` in one repo, absent from the other, toggle on in both.
 *   - `parityPaths` — a URL that must answer the SAME status on every sibling site. Analytics was
 *     200 on the app and 404 on the marketing site for a day, and nothing said so.
 *
 * ⚠️ PARTIAL RUNS ARE REPORTED, NEVER SILENTLY PASSED. In CI usually only one sibling repo is
 * checked out, so the file and dependency comparisons cannot run — but the live parity checks need
 * no checkout and still can. The audit therefore runs what it can, SKIPS what it cannot, and says
 * which was which. A half-run reported as a pass is the exact failure this package exists to end.
 */
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
} from './shared.js'

export interface SiblingRepo {
  name: string
  /** Path to the repo root, relative to cwd or absolute. */
  path: string
}

export interface SiblingSite {
  name: string
  baseUrl: string
}

export interface SiblingGroup {
  name: string
  repos?: SiblingRepo[]
  sites?: SiblingSite[]
  /** Paths (relative to each repo root) that must be byte-identical across every repo. */
  identicalFiles?: string[]
  /** Packages that must appear in every repo's package.json. */
  sharedDependencies?: string[]
  /** URL paths that must return the SAME status code on every site. */
  parityPaths?: string[]
}

export interface SiblingParityConfig {
  siblings: SiblingGroup[]
}

export interface SiblingParityOptions {
  cwd?: string
  configPath?: string | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** Present in dependencies, devDependencies or peerDependencies. */
export function hasDependency(packageJson: string, name: string): boolean {
  try {
    const pkg = JSON.parse(packageJson) as Record<string, Record<string, string> | undefined>
    return Boolean(
      pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name],
    )
  } catch {
    return false
  }
}

export async function runSiblingParityAudit(
  options: SiblingParityOptions = {},
): Promise<AuditResult> {
  const started = Date.now()
  const cwd = options.cwd ?? process.cwd()
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 20_000
  const findings: AuditFinding[] = []

  const configPath = options.configPath ?? join(cwd, 'sibling-parity.config.json')
  const config = await loadConfigOptional<SiblingParityConfig>(configPath)

  if (!config || !config.siblings?.length) {
    return {
      audit: 'sibling-parity',
      rule: 'sibling-parity',
      passed: true,
      skipped: true,
      skipReason: 'no sibling-parity.config.json — this product declares no siblings',
      findings: [],
      durationMs: Date.now() - started,
    }
  }

  for (const group of config.siblings) {
    /* ---------------------------------------------------------- repo-side checks */
    const repos = group.repos ?? []
    const resolved = await Promise.all(
      repos.map(async (r) => ({
        ...r,
        root: resolve(cwd, r.path),
        pkg: await readIfPresent(join(resolve(cwd, r.path), 'package.json')),
      })),
    )
    const present = resolved.filter((r) => r.pkg !== null)
    const missing = resolved.filter((r) => r.pkg === null)

    // Say so rather than quietly checking nothing. In CI only one sibling is usually
    // checked out — that is expected, but it must be visible in the output, because a
    // comparison that silently compared one thing to itself would always pass.
    if (missing.length > 0 && (group.identicalFiles?.length || group.sharedDependencies?.length)) {
      findings.push({
        severity: 'warn',
        message:
          `${group.name}: repo comparison SKIPPED for ${missing.map((m) => m.name).join(', ')} ` +
          '(not checked out here)',
        detail:
          'File and dependency parity need every sibling on disk. The live parity checks below ' +
          'still ran. Run this locally, or check out the siblings in CI, for the full comparison.',
      })
    }

    if (present.length >= 2) {
      for (const dep of group.sharedDependencies ?? []) {
        const without = present.filter((r) => !hasDependency(r.pkg as string, dep))
        if (without.length === 0 || without.length === present.length) continue
        findings.push({
          severity: 'fail',
          message: `${group.name}: "${dep}" is in ${present.length - without.length} of ${present.length} siblings`,
          detail:
            `Missing from: ${without.map((r) => r.name).join(', ')}. ` +
            'A dependency present in one sibling and absent from another is how a switch gets ' +
            'turned on for both and only one of them can respond.',
        })
      }

      for (const rel of group.identicalFiles ?? []) {
        const contents = await Promise.all(
          present.map(async (r) => ({ name: r.name, body: await readIfPresent(join(r.root, rel)) })),
        )
        const found = contents.filter((c) => c.body !== null)
        const absent = contents.filter((c) => c.body === null)
        if (absent.length > 0 && found.length > 0) {
          findings.push({
            severity: 'fail',
            message: `${group.name}: "${rel}" exists in some siblings and not others`,
            file: rel,
            detail: `Missing from: ${absent.map((c) => c.name).join(', ')}`,
          })
          continue
        }
        if (found.length < 2) continue
        const first = found[0]
        const differing = found.slice(1).filter((c) => c.body !== first.body)
        if (differing.length === 0) continue
        findings.push({
          severity: 'fail',
          message: `${group.name}: "${rel}" has DRIFTED between siblings`,
          file: rel,
          detail:
            `Differs between ${first.name} and ${differing.map((c) => c.name).join(', ')}. ` +
            'This file is declared identical by design — verifying that by hand works exactly ' +
            'once, which is why it is declared here instead.',
        })
      }
    }

    /* ---------------------------------------------------------- live-side checks */
    const sites = group.sites ?? []
    if (sites.length >= 2) {
      for (const path of group.parityPaths ?? []) {
        const statuses: Array<{ name: string; status: number | null; error?: string }> = []
        for (const site of sites) {
          // One retry. A single transient failure is common enough that treating it as evidence
          // would make this check noisy, and a noisy check gets switched off.
          let status: number | null = null
          let error: string | undefined
          for (let attempt = 0; attempt < 2 && status === null; attempt += 1) {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), timeoutMs)
            try {
              const res = await doFetch(new URL(path, site.baseUrl).toString(), {
                signal: controller.signal,
                redirect: 'manual',
              })
              status = res.status
            } catch (e) {
              error = e instanceof Error ? e.message : String(e)
            } finally {
              clearTimeout(timer)
            }
          }
          statuses.push({ name: site.name, status, error })
        }

        // ⚠️ A FAILED FETCH IS NOT A STATUS, and conflating the two is the flaw the first real run
        // of this audit exposed: a transient network failure on one site came back as `0`, was
        // compared against the other site's `200`, and reported as a parity defect. The two sites
        // were configured identically. Reporting a network blip as a configuration fault is how a
        // check earns a reputation for crying wolf and stops being trusted — so an unreachable
        // sibling is INCONCLUSIVE (warn), never a difference.
        const unreachable = statuses.filter((s) => s.status === null)
        if (unreachable.length > 0) {
          findings.push({
            severity: 'warn',
            message: `${group.name}: "${path}" could not be compared — ${unreachable
              .map((s) => s.name)
              .join(', ')} unreachable after a retry`,
            detail:
              (unreachable[0]?.error ?? 'no response') +
              '. Reported as inconclusive rather than as a difference: not knowing is not the ' +
              'same as knowing they differ.',
          })
          continue
        }

        const distinct = new Set(statuses.map((s) => s.status))
        if (distinct.size <= 1) continue
        findings.push({
          severity: 'fail',
          message: `${group.name}: "${path}" answers differently across siblings`,
          detail:
            statuses.map((s) => `${s.name}=${s.status}`).join(', ') +
            '. These sites are meant to be configured alike; a path live on one and missing on ' +
            'another is a setting applied in one place and not the other.',
        })
      }
    }
  }

  return {
    audit: 'sibling-parity',
    rule: 'sibling-parity',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - started,
  }
}
