// Slice 0D — runChat. The smallest execution surface.
//
// These pin the behaviour that removes duplication (base-url resolution, alias resolution, usage
// mapping, JSON validity) and the behaviour that must NOT change (errors propagate untouched).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runChat } from './index.js'

const METER = { url: '', token: '', productSlug: '' } // unconfigured: no telemetry traffic in tests

let requests: Array<{ url: string; body: any }>

function mockOpenAI(payload: unknown, ok = true, status = 200) {
  requests = [] // fresh capture per stub, so requests[0] always means "this call"
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) })
    return {
      ok, status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response
  }))
}

const OK_BODY = {
  model: 'gpt-4.1-mini-2025-04-14',
  choices: [{ message: { content: '{"business_type":"physiotherapy clinic"}' } }],
  usage: { prompt_tokens: 105, completion_tokens: 9 },
}

beforeEach(() => { requests = [] })
afterEach(() => vi.unstubAllGlobals())

describe('runChat', () => {
  it('resolves a capability alias to a concrete model', async () => {
    mockOpenAI(OK_BODY)
    const r = await runChat({
      operation: 'structured_extraction', alias: 'CHEAP', apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(requests[0].body.model).toBe('gpt-4.1-mini')
    expect(r.model).toBe('gpt-4.1-mini')
  })

  it('an explicit model wins over the alias', async () => {
    mockOpenAI(OK_BODY)
    await runChat({
      operation: 'op', alias: 'CHEAP', model: 'gpt-4o-mini', apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(requests[0].body.model).toBe('gpt-4o-mini')
  })

  it('requires one of model or alias', async () => {
    mockOpenAI(OK_BODY)
    await expect(runChat({ operation: 'op', apiKey: 'k', messages: [], meter: METER }))
      .rejects.toThrow(/supply either/)
  })

  it('requires an apiKey', async () => {
    mockOpenAI(OK_BODY)
    await expect(runChat({ operation: 'op', alias: 'CHEAP', apiKey: '', messages: [], meter: METER }))
      .rejects.toThrow(/apiKey is required/)
  })

  it('honours an explicit baseUrl — the override that was hardcoded in three places', async () => {
    mockOpenAI(OK_BODY)
    await runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k', baseUrl: 'https://vllm.internal/v1/',
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(requests[0].url).toBe('https://vllm.internal/v1/chat/completions')
  })

  it('prepends the system message rather than requiring the caller to', async () => {
    mockOpenAI(OK_BODY)
    await runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k', system: 'You classify businesses.',
      messages: [{ role: 'user', content: 'a clinic' }], meter: METER,
    })
    expect(requests[0].body.messages).toEqual([
      { role: 'system', content: 'You classify businesses.' },
      { role: 'user', content: 'a clinic' },
    ])
  })

  it('maps usage and reports the model the provider actually served', async () => {
    mockOpenAI(OK_BODY)
    const r = await runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(r.usage).toEqual({ inputTokens: 105, outputTokens: 9 })
    expect(typeof r.callId).toBe('string')
  })

  it('parses JSON only in jsonMode, and asks for it', async () => {
    mockOpenAI(OK_BODY)
    const plain = await runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(plain.json).toBeUndefined()
    expect(requests[0].body.response_format).toBeUndefined()

    mockOpenAI(OK_BODY)
    const json = await runChat<{ business_type: string }>({
      operation: 'op', alias: 'CHEAP', apiKey: 'k', jsonMode: true,
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(json.json).toEqual({ business_type: 'physiotherapy clinic' })
    expect(requests[0].body.response_format).toEqual({ type: 'json_object' })
  })

  it('runs onValidate and lets it fail the validity signal without failing the call', async () => {
    mockOpenAI(OK_BODY)
    const r = await runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k', jsonMode: true,
      onValidate: () => false,
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(r.json).toBeDefined() // validity is a SIGNAL, not a gate — the caller decides
  })

  it('propagates a non-2xx as an error the caller can classify', async () => {
    mockOpenAI({ error: 'rate limited' }, false, 429)
    await expect(runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })).rejects.toThrow(/429/)
  })

  it('propagates a malformed JSON body rather than returning an empty object', async () => {
    mockOpenAI({ choices: [{ message: { content: 'not json at all' } }], usage: {} })
    await expect(runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k', jsonMode: true,
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })).rejects.toThrow()
  })

  it('omits max_tokens and temperature when not supplied', async () => {
    mockOpenAI(OK_BODY)
    await runChat({
      operation: 'op', alias: 'CHEAP', apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }], meter: METER,
    })
    expect(requests[0].body).not.toHaveProperty('max_tokens')
    expect(requests[0].body).not.toHaveProperty('temperature')
  })
})
