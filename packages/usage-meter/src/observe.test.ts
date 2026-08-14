// Slice 0B — observeAiCall.
//
// The first test is the one that protects consumers: a wrapper that swallowed, wrapped or
// normalised an exception would silently rewrite deliberate per-call-site failure biases.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushMeter, observeAiCall, reportUsage } from './index.js'

const CONFIG = { url: 'https://cockpit.test/api/ingest/usage', token: 't', productSlug: 'kira' }

let posted: Array<{ url: string; body: any }>

beforeEach(() => {
  posted = []
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
    posted.push({ url: String(url), body: JSON.parse(init.body) })
    return { ok: true } as Response
  }))
})
afterEach(() => vi.unstubAllGlobals())

const lastBody = () => posted[posted.length - 1]?.body

describe('observeAiCall — success path', () => {
  it('returns the function result untouched and records one call', async () => {
    const result = await observeAiCall(
      { operation: 'classification', provider: 'openai', modelRequested: 'gpt-4.1-mini' },
      async (ctx) => {
        ctx.usage({ inputTokens: 105, outputTokens: 9 })
        ctx.modelUsed('gpt-4.1-mini-2025-04-14')
        ctx.structuredValid(true)
        return { section: 'operations' }
      },
      CONFIG,
    )
    await flushMeter()

    expect(result).toEqual({ section: 'operations' })
    const call = lastBody().calls[0]
    expect(call).toMatchObject({
      provider: 'openai',
      operation: 'classification',
      status: 'ok',
      modelRequested: 'gpt-4.1-mini',
      modelUsed: 'gpt-4.1-mini-2025-04-14',
      structuredValid: true,
      inputTokens: 105,
      outputTokens: 9,
      attempt: 1,
      errorClass: null,
    })
    expect(typeof call.callId).toBe('string')
    expect(call.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('emits linked usage events whose api IS the operation (one vocabulary)', async () => {
    await observeAiCall(
      { operation: 'structured_extraction', provider: 'openai', modelRequested: 'gpt-4.1-mini' },
      async (ctx) => { ctx.usage({ inputTokens: 20, outputTokens: 4 }); return 'x' },
      CONFIG,
    )
    await flushMeter()

    const { calls, events } = lastBody()
    expect(events).toHaveLength(2)
    expect(events.every((e: any) => e.api === 'structured_extraction')).toBe(true)
    expect(events.every((e: any) => e.callId === calls[0].callId)).toBe(true)
    expect(events.map((e: any) => e.unitType)).toEqual(['input_tokens', 'output_tokens'])
  })

  it('sends calls and their events in ONE request', async () => {
    await observeAiCall(
      { operation: 'classification', provider: 'openai' },
      async (ctx) => { ctx.usage({ inputTokens: 5 }); return 1 },
      CONFIG,
    )
    await flushMeter()
    expect(posted).toHaveLength(1)
    expect(lastBody()).toHaveProperty('calls')
    expect(lastBody()).toHaveProperty('events')
  })

  it('records a refusal as its own status without failing the call', async () => {
    const out = await observeAiCall(
      { operation: 'agentic_execution', provider: 'openai' },
      async (ctx) => { ctx.refused('outside_scope'); return 'declined politely' },
      CONFIG,
    )
    await flushMeter()
    expect(out).toBe('declined politely')
    expect(lastBody().calls[0]).toMatchObject({ status: 'refused', refusalClass: 'outside_scope' })
  })

  it('leaves structuredValid NULL when the caller never validated (not false)', async () => {
    await observeAiCall({ operation: 'generation', provider: 'openai' }, async () => 'prose', CONFIG)
    await flushMeter()
    expect(lastBody().calls[0].structuredValid).toBeNull()
  })

  it('records tool-use counts when supplied', async () => {
    await observeAiCall(
      { operation: 'tool_selection', provider: 'openai' },
      async (ctx) => { ctx.tools(7, 2, 2); return null },
      CONFIG,
    )
    await flushMeter()
    expect(lastBody().calls[0]).toMatchObject({ toolsOffered: 7, toolsCalled: 2, toolsWellformed: 2 })
  })
})

describe('observeAiCall — failure path', () => {
  it('RETHROWS THE ORIGINAL ERROR, identical by reference', async () => {
    const boom = new Error('OpenAI request failed: 429 rate limit exceeded')
    let caught: unknown
    try {
      await observeAiCall({ operation: 'classification', provider: 'openai' }, async () => { throw boom }, CONFIG)
    } catch (e) { caught = e }

    expect(caught).toBe(boom)                       // same object — not wrapped, not re-created
    expect((caught as Error).message).toBe(boom.message)
  })

  it('records the failure as a row rather than emitting nothing', async () => {
    try {
      await observeAiCall(
        { operation: 'classification', provider: 'openai' },
        async () => { throw new Error('OpenAI request failed: 429 rate limit') },
        CONFIG,
      )
    } catch { /* expected */ }
    await flushMeter()

    expect(lastBody().calls[0]).toMatchObject({ status: 'error', errorClass: 'rate_limit' })
  })

  it('classifies the error kinds it can distinguish', async () => {
    const cases: Array<[string, string, string]> = [
      ['boom 401 unauthorized', 'error', 'auth'],
      ['upstream 503 internal server error', 'error', 'server'],
      ['The operation was aborted due to timeout', 'timeout', 'timeout'],
      ['something entirely unexpected', 'error', 'other'],
    ]
    for (const [message, status, errorClass] of cases) {
      try {
        await observeAiCall({ operation: 'op', provider: 'openai' }, async () => { throw new Error(message) }, CONFIG)
      } catch { /* expected */ }
      await flushMeter()
      expect(lastBody().calls[0], message).toMatchObject({ status, errorClass })
    }
  })

  it('still reports tokens the call managed to consume before failing', async () => {
    try {
      await observeAiCall(
        { operation: 'structured_extraction', provider: 'openai' },
        async (ctx) => { ctx.usage({ inputTokens: 40 }); throw new Error('schema parse failed') },
        CONFIG,
      )
    } catch { /* expected */ }
    await flushMeter()
    expect(lastBody().calls[0]).toMatchObject({ status: 'error', errorClass: 'schema', inputTokens: 40 })
    expect(lastBody().events).toHaveLength(1)
  })
})

describe('observeAiCall — unconfigured', () => {
  it('runs the function, returns its value, and sends NOTHING', async () => {
    const out = await observeAiCall(
      { operation: 'classification', provider: 'openai' },
      async (ctx) => { ctx.usage({ inputTokens: 10 }); return 'ran' },
      { url: '', token: '', productSlug: '' },
    )
    await flushMeter()
    expect(out).toBe('ran')
    expect(posted).toHaveLength(0)
  })

  it('still rethrows when unconfigured', async () => {
    const boom = new Error('nope')
    await expect(
      observeAiCall({ operation: 'x', provider: 'openai' }, async () => { throw boom }, { url: '', token: '', productSlug: '' }),
    ).rejects.toBe(boom)
  })

  it('never throws when the transport itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const out = await observeAiCall(
      { operation: 'classification', provider: 'openai' },
      async (ctx) => { ctx.usage({ inputTokens: 1 }); return 'fine' },
      CONFIG,
    )
    await flushMeter()
    expect(out).toBe('fine')
  })
})

describe('backward compatibility', () => {
  it('reportUsage still sends an events-only body with no calls key', async () => {
    await reportUsage([{ provider: 'openai', unitType: 'input_tokens', units: 10 }], CONFIG)
    expect(lastBody()).toEqual({
      productSlug: 'kira',
      events: [{ provider: 'openai', unitType: 'input_tokens', units: 10 }],
    })
    expect(lastBody()).not.toHaveProperty('calls')
  })
})
