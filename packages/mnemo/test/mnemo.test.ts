import { describe, expect, it, vi } from 'vitest'

import { createMnemoClient, normaliseFact, orgScope } from '../src/index'

const SCOPE = orgScope('test-scope-1')

function okFetch(body: unknown = { results: [] }) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
}

describe('fail-soft is the contract', () => {
  it('no-ops add and returns [] from search when no key is configured', async () => {
    // Memory is an enhancement. Without a key the product must still work, silently.
    const fetchImpl = okFetch()
    const mnemo = createMnemoClient({ apiKey: undefined, fetchImpl: fetchImpl as never })

    // Explicitly clear the env fallback for this assertion.
    const saved = process.env.MNEMO_API_KEY
    delete process.env.MNEMO_API_KEY
    try {
      expect(mnemo.enabled()).toBe(false)
      expect(await mnemo.add(SCOPE, ['a fact'])).toBe(0)
      expect(await mnemo.search(SCOPE, 'query')).toEqual([])
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      if (saved !== undefined) process.env.MNEMO_API_KEY = saved
    }
  })

  it('swallows a network error rather than throwing into the call path', async () => {
    // A Mnemo outage must degrade recall, never break the conversation it sits inside.
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    await expect(mnemo.add(SCOPE, ['fact'])).resolves.toBe(0)
    await expect(mnemo.search(SCOPE, 'q')).resolves.toEqual([])
  })

  it('swallows a non-2xx rather than throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(await mnemo.add(SCOPE, ['fact'])).toBe(0)
    expect(await mnemo.search(SCOPE, 'q')).toEqual([])
  })

  it('swallows an unparseable body', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>not json</html>', { status: 200 }))
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })
    expect(await mnemo.search(SCOPE, 'q')).toEqual([])
  })
})

describe('add', () => {
  it('posts the scope and the items, and reports how many were sent', async () => {
    const fetchImpl = okFetch({})
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(await mnemo.add(SCOPE, ['one', 'two'])).toBe(2)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toContain('/v1/memories')
    const body = JSON.parse(String(init!.body))
    expect(body.scope).toEqual(SCOPE)
    expect(body.items).toEqual([{ content: 'one' }, { content: 'two' }])
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })

  it('drops blank and whitespace-only facts rather than storing them', async () => {
    const fetchImpl = okFetch({})
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(await mnemo.add(SCOPE, ['  ', '', '  real  '])).toBe(1)
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]!.body)).items).toEqual([{ content: 'real' }])
  })

  it('makes no request at all when there is nothing to store', async () => {
    const fetchImpl = okFetch({})
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(await mnemo.add(SCOPE, [])).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses to write without a scope id — no catch-all bucket', async () => {
    // Writing to an empty scope would pool every tenant's memory into one container.
    const fetchImpl = okFetch({})
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(await mnemo.add({ type: 'org', id: '' }, ['fact'])).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('search', () => {
  it('returns the matching contents', async () => {
    const fetchImpl = okFetch({ results: [{ content: ' first ' }, { content: 'second' }] })
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(await mnemo.search(SCOPE, 'anything')).toEqual(['first', 'second'])
  })

  it('skips the call for an empty query', async () => {
    const fetchImpl = okFetch()
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(await mnemo.search(SCOPE, '   ')).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('passes the limit through', async () => {
    const fetchImpl = okFetch()
    const mnemo = createMnemoClient({ apiKey: 'k', fetchImpl: fetchImpl as never })

    await mnemo.search(SCOPE, 'q', 3)
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]!.body)).limit).toBe(3)
  })
})

describe('key resolution', () => {
  it('reads the key per call, not at construction', async () => {
    // A module constructed during a Next.js build has no env; capturing there would disable the
    // client for the life of the process.
    const fetchImpl = okFetch({})
    const mnemo = createMnemoClient({ fetchImpl: fetchImpl as never })

    const saved = process.env.MNEMO_API_KEY
    delete process.env.MNEMO_API_KEY
    try {
      expect(mnemo.enabled()).toBe(false)
      process.env.MNEMO_API_KEY = 'appeared-later'
      expect(mnemo.enabled()).toBe(true)
      expect(await mnemo.add(SCOPE, ['fact'])).toBe(1)
    } finally {
      if (saved === undefined) delete process.env.MNEMO_API_KEY
      else process.env.MNEMO_API_KEY = saved
    }
  })
})

describe('normaliseFact', () => {
  it('collapses case, punctuation and whitespace so literal repeats collide', () => {
    expect(normaliseFact('Dennis is building Kira.')).toBe('dennis is building kira')
    expect(normaliseFact('  DENNIS   is building  Kira!! ')).toBe('dennis is building kira')
  })

  it('does NOT claim to catch semantic near-duplicates', () => {
    // Stated as a test so the limitation is explicit rather than discovered.
    expect(normaliseFact('developing X')).not.toBe(normaliseFact('currently developing X'))
  })
})
