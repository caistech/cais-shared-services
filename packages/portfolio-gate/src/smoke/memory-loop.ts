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
  /**
   * Which identity model the product's tools use: `uid` (one agent per user, identity baked into the
   * tool URL at provision) or `conversation` (one agent per site, platform-filled conversation id
   * resolved against a connect-time binding). Default `uid`.
   *
   * Both are supported by the package, so a gate that only knows one declares the other broken —
   * which is exactly what happened to SayFix, whose per-site shape is correct and could only ever
   * score red.
   */
  identityMode?: 'uid' | 'conversation'
  /** An already-bound conversation id. Required by `conversation` mode. */
  conversationId?: string
  /**
   * The product's ElevenLabs agent id, for the continuity check. Resolved from `agentsTable` via the
   * service-role client when omitted; the canonical start route needs it and answers "Agent not
   * found" without it.
   */
  agentId?: string
  /** Table names, where a product renamed the canonical `convai_*` set (Kira: `kira_*`). */
  conversationsTable?: string
  agentsTable?: string
  /**
   * ABSOLUTE post-call URL.
   *
   * Previously unreachable through this gate at all: the probe derived post-call as a CHILD of the
   * tool path, which is not where products mount it, and then scored the resulting 404 as "refused".
   * The security check with the most direct consequence was the one that could not be configured.
   */
  postCallUrl?: string
  /** Post-call route relative to the webhook path. Ignored when `postCallUrl` is set. */
  postCallRoute?: string
  /**
   * Post-call path relative to the ORIGIN — the portable way to say "post-call is not under the tool
   * path". Prefer this over `postCallUrl` in a committed config: an absolute URL pins the file to one
   * environment, so it is wrong the moment the gate runs against a preview.
   *
   * Kira is the case that needs it: tools live at `/api/kira/webhooks/*` while post-call is mounted
   * at `/api/convai/webhooks/post-call`, which neither a child route nor a relative `..` can express.
   */
  postCallPath?: string
  /** Set false only with a recorded reason — this is the one check with a live write path behind it. */
  expectPostCallAuth?: boolean
  /**
   * Assert the DISTIL leg (transcript → post-call → next connect). Reads the webhook signing secret
   * from `ELEVENLABS_WEBHOOK_SECRET` when true.
   *
   * Off by default because it performs REAL writes against the target and may spend LLM tokens —
   * but it is the only leg of "does the agent remember our last conversation" that is testable
   * without audio. Every other check writes its fact through `save_memory`, which never touches the
   * transcript path.
   */
  expectDistil?: boolean
}

export interface MemoryLoopGateResult {
  /** 'pass' | 'fail' | 'skipped' — skipped means the repo doesn't consume the voice package. */
  outcome: 'pass' | 'fail' | 'skipped'
  reason?: string
  checks: { name: string; ok: boolean; detail?: string; skipped?: boolean }[]
  /**
   * What was actually probed. Printed on every run, pass or fail.
   *
   * Three runs were spent diagnosing a red that came from a misnamed variable pointing the probe at
   * an empty string. A gate that does not say what it tested cannot be debugged from its output.
   */
  target?: { url: string; identityMode: string; uid: string; postCall: string }
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
  // Env fallback for the same reason `uid` has one: the agent id belongs to a PARTICULAR test user,
  // so committing it to a shared config file is wrong the moment the test identity changes. It is not
  // a secret, but it is environment-specific.
  const agentId = config.agentId ?? env.MEMORY_LOOP_AGENT_ID
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
  const origin = baseUrl.replace(/\/$/, '')
  const probeBase = `${origin}${webhookPath}`
  // An origin-relative `postCallPath` wins over nothing and loses to an explicit absolute URL.
  const postCallUrl = config.postCallUrl ?? (config.postCallPath ? `${origin}${config.postCallPath}` : undefined)
  const identityMode = config.identityMode ?? 'uid'

  // The distil leg needs the ElevenLabs webhook signing secret. Asking for it and not finding it is a
  // failure, not a downgrade to a cheaper test: the operator asked for the leg to be asserted.
  const webhookSecret = env.ELEVENLABS_WEBHOOK_SECRET
  if (config.expectDistil && !webhookSecret) {
    return {
      outcome: 'fail',
      reason: 'expectDistil is set but ELEVENLABS_WEBHOOK_SECRET is not — the post-call payload cannot be signed',
      checks: [],
    }
  }

  const result = await probeMemoryLoop({
    baseUrl: probeBase,
    uid,
    identityMode,
    ...(config.conversationId ? { conversationId: config.conversationId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(toolSecret ? { toolSecret } : {}),
    ...(supabase ? { supabase: supabase as never } : {}),
    ...(config.memoryTable ? { memoryTable: config.memoryTable } : {}),
    ...(config.conversationsTable ? { conversationsTable: config.conversationsTable } : {}),
    ...(config.agentsTable ? { agentsTable: config.agentsTable } : {}),
    ...(config.expectContinuity === false ? { expectContinuity: false } : {}),
    ...(config.startRoute ? { startRoute: config.startRoute } : {}),
    ...(postCallUrl ? { postCallUrl } : {}),
    ...(config.postCallRoute ? { postCallRoute: config.postCallRoute } : {}),
    ...(config.expectPostCallAuth === false ? { expectPostCallAuth: false } : {}),
    ...(config.expectDistil && webhookSecret ? { distil: { secret: webhookSecret } } : {}),
    ...(config.toolSecretHeader ?? env.CONVAI_TOOL_SECRET_HEADER
      ? { toolSecretHeader: (config.toolSecretHeader ?? env.CONVAI_TOOL_SECRET_HEADER) as string }
      : {}),
  })

  return {
    outcome: result.pass ? 'pass' : 'fail',
    checks: result.checks,
    target: {
      url: probeBase,
      identityMode,
      uid,
      postCall: postCallUrl ?? `${probeBase}/${config.postCallRoute ?? 'post-call'}`,
    },
  }
}

/** Human-readable summary for CI output. */
export function formatMemoryLoopResult(result: MemoryLoopGateResult): string {
  if (result.outcome === 'skipped') return `memory-loop: SKIPPED — ${result.reason}`;

  // SKIP is printed at the same weight as FAIL. A check that could not be asserted must never read
  // as one that passed — that ambiguity is the whole reason this gate exists.
  const lines = result.checks.map(
    (c) => `  ${c.skipped ? 'SKIP' : c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`,
  )
  const asserted = result.checks.filter((c) => !c.skipped).length
  const skipped = result.checks.length - asserted
  const head =
    result.outcome === 'pass'
      ? `memory-loop: PASS (${asserted} asserted${skipped ? `, ${skipped} not assertable` : ''})`
      : `memory-loop: FAIL${result.reason ? ` — ${result.reason}` : ''}`
  const target = result.target
    ? [`  target: ${result.target.url}  (identity: ${result.target.identityMode}, uid: ${result.target.uid})`,
       `  post-call: ${result.target.postCall}`]
    : []
  return [head, ...target, ...lines].join('\n')
}
