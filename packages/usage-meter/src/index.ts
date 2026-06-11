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
  const resolved = resolveConfig(config)
  if (!resolved) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), resolved.timeoutMs)
  try {
    const res = await fetch(resolved.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolved.token}`,
      },
      body: JSON.stringify({ productSlug: resolved.productSlug, events }),
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

interface UsageContext {
  model?: string | null
  api?: string | null
  metadata?: Record<string, unknown>
}

function tokenEvent(
  provider: string,
  unitType: string,
  units: unknown,
  ctx: UsageContext,
): MeterEvent | null {
  const n = Number(units)
  if (!Number.isFinite(n) || n <= 0) return null
  return {
    provider,
    model: ctx.model ?? null,
    api: ctx.api ?? null,
    unitType,
    units: n,
    metadata: ctx.metadata,
  }
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
