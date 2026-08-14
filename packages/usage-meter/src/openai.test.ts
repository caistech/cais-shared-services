// Slice 0A — the OpenAI usage adapter.
//
// The behavioural contract these pin, in the order it matters:
//   1. It maps the SAME quantities as the OpenRouter adapter, differing only in the provider label
//      — that equivalence is the entire justification for the adapter being a small change.
//   2. reasoning_tokens are NOT emitted as an event. They are already inside completion_tokens and
//      billed at the output rate, so a separate event would double-count real output spend.
//   3. cached_tokens are recorded in metadata and NOT emitted as a unit event, because whether they
//      are a subset of prompt_tokens is ambiguous in OpenAI's docs — metering them could
//      double-count the moment somebody adds a price row.
//   4. Zero and absent values produce no event at all, rather than a 0-unit row.

import { describe, expect, it } from 'vitest'
import { usageFromOpenAI, usageFromOpenRouter, type OpenAIUsage } from './index.js'

describe('usageFromOpenAI', () => {
  it('maps prompt/completion tokens to input/output events with provider=openai', () => {
    const events = usageFromOpenAI({ prompt_tokens: 1420, completion_tokens: 260 }, { model: 'gpt-4.1-mini' })

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      api: 'chat',
      unitType: 'input_tokens',
      units: 1420,
    })
    expect(events[1]).toMatchObject({ provider: 'openai', unitType: 'output_tokens', units: 260 })
  })

  it('differs from the OpenRouter adapter ONLY in the provider label', () => {
    const usage = { prompt_tokens: 100, completion_tokens: 50 }
    const openai = usageFromOpenAI(usage, { model: 'm' })
    const openrouter = usageFromOpenRouter(usage, { model: 'm' })

    expect(openai.map((e) => ({ ...e, provider: null }))).toEqual(
      openrouter.map((e) => ({ ...e, provider: null })),
    )
    expect(openai.every((e) => e.provider === 'openai')).toBe(true)
    expect(openrouter.every((e) => e.provider === 'openrouter')).toBe(true)
  })

  it('does NOT emit reasoning_tokens as an event (already inside completion_tokens)', () => {
    const events = usageFromOpenAI({
      prompt_tokens: 100,
      completion_tokens: 900,
      completion_tokens_details: { reasoning_tokens: 800 },
    })

    expect(events).toHaveLength(2)
    expect(events.some((e) => e.unitType.includes('reasoning'))).toBe(false)
    // Output stays the billed total, not the visible-answer remainder.
    expect(events.find((e) => e.unitType === 'output_tokens')?.units).toBe(900)
    expect(events[0]?.metadata).toMatchObject({ reasoning_tokens: 800 })
  })

  it('records cached_tokens in metadata and NEVER as a unit event', () => {
    const events = usageFromOpenAI({
      prompt_tokens: 2000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 1536 },
    })

    expect(events.some((e) => e.unitType.includes('cache'))).toBe(false)
    expect(events.find((e) => e.unitType === 'input_tokens')?.units).toBe(2000)
    expect(events[0]?.metadata).toMatchObject({ cached_tokens: 1536 })
  })

  it('preserves caller metadata while adding detail fields', () => {
    const events = usageFromOpenAI(
      { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } },
      { metadata: { operation: 'classification' } },
    )

    expect(events[0]?.metadata).toEqual({ operation: 'classification', cached_tokens: 4 })
  })

  it('omits zero, absent and null values rather than emitting 0-unit rows', () => {
    expect(usageFromOpenAI({ prompt_tokens: 0, completion_tokens: 0 })).toHaveLength(0)
    expect(usageFromOpenAI({ prompt_tokens: 12 })).toHaveLength(1)
    expect(usageFromOpenAI(null)).toEqual([])
    expect(usageFromOpenAI(undefined)).toEqual([])

    const nulls: OpenAIUsage = {
      prompt_tokens: 5,
      completion_tokens: 5,
      prompt_tokens_details: { cached_tokens: null },
      completion_tokens_details: { reasoning_tokens: null },
    }
    expect(usageFromOpenAI(nulls)[0]?.metadata).toBeUndefined()
  })

  it('defaults api to chat but lets the caller override it', () => {
    expect(usageFromOpenAI({ prompt_tokens: 1 })[0]?.api).toBe('chat')
    expect(usageFromOpenAI({ prompt_tokens: 1 }, { api: 'embeddings' })[0]?.api).toBe('embeddings')
  })
})
