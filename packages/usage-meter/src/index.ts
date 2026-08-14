/**
 * @caistech/usage-meter — report per-product / per-API usage to the cockpit ingestion endpoint.
 *
 * This is the package BUSINESS_MODEL.md §7 always referred to as "@caistech/usage-meters". A
 * product (or a shared client like @caistech/openrouter-client) calls reportUsage() after an LLM
 * call; the meter POSTs the priced-at-source usage to the cockpit's POST /api/ingest/usage, which
 * is the only place that holds the cockpit service-role key. The cockpit attributes the spend to
 * the product and surfaces it in the Cost Dashboard's Usage Analytics.
 *
 * Two hard rules:
 *  1. NEVER throws and NEVER blocks the product. A metering failure must not break an LLM call —
 *     every path is wrapped, with a short timeout, and returns a boolean instead of raising.
 *  2. NO-OP until configured. With USAGE_INGEST_URL / USAGE_INGEST_TOKEN / USAGE_PRODUCT_SLUG unset
 *     (or passed explicitly), reportUsage() does nothing and returns false. This makes adopting the
 *     instrumented clients zero-risk: bumping the package changes nothing until a product opts in
 *     by setting those env vars.
 *
 * Usage (Anthropic SDK path — the product constructs the SDK itself, so it meters the response):
 *   import { meterAnthropic } from '@caistech/usage-meter';
 *   const resp = await client.messages.create({ model, max_tokens, messages });
 *   await meterAnthropic(resp.usage, { model });   // fire-and-forget, no-op unless configured
 *
 * Usage (OpenRouter): @caistech/openrouter-client calls this automatically — no product code needed.
 */

export interface MeterEvent {
  provider: string
  model?: string | null
  /** Logical operation for grouping in the dashboard (e.g. messages, chat, tts, search). */
  api?: string | null
  /** input_tokens | output_tokens | cache_read_tokens | cache_write_tokens | characters | requests */
  unitType: string
  units: number
  occurredAt?: string
  metadata?: Record<string, unknown>
  /**
   * Links this unit row to the CALL that produced it (slice 0B). Optional and nullable: every
   * pre-0B caller keeps working unchanged, and a unit reported outside a call is still valid.
   */
  callId?: string
}

export interface MeterConfig {
  /** Cockpit ingestion URL, e.g. https://<cockpit>/api/ingest/usage. Defaults to USAGE_INGEST_URL. */
  url?: string
  /** Shared bearer token. Defaults to USAGE_INGEST_TOKEN. */
  token?: string
  /** This product's slug (the attribution key). Defaults to USAGE_PRODUCT_SLUG. */
  productSlug?: string
  /** Abort the POST after this many ms so metering never adds latency. Default 3000. */
  timeoutMs?: number
}

interface ResolvedConfig {
  url: string
  token: string
  productSlug: string
  timeoutMs: number
}

function resolveConfig(config?: MeterConfig): ResolvedConfig | null {
  const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>)
  const url = config?.url ?? env.USAGE_INGEST_URL
  const token = config?.token ?? env.USAGE_INGEST_TOKEN
  const productSlug = config?.productSlug ?? env.USAGE_PRODUCT_SLUG
  if (!url || !token || !productSlug) return null
  return { url, token, productSlug, timeoutMs: config?.timeoutMs ?? 3000 }
}

/** True when reportUsage would actually send (all of url/token/productSlug resolvable). */
export function isMeterConfigured(config?: MeterConfig): boolean {
  return resolveConfig(config) !== null
}

/**
 * Report usage events to the cockpit. No-op (returns false) when unconfigured. Never throws.
 * Returns true only on a 2xx response.
 */
export async function reportUsage(events: MeterEvent[], config?: MeterConfig): Promise<boolean> {
  if (!events || events.length === 0) return false
  return send({ events }, config)
}

/**
 * The one POST. Both unit events (`events`) and call records (`calls`) travel in a single request
 * so a call and the units it produced can never be half-delivered, and so slice 0B adds no second
 * round-trip to a request path that already tolerates exactly one.
 *
 * `calls` is omitted entirely when empty, keeping the body byte-compatible with the pre-0B shape
 * the ingestion route has always accepted.
 */
async function send(
  payload: { events?: MeterEvent[]; calls?: AiCallRecord[] },
  config?: MeterConfig,
): Promise<boolean> {
  const resolved = resolveConfig(config)
  if (!resolved) return false

  const body: Record<string, unknown> = { productSlug: resolved.productSlug }
  if (payload.events && payload.events.length > 0) body.events = payload.events
  if (payload.calls && payload.calls.length > 0) body.calls = payload.calls
  if (!body.events && !body.calls) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), resolved.timeoutMs)
  try {
    const res = await fetch(resolved.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolved.token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    return res.ok
  } catch {
    // Swallow — metering must never surface an error into the product's request path.
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Report call records (with any linked unit events). No-op unless configured. Never throws. */
export async function reportCalls(
  calls: AiCallRecord[],
  events: MeterEvent[] = [],
  config?: MeterConfig,
): Promise<boolean> {
  if (!calls || calls.length === 0) return false
  return send({ calls, events }, config)
}

interface UsageContext {
  model?: string | null
  api?: string | null
  metadata?: Record<string, unknown>
  /** Set by observeAiCall so unit rows link back to their call. */
  callId?: string
}

function tokenEvent(
  provider: string,
  unitType: string,
  units: unknown,
  ctx: UsageContext,
): MeterEvent | null {
  const n = Number(units)
  if (!Number.isFinite(n) || n <= 0) return null
  const event: MeterEvent = {
    provider,
    model: ctx.model ?? null,
    api: ctx.api ?? null,
    unitType,
    units: n,
    metadata: ctx.metadata,
  }
  if (ctx.callId) event.callId = ctx.callId
  return event
}

/** Shape of Anthropic's `response.usage` (only the fields we meter). */
export interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/** Build meter events from an Anthropic `response.usage`. Defaults provider=anthropic, api=messages. */
export function usageFromAnthropic(usage: AnthropicUsage | undefined | null, ctx: UsageContext = {}): MeterEvent[] {
  if (!usage) return []
  const provider = 'anthropic'
  const c: UsageContext = { api: 'messages', ...ctx }
  return [
    tokenEvent(provider, 'input_tokens', usage.input_tokens, c),
    tokenEvent(provider, 'output_tokens', usage.output_tokens, c),
    tokenEvent(provider, 'cache_read_tokens', usage.cache_read_input_tokens, c),
    tokenEvent(provider, 'cache_write_tokens', usage.cache_creation_input_tokens, c),
  ].filter((e): e is MeterEvent => e !== null)
}

/** Shape of an OpenAI/OpenRouter `usage` block. */
export interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

/** Build meter events from an OpenRouter `data.usage`. Defaults provider=openrouter, api=chat. */
export function usageFromOpenRouter(usage: OpenRouterUsage | undefined | null, ctx: UsageContext = {}): MeterEvent[] {
  if (!usage) return []
  const provider = 'openrouter'
  const c: UsageContext = { api: 'chat', ...ctx }
  return [
    tokenEvent(provider, 'input_tokens', usage.prompt_tokens, c),
    tokenEvent(provider, 'output_tokens', usage.completion_tokens, c),
  ].filter((e): e is MeterEvent => e !== null)
}

/**
 * Shape of an OpenAI Chat Completions `usage` block.
 *
 * SCOPE, verified across the portfolio 2026-08-13: every OpenAI call site in every repo uses
 * `/chat/completions`, i.e. `prompt_tokens` / `completion_tokens`. NOTHING uses the Responses API,
 * which names the same quantities `input_tokens` / `output_tokens`. That shape is deliberately NOT
 * handled here — add it when a consumer actually adopts it, rather than guessing now.
 *
 * `completion_tokens_details.reasoning_tokens` is deliberately NOT emitted as its own event:
 * reasoning tokens are already counted inside `completion_tokens` and billed at the output rate,
 * so metering them separately would double-count output spend.
 *
 * `prompt_tokens_details.cached_tokens` is captured into METADATA rather than as a
 * `cache_read_tokens` unit event. Two reasons: no ('openai','cache_read_tokens') price row exists,
 * so an event would land unpriced anyway; and whether `cached_tokens` is a SUBSET of
 * `prompt_tokens` or billed alongside it is ambiguous in OpenAI's own documentation. Emitting it as
 * a unit would risk double-counting real spend the moment someone prices it. Metadata keeps the
 * number available to resolve that question from real data, and cannot mis-price anything today.
 */
export interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number | null } | null
  completion_tokens_details?: { reasoning_tokens?: number | null } | null
}

/** Build meter events from an OpenAI `data.usage`. Defaults provider=openai, api=chat. */
export function usageFromOpenAI(usage: OpenAIUsage | undefined | null, ctx: UsageContext = {}): MeterEvent[] {
  if (!usage) return []
  const provider = 'openai'

  // Detail fields are recorded, never metered — see the note above.
  const extra: Record<string, unknown> = {}
  const cached = Number(usage.prompt_tokens_details?.cached_tokens)
  const reasoning = Number(usage.completion_tokens_details?.reasoning_tokens)
  if (Number.isFinite(cached) && cached > 0) extra.cached_tokens = cached
  if (Number.isFinite(reasoning) && reasoning > 0) extra.reasoning_tokens = reasoning

  const c: UsageContext = {
    api: 'chat',
    ...ctx,
    ...(Object.keys(extra).length > 0 ? { metadata: { ...(ctx.metadata ?? {}), ...extra } } : {}),
  }

  return [
    tokenEvent(provider, 'input_tokens', usage.prompt_tokens, c),
    tokenEvent(provider, 'output_tokens', usage.completion_tokens, c),
  ].filter((e): e is MeterEvent => e !== null)
}

/** Convenience: meter an Anthropic response usage in one call. No-op unless configured. */
export function meterAnthropic(
  usage: AnthropicUsage | undefined | null,
  ctx: UsageContext = {},
  config?: MeterConfig,
): Promise<boolean> {
  return reportUsage(usageFromAnthropic(usage, ctx), config)
}

/** Convenience: meter an OpenRouter response usage in one call. No-op unless configured. */
export function meterOpenRouter(
  usage: OpenRouterUsage | undefined | null,
  ctx: UsageContext = {},
  config?: MeterConfig,
): Promise<boolean> {
  return reportUsage(usageFromOpenRouter(usage, ctx), config)
}

/** Convenience: meter an OpenAI response usage in one call. No-op unless configured. */
export function meterOpenAI(
  usage: OpenAIUsage | undefined | null,
  ctx: UsageContext = {},
  config?: MeterConfig,
): Promise<boolean> {
  return reportUsage(usageFromOpenAI(usage, ctx), config)
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Slice 0B — CALL-GRAIN telemetry.

   usage_events answers "what did it cost". It cannot answer "what happened", because its grain is
   one row per (call, unit_type): latency belongs to a call and not to a token count, a failed call
   emits no unit rows at all, and there is no id joining the input row to the output row. So calls
   are recorded alongside units rather than squeezed into them.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

export type CallStatus = 'ok' | 'error' | 'timeout' | 'refused'
export type CallErrorClass = 'rate_limit' | 'auth' | 'server' | 'schema' | 'timeout' | 'other'

/** One AI call, as observed. Mirrors public.ai_calls. */
export interface AiCallRecord {
  callId: string
  environment?: string | null
  provider: string
  /** What we asked for. Diverges from modelUsed under any router — that divergence is the point. */
  modelRequested?: string | null
  /** What actually served it, when the provider reports it. */
  modelUsed?: string | null
  /** The canonical operation vocabulary. Also written to usage_events.api — ONE vocabulary. */
  operation: string
  /** Bump when the prompt changes, or a quality trend silently spans two different things. */
  operationVersion?: string | null
  startedAt: string
  latencyMs: number
  status: CallStatus
  errorClass?: CallErrorClass | null
  /** Retries and fallbacks are ROWS chained by rootCallId, never a counter. */
  attempt?: number
  rootCallId?: string | null
  fallbackFrom?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  cacheReadTokens?: number | null
  cacheWriteTokens?: number | null
  /** TRI-STATE. null means NOT APPLICABLE — never coerce it to false. */
  structuredValid?: boolean | null
  schemaName?: string | null
  refusalClass?: string | null
  toolsOffered?: number | null
  toolsCalled?: number | null
  toolsWellformed?: number | null
  sessionId?: string | null
  requestId?: string | null
  /** MUST already be a hash or opaque id. Never an email (DATA_STANDARD S4). */
  userRef?: string | null
  metadata?: Record<string, unknown>
}

export interface ObserveSpec {
  operation: string
  provider: string
  modelRequested?: string
  operationVersion?: string
  schemaName?: string
  sessionId?: string
  requestId?: string
  userRef?: string
  environment?: string
  attempt?: number
  rootCallId?: string
  fallbackFrom?: string
  metadata?: Record<string, unknown>
}

export interface CallUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Handed to the observed function so it can report what only it can see. */
export interface CallContext {
  readonly callId: string
  usage(u: CallUsage): void
  modelUsed(model: string): void
  /** The free quality signal: did the response survive schema/vocabulary validation? */
  structuredValid(ok: boolean): void
  refused(reasonClass: string): void
  tools(offered: number, called: number, wellformed: number): void
}

/** In-flight reports, so a serverless invocation can flush before it is frozen. */
const pending = new Set<Promise<unknown>>()
function track(p: Promise<unknown>): void {
  pending.add(p)
  void p.finally(() => pending.delete(p))
}

/**
 * Await every in-flight metering report.
 *
 * Reporting is fire-and-forget so it adds no latency to the caller — but a serverless runtime may
 * freeze the instance the moment the response is returned, taking an un-awaited fetch with it. Call
 * this before returning from a handler when you would rather pay a few ms than lose the row.
 * Never throws.
 */
export async function flushMeter(): Promise<void> {
  await Promise.allSettled([...pending])
}

function classifyError(err: unknown): { status: CallStatus; errorClass: CallErrorClass } {
  const name = (err as { name?: string } | null)?.name ?? ''
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const m = raw.toLowerCase()

  if (name === 'AbortError' || m.includes('abort') || m.includes('timed out') || m.includes('timeout')) {
    return { status: 'timeout', errorClass: 'timeout' }
  }
  if (m.includes('429') || m.includes('rate limit') || m.includes('rate_limit')) {
    return { status: 'error', errorClass: 'rate_limit' }
  }
  if (m.includes('401') || m.includes('403') || m.includes('unauthor') || m.includes('forbidden')) {
    return { status: 'error', errorClass: 'auth' }
  }
  if (/\b5\d\d\b/.test(raw) || m.includes('internal server')) {
    return { status: 'error', errorClass: 'server' }
  }
  if (name === 'ZodError' || m.includes('schema') || m.includes('json') || m.includes('parse')) {
    return { status: 'error', errorClass: 'schema' }
  }
  return { status: 'error', errorClass: 'other' }
}

function newCallId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  // Deterministic-enough fallback for runtimes without Web Crypto. Never used for security.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Observe one AI call: time it, record what happened, and report it alongside its unit events.
 *
 * FOUR CONTRACT RULES, and the first is the one that matters most:
 *
 *  1. IT RETHROWS THE ORIGINAL ERROR, UNCHANGED. Consumers encode deliberate, and deliberately
 *     opposite, failure biases at their call sites — one returns null to force a retry, another
 *     drops to silence because a false record is worse than a missing one. Wrapping, swallowing or
 *     normalising an error would quietly rewrite those decisions.
 *  2. It never throws of its own accord. A metering bug must not become a product outage.
 *  3. It no-ops until configured, so adopting it is risk-free.
 *  4. It times the call itself, so latency cannot be mis-reported by a caller.
 */
export async function observeAiCall<T>(
  spec: ObserveSpec,
  fn: (ctx: CallContext) => Promise<T>,
  config?: MeterConfig,
): Promise<T> {
  const callId = newCallId()
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  let usage: CallUsage = {}
  let modelUsed: string | null = null
  let structuredValid: boolean | null = null
  let refusalClass: string | null = null
  let toolsOffered: number | null = null
  let toolsCalled: number | null = null
  let toolsWellformed: number | null = null

  const ctx: CallContext = {
    callId,
    usage: (u) => { usage = { ...usage, ...u } },
    modelUsed: (m) => { modelUsed = m },
    structuredValid: (ok) => { structuredValid = ok },
    refused: (reasonClass) => { refusalClass = reasonClass },
    tools: (offered, called, wellformed) => {
      toolsOffered = offered; toolsCalled = called; toolsWellformed = wellformed
    },
  }

  const finish = (status: CallStatus, errorClass: CallErrorClass | null) => {
    // Guarded in full: reporting is the least important thing happening here.
    try {
      if (!isMeterConfigured(config)) return
      const model = modelUsed ?? spec.modelRequested ?? null
      const record: AiCallRecord = {
        callId,
        provider: spec.provider,
        operation: spec.operation,
        startedAt,
        latencyMs: Date.now() - t0,
        status,
        modelRequested: spec.modelRequested ?? null,
        modelUsed,
        operationVersion: spec.operationVersion ?? null,
        errorClass,
        attempt: spec.attempt ?? 1,
        rootCallId: spec.rootCallId ?? null,
        fallbackFrom: spec.fallbackFrom ?? null,
        environment: spec.environment ?? null,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        cacheReadTokens: usage.cacheReadTokens ?? null,
        cacheWriteTokens: usage.cacheWriteTokens ?? null,
        structuredValid,
        schemaName: spec.schemaName ?? null,
        refusalClass,
        toolsOffered,
        toolsCalled,
        toolsWellformed,
        sessionId: spec.sessionId ?? null,
        requestId: spec.requestId ?? null,
        userRef: spec.userRef ?? null,
        metadata: spec.metadata,
      }

      // api === operation: ONE vocabulary across both tables.
      const uctx: UsageContext = { model, api: spec.operation, callId }
      const events = [
        tokenEvent(spec.provider, 'input_tokens', usage.inputTokens, uctx),
        tokenEvent(spec.provider, 'output_tokens', usage.outputTokens, uctx),
        tokenEvent(spec.provider, 'cache_read_tokens', usage.cacheReadTokens, uctx),
        tokenEvent(spec.provider, 'cache_write_tokens', usage.cacheWriteTokens, uctx),
      ].filter((e): e is MeterEvent => e !== null)

      track(reportCalls([record], events, config))
    } catch {
      // Never surfaces.
    }
  }

  try {
    const result = await fn(ctx)
    finish(refusalClass ? 'refused' : 'ok', null)
    return result
  } catch (err) {
    const { status, errorClass } = classifyError(err)
    finish(status, errorClass)
    throw err // ← rule 1. Original error, unchanged.
  }
}
