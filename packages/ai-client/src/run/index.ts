/**
 * @caistech/ai-client/run — the smallest execution surface that removes real duplication.
 *
 * SCOPED FROM WHAT IS ACTUALLY DUPLICATED, not from the earlier design document. Kira contains six
 * hand-rolled OpenAI chat clients; Orchestrator a seventh. Compared side by side, the part that
 * genuinely repeats is small and boring: resolve the base URL, set the auth header, post
 * `{model, messages}`, optionally ask for JSON, read `choices[0].message.content`, and map
 * `usage.prompt_tokens/completion_tokens` onto the meter. That is what this does. Nothing else.
 *
 * DELIBERATELY ABSENT, and each for a stated reason:
 *   * TOOL CALLING — a multi-round loop replays assistant turns verbatim, appends `role:'tool'`
 *     results and enforces identity from the session rather than from model arguments. Wrapping that
 *     would mean either re-implementing the loop here or exposing enough hooks that the wrapper adds
 *     nothing. Consumers keep their loop and call `observeAiCall` directly.
 *   * STREAMING — no current consumer streams an OpenAI response.
 *   * EMBEDDINGS — a different endpoint with a different response shape. Forcing it through a chat
 *     signature would be an abstraction serving the abstraction.
 *   * FALLBACK and provider selection — those need the measured data this layer exists to collect.
 *     Building them now would encode the guesses the telemetry is meant to replace.
 *   * ANTHROPIC — one occurrence is not a pattern. Add it when a second consumer needs it.
 *
 * ⚠️ Relative imports carry an explicit `.js`. See the note in ../models/index.ts.
 */

import { observeAiCall, type MeterConfig } from '@caistech/usage-meter'
import { resolveModel, type ModelAlias } from '../models/index.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface RunChatOptions {
  /** The canonical operation vocabulary — also lands on usage_events.api. */
  operation: string
  /** Bump when the prompt changes, or a quality trend spans two different things. */
  operationVersion?: string
  /** A capability tier. Ignored when `model` is given. */
  alias?: ModelAlias
  /** An explicit model id, winning over `alias`. */
  model?: string
  apiKey: string
  messages: ChatMessage[]
  system?: string
  /** Ask for a JSON object and parse it. `json` is populated only when this is true. */
  jsonMode?: boolean
  maxTokens?: number
  temperature?: number
  /** Defaults to OPENAI_BASE_URL then api.openai.com — one place, not seven. */
  baseUrl?: string
  sessionId?: string
  schemaName?: string
  /** Report the parse/validation outcome as the free quality signal. */
  onValidate?: (json: unknown) => boolean
  meter?: MeterConfig
}

export interface RunChatResult<T = unknown> {
  text: string
  /** Present only when `jsonMode` was set and the body parsed. */
  json?: T
  callId: string
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * One OpenAI chat completion, observed.
 *
 * THROWS on a non-2xx or an unparseable JSON body, with the original error propagated by
 * `observeAiCall`. Callers keep their own failure bias — this deliberately has no opinion about
 * whether a failure means retry, drop or surface.
 */
export async function runChat<T = unknown>(options: RunChatOptions): Promise<RunChatResult<T>> {
  const model =
    options.model ??
    (options.alias
      ? resolveModel({ alias: options.alias, provider: 'openai' })
      : undefined)

  if (!model) {
    throw new Error('runChat: supply either `model` or `alias`')
  }
  if (!options.apiKey) {
    throw new Error('runChat: apiKey is required')
  }

  const baseUrl = (
    options.baseUrl ??
    (typeof process !== 'undefined' ? process.env.OPENAI_BASE_URL : undefined) ??
    'https://api.openai.com/v1'
  ).replace(/\/$/, '')

  const messages: ChatMessage[] = options.system
    ? [{ role: 'system', content: options.system }, ...options.messages]
    : options.messages

  return observeAiCall(
    {
      operation: options.operation,
      provider: 'openai',
      modelRequested: model,
      ...(options.operationVersion ? { operationVersion: options.operationVersion } : {}),
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options.schemaName ? { schemaName: options.schemaName } : {}),
    },
    async (ctx) => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      })

      if (!res.ok) {
        throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`)
      }

      const body = (await res.json()) as {
        model?: string
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }

      const inputTokens = body.usage?.prompt_tokens ?? 0
      const outputTokens = body.usage?.completion_tokens ?? 0
      ctx.usage({ inputTokens, outputTokens })
      if (body.model) ctx.modelUsed(body.model)

      const text = body.choices?.[0]?.message?.content ?? ''

      const result: RunChatResult<T> = { text, callId: ctx.callId, model, usage: { inputTokens, outputTokens } }

      if (options.jsonMode) {
        let parsed: T
        try {
          parsed = JSON.parse(text || '{}') as T
        } catch (err) {
          ctx.structuredValid(false)
          throw err
        }
        const valid = options.onValidate ? options.onValidate(parsed) : true
        ctx.structuredValid(valid)
        result.json = parsed
      }

      return result
    },
    options.meter,
  )
}
