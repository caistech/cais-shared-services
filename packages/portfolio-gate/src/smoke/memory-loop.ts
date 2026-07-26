/**
 * Memory-loop gate — runs `probeMemoryLoop` in every repo that consumes the voice package.
 *
 * WHY THIS LIVES HERE AND NOT IN EACH REPO
 *
 * `probeMemoryLoop` shipped in @caistech/elevenlabs-convai 0.7.0 as the guard for the class of bug
 * where the agent calls its memory tools and they always return nothing. It ran in ZERO repos. The
 * guard existed; nobody ran it; the bug reached production twice. Asking each repo to remember to
 * wire a probe is the same bet that already lost.
 *
 * portfolio-gate is already installed everywhere and already runs in CI, so putting the probe here
 * makes verification the default rather than an act of discipline. The operator's stated target:
 * *a package bump is verifiable in one command per repo.* This is that command.
 *
 * NOT-APPLICABLE IS NOT FAILURE. A repo with no voice agent skips cleanly (exit 0). The probe only
 * engages where @caistech/elevenlabs-convai is actually a dependency — so this can be added to the
 * shared gate workflow without breaking the repos that have nothing to do with voice.
 *
 * The package is an OPTIONAL peer, imported dynamically: portfolio-gate must not drag a voice stack
 * into repos that don't want one.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface MemoryLoopConfig {
  /**
   * Set FALSE to declare that this product's voice agent holds NO cross-session memory at all —
   * a widget-only in-context clarifier, with no convai webhook routes to probe.
   *
   * This is the ONE thing that turns the runtime probe off, and it exists because the alternative
   * punished honesty. A repo like PartReady — a `VoiceWidget` in one component, no routes, no
   * memory, correctly declaring `semanticMemory: false` — still failed this probe with "no test
   * user id", because there is no test user and nothing to test. Left that way, the only route to
   * a green gate is to delete the check, which is how a gate stops being trusted.
   *
   * It must be an EXPLICIT declaration and is never inferred. Absence of configuration still
   * fails, loudly: a probe that quietly does nothing because a variable is unset is
   * indistinguishable from one that passed, and that ambiguity is the whole reason this exists.
   * Declaring `false` is on the record and reviewable; forgetting to configure it is not.
   *
   * VOICE_MEMORY_STANDARD permits pull-only/transient for a clarifier — this is how that permission
   * gets stated rather than assumed. Revisit the moment the agent is asked to remember anything.
   */
  memoryLoop?: boolean
  /** Deployed app origin, e.g. `https://kira-rho.vercel.app`. Usually from --base-url. */
  baseUrl?: string
  /** Path the convai webhook routes are mounted at. Default `/api/convai/webhooks`. */
  webhookPath?: string
  /**
   * A real test user's id — the server-baked identity the tools carry as `?uid=`.
   * Falls back to env MEMORY_LOOP_UID / QA_TEST_USER_ID.
   */
  uid?: string
  /** Memory table name, for sentinel cleanup. Default `convai_memory`. */
  memoryTable?: string
  /**
   * Assert that a NEW conversation sees the previous one. Default TRUE.
   *
   * This is the check that catches what a user actually reports — coming back and being greeted as
   * a stranger. Turning it off is a real decision: a repo without a start route almost certainly
   * has no working cross-session memory, so a red here is usually a finding rather than a
   * misconfiguration. Set false only when the product genuinely has no connect route.
   */
  expectContinuity?: boolean
  /** Connect route name, relative to the webhook path. Default `start_conversation`. */
  startRoute?: string
  /**
   * Header the product's routes read the tool secret from. Default `x-convai-tool-secret`.
   * Set this where a product named its own (Kira uses `x-kira-tool-secret`) — otherwise the probe
   * 401s against precisely the products that bothered to guard their routes.
   */
  toolSecretHeader?: string
}

export interface MemoryLoopGateResult {
  /** 'pass' | 'fail' | 'skipped' — skipped means the repo doesn't consume the voice package. */
  outcome: 'pass' | 'fail' | 'skipped'
  reason?: string
  checks: { name: string; ok: boolean; detail?: string }[]
}

/**
 * Does THIS repo consume the voice package?
 *
 * Read the consumer's declared dependencies rather than asking whether the module resolves.
 * Resolution is the wrong signal: in a monorepo, or anywhere the package is hoisted, the import
 * succeeds in repos that have nothing to do with voice — so a resolution check would run the probe
 * (and fail it) in repos that should have skipped. Caught doing exactly that during development.
 */
function declaresVoicePackage(cwd: string = process.cwd()): boolean {
  try {
    const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return Boolean(
      pkg.dependencies?.['@caistech/elevenlabs-convai'] ??
        pkg.devDependencies?.['@caistech/elevenlabs-convai'],
    )
  } catch {
    return false
  }
}

export async function runMemoryLoopGate(
  config: MemoryLoopConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<MemoryLoopGateResult> {
  if (!declaresVoicePackage()) {
    return {
      outcome: 'skipped',
      reason: 'no @caistech/elevenlabs-convai dependency — this repo has no voice memory loop',
      checks: [],
    }
  }

  // An EXPLICIT declaration that there is no loop. Not inferred from missing config — see the
  // `memoryLoop` docs above for why that distinction is the whole point.
  if (config.memoryLoop === false) {
    return {
      outcome: 'skipped',
      reason:
        'memoryLoop:false declared in memory-loop.config.json — this product\'s voice agent holds no cross-session memory (widget-only clarifier). Opt-out is on the record.',
      checks: [],
    }
  }

  const baseUrl = config.baseUrl ?? env.MEMORY_LOOP_APP_URL ?? env.PORTFOLIO_GATE_PREVIEW_URL
  const uid = config.uid ?? env.MEMORY_LOOP_UID ?? env.QA_TEST_USER_ID
  const toolSecret = env.CONVAI_TOOL_SECRET ?? env.KIRA_TOOL_WEBHOOK_SECRET
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

  // Missing configuration is a FAILURE, not a skip. A probe that quietly does nothing because a
  // variable is unset is indistinguishable from a probe that passed — which is the exact failure
  // mode this whole exercise exists to end.
  if (!baseUrl) {
    return { outcome: 'fail', reason: 'no base URL (--base-url / MEMORY_LOOP_APP_URL)', checks: [] }
  }
  if (!uid) {
    return {
      outcome: 'fail',
      reason: 'no test user id (config.uid / MEMORY_LOOP_UID / QA_TEST_USER_ID)',
      checks: [],
    }
  }

  const { probeMemoryLoop } = await import('@caistech/elevenlabs-convai/testing')

  // Sentinel cleanup needs a service-role client. Without one the probe still runs and still
  // reports correctly — it just leaves the sentinel behind and says so.
  let supabase: unknown
  if (supabaseUrl && serviceKey) {
    try {
      const mod = (await import('@supabase/supabase-js')) as {
        createClient: (u: string, k: string, o?: unknown) => unknown
      }
      supabase = mod.createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    } catch {
      /* cleanup is best-effort; the probe's verdict does not depend on it */
    }
  }

  const webhookPath = (config.webhookPath ?? '/api/convai/webhooks').replace(/\/$/, '')
  const result = await probeMemoryLoop({
    baseUrl: `${baseUrl.replace(/\/$/, '')}${webhookPath}`,
    uid,
    ...(toolSecret ? { toolSecret } : {}),
    ...(supabase ? { supabase: supabase as never } : {}),
    ...(config.memoryTable ? { memoryTable: config.memoryTable } : {}),
    ...(config.expectContinuity === false ? { expectContinuity: false } : {}),
    ...(config.startRoute ? { startRoute: config.startRoute } : {}),
    ...(config.toolSecretHeader ?? env.CONVAI_TOOL_SECRET_HEADER
      ? { toolSecretHeader: (config.toolSecretHeader ?? env.CONVAI_TOOL_SECRET_HEADER) as string }
      : {}),
  })

  return {
    outcome: result.pass ? 'pass' : 'fail',
    checks: result.checks,
  }
}

/** Human-readable summary for CI output. */
export function formatMemoryLoopResult(result: MemoryLoopGateResult): string {
  if (result.outcome === 'skipped') return `memory-loop: SKIPPED — ${result.reason}`;

  const lines = result.checks.map(
    (c) => `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`,
  )
  const head =
    result.outcome === 'pass'
      ? `memory-loop: PASS (${result.checks.length} checks)`
      : `memory-loop: FAIL${result.reason ? ` — ${result.reason}` : ''}`
  return [head, ...lines].join('\n')
}
