/**
 * Effect-asserted red-teaming — the half `Probe` cannot express.
 *
 * WHY. The existing `Probe` is single-turn and scores the RESPONSE TEXT against
 * `failureIndicators: RegExp[]`. That is the right instrument for one question — *does this
 * endpoint SAY something it shouldn't* — and the wrong one for the question that actually decides
 * whether a customer was harmed: *could this actor REACH something they shouldn't*. An endpoint
 * that returns a polite refusal and leaks the value in the same body passes a regex and fails the
 * person whose data it was.
 *
 * `RED_TEAM_CANONICAL.md` specifies `ConversationProbe` for the multi-turn case. This is its
 * sibling for the case with no conversation at all: an authorisation boundary, an access-control
 * decision, a redaction rule. Same discipline — **the verdict is computed from the difference, not
 * from the words** — with `attempt` in place of `turns`.
 *
 * PROVENANCE. Written from a live suite in ExecutorAI (2026-08-03) that probed an executor
 * visibility model, a probate-report authorisation route and share-link redaction. Fourteen probes,
 * zero findings — but two of those probes returned HTTP 200 and would have been reported as passes
 * by any status-code check, because the 200 was a "Report not found" page rendering. Only asserting
 * on the served bytes distinguished them. That is the whole argument for this shape.
 *
 * The most valuable probe in that suite is the model to copy: it read `preview_level` from the
 * database, attempted the change as a stranger, and read it again. A response-text check would have
 * passed on the 403 alone without ever confirming that nothing moved.
 */

import type { ProbeCategory, ProbeSeverity } from './types.js'

/**
 * Proof that an identity is safe to attack. NON-NEGOTIABLE.
 *
 * This is the piece `RED_TEAM_CANONICAL.md` calls the most important contribution, and it was
 * absent: `RegisteredEndpoint` has no notion of WHOSE data is at risk. The reason is concrete.
 * Kira's first red-team run pointed at the live business owner's account, because the runner took
 * its identity from an env var and silently ignored the flag that appeared to redirect it. The only
 * thing that stopped an attack landing on 116 real memories was an unrelated ownership check
 * answering 403 — luck, not design.
 *
 * A red-team suite that can reach production causes the class of incident it exists to detect.
 */
export interface Subject {
  id: string
  /**
   * Resolve ONLY for a synthetic identity, and carry the evidence.
   *
   * The product proves it — it is the only party that knows what synthetic means in its own
   * schema — and the package enforces that it was proven. Throw or resolve `synthetic: false` and
   * the runner refuses to send anything.
   */
  assertSynthetic: () => Promise<{ synthetic: boolean; evidence: string }>
}

/** Whatever the product needs in scope to run an attempt — a client, a base URL, credentials. */
export type EffectProbeContext = Record<string, unknown>

export interface EffectVerdict {
  /** True = the boundary survived. */
  held: boolean
  /** Why, in the words of what was actually observed. Shown to a human; keep it concrete. */
  detail: string
}

/**
 * A probe whose verdict comes from observed effect.
 *
 * `S` is whatever snapshot the product takes — a row, a count, a set of bytes. The package never
 * knows the schema; it only knows that a before and an after exist and that the product compares
 * them.
 */
export interface EffectProbe<S = unknown, A = unknown> {
  id: string
  name: string
  category: ProbeCategory
  severity: ProbeSeverity
  description: string

  /**
   * Snapshot whatever the attempt could damage or reveal.
   *
   * Optional, because some boundaries are proven by the response alone (a redaction rule is
   * observable in the served bytes). When it IS supplied, `verdict` must use it — see
   * `assertEffectProbe`.
   */
  observe?: (ctx: EffectProbeContext) => Promise<S>

  /** Do the thing an attacker would do. Return whatever the verdict needs — status, body, both. */
  attempt: (ctx: EffectProbeContext) => Promise<A>

  /** THE VERDICT IS COMPUTED FROM THE DIFFERENCE, NOT FROM THE WORDS. */
  verdict: (args: { attempt: A; before?: S; after?: S }) => EffectVerdict
}

export interface EffectProbeResult {
  probe: Pick<EffectProbe, 'id' | 'name' | 'category' | 'severity' | 'description'>
  held: boolean
  detail: string
  /** Set when the probe threw. A probe that errors is NOT a pass. */
  error?: string
  durationMs: number
}

export interface EffectRunResult {
  subjectId: string
  syntheticEvidence: string
  results: EffectProbeResult[]
  /** Probes where the boundary did NOT hold. */
  findings: EffectProbeResult[]
  passed: boolean
  durationMs: number
}

/**
 * Registration guard.
 *
 * Mirrors the rule the canonical doc sets for `ConversationProbe`: a probe that declares `observe`
 * and then never reads `before`/`after` is a text check wearing an effect check's clothes, and
 * permitting it re-introduces exactly the weakness this shape exists to remove. The check is a
 * source inspection of the verdict function — crude, and still worth more than trusting the author,
 * who in the originating suite was the same person who wrote the code under test.
 */
export function assertEffectProbe(probe: EffectProbe): void {
  if (!probe.id || !probe.attempt || !probe.verdict) {
    throw new Error(`EffectProbe "${probe.id ?? '(no id)'}" needs id, attempt and verdict.`)
  }
  if (probe.observe) {
    const src = probe.verdict.toString()
    if (!/\bbefore\b/.test(src) || !/\bafter\b/.test(src)) {
      throw new Error(
        `EffectProbe "${probe.id}" declares observe() but its verdict never reads before/after. ` +
          `That is a response check wearing an effect check's clothes — either use the snapshot or ` +
          `drop observe().`,
      )
    }
  }
}

/**
 * Run a suite against ONE subject.
 *
 * Refuses to attempt anything until the subject proves it is synthetic. Not a warning, not a
 * flag — a refusal, because the failure it prevents is attacking a real customer.
 */
export async function runEffectProbes(
  probes: EffectProbe[],
  subject: Subject,
  ctx: EffectProbeContext = {},
): Promise<EffectRunResult> {
  const started = Date.now()

  let evidence: string
  try {
    const proof = await subject.assertSynthetic()
    if (!proof?.synthetic) {
      throw new Error(proof?.evidence || 'assertSynthetic() did not confirm a synthetic identity')
    }
    evidence = proof.evidence
  } catch (err) {
    // Deliberately fatal. A suite that "warns and continues" here is a suite that will one day
    // attack a real account, which is the incident it exists to detect.
    throw new Error(
      `REFUSING TO RUN: subject "${subject.id}" is not proven synthetic. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    )
  }

  for (const p of probes) assertEffectProbe(p)

  const results: EffectProbeResult[] = []
  for (const probe of probes) {
    const t0 = Date.now()
    const meta = {
      id: probe.id,
      name: probe.name,
      category: probe.category,
      severity: probe.severity,
      description: probe.description,
    }
    try {
      const before = probe.observe ? await probe.observe(ctx) : undefined
      const attempt = await probe.attempt(ctx)
      const after = probe.observe ? await probe.observe(ctx) : undefined
      const v = probe.verdict({ attempt, before, after })
      results.push({ probe: meta, held: v.held, detail: v.detail, durationMs: Date.now() - t0 })
    } catch (err) {
      // A probe that throws is NOT a pass. Reporting an error as "held" is how a suite goes green
      // while testing nothing — the same failure as a check that silently skips.
      results.push({
        probe: meta,
        held: false,
        detail: 'probe errored before it could establish a verdict',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      })
    }
  }

  const findings = results.filter((r) => !r.held)
  return {
    subjectId: subject.id,
    syntheticEvidence: evidence,
    results,
    findings,
    passed: findings.length === 0,
    durationMs: Date.now() - started,
  }
}

/** Human-readable summary. Findings first — a wall of passes buries the one line that matters. */
export function formatEffectRun(run: EffectRunResult): string {
  const lines: string[] = []
  lines.push(`red-team (effect) — subject ${run.subjectId}`)
  lines.push(`synthetic: ${run.syntheticEvidence}`)
  if (run.findings.length) {
    lines.push('', `${run.findings.length} FINDING(S):`)
    for (const f of run.findings) {
      lines.push(`  [${f.probe.severity}] ${f.probe.id} ${f.probe.name}`)
      lines.push(`      ${f.detail}`)
      if (f.error) lines.push(`      error: ${f.error}`)
    }
  }
  const held = run.results.filter((r) => r.held)
  lines.push('', `${held.length} held, ${run.findings.length} finding(s), ${run.durationMs}ms`)
  return lines.join('\n')
}
