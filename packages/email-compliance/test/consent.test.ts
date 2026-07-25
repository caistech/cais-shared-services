import { describe, expect, it, vi } from 'vitest'

import {
  createUnsubscribeRoute,
  listUnsubscribeHeaders,
  signUnsubscribeToken,
  unsubscribeUrlFor,
  verifyUnsubscribeToken,
  type SuppressionStore,
} from '../src/consent'

const SECRET = 'unsubscribe-test-secret'

function memoryStore(): SuppressionStore & { suppressed: Set<string> } {
  const suppressed = new Set<string>()
  return {
    suppressed,
    async isSuppressed(email) {
      return suppressed.has(email.toLowerCase())
    },
    async suppress(email) {
      suppressed.add(email.toLowerCase())
    },
    async resubscribe(email) {
      suppressed.delete(email.toLowerCase())
    },
  }
}

describe('unsubscribe tokens', () => {
  it('round-trips the address, normalised', async () => {
    const token = await signUnsubscribeToken('  Owner@Example.COM ', SECRET)
    expect(await verifyUnsubscribeToken(token, SECRET)).toBe('owner@example.com')
  })

  it('rejects a token edited to name someone else', async () => {
    const token = await signUnsubscribeToken('owner@example.com', SECRET)
    const [, mac] = token.split('.')
    const forgedBody = btoa('victim@example.com').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await verifyUnsubscribeToken(`${forgedBody}.${mac}`, SECRET)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signUnsubscribeToken('owner@example.com', 'other-secret')
    expect(await verifyUnsubscribeToken(token, SECRET)).toBeNull()
  })

  it('rejects malformed input without throwing', async () => {
    for (const value of ['', null, undefined, 'nodot', '.', 'a.b']) {
      expect(await verifyUnsubscribeToken(value as string, SECRET)).toBeNull()
    }
  })

  it('builds a URL the footer can carry', async () => {
    const url = await unsubscribeUrlFor('https://kira.app/', 'owner@example.com', SECRET)
    expect(url).toMatch(/^https:\/\/kira\.app\/unsubscribe\?t=/)
    const token = decodeURIComponent(new URL(url).searchParams.get('t')!)
    expect(await verifyUnsubscribeToken(token, SECRET)).toBe('owner@example.com')
  })
})

describe('the unsubscribe route', () => {
  async function routeFor(overrides = {}) {
    const store = memoryStore()
    const route = createUnsubscribeRoute({ secret: SECRET, store, brandName: 'Kira', ...overrides })
    const token = await signUnsubscribeToken('owner@example.com', SECRET)
    return { store, route, token, url: `https://kira.app/unsubscribe?t=${encodeURIComponent(token)}` }
  }

  it('does NOT unsubscribe on a bare GET — mail scanners pre-fetch links', async () => {
    // A GET that mutates state gets triggered by security scanners nobody asked, silently opting
    // people out. The confirm step is what keeps the opt-out honest.
    const { store, route, url } = await routeFor()
    const response = await route.GET(new Request(url))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Yes, unsubscribe me')
    expect(store.suppressed.size).toBe(0)
  })

  it('unsubscribes on POST and records it', async () => {
    const { store, route, url } = await routeFor()
    const response = await route.POST(new Request(url, { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("You're unsubscribed")
    expect(store.suppressed.has('owner@example.com')).toBe(true)
  })

  it('unsubscribes on GET when one-click is explicitly opted into', async () => {
    const { store, route, url } = await routeFor({ oneClick: true })
    await route.GET(new Request(url))
    expect(store.suppressed.has('owner@example.com')).toBe(true)
  })

  it('is idempotent — people click twice', async () => {
    const { store, route, url } = await routeFor()
    await route.POST(new Request(url, { method: 'POST' }))
    await route.POST(new Request(url, { method: 'POST' }))
    expect(store.suppressed.size).toBe(1)
  })

  it('answers an invalid token with 200 and no error, never an address oracle', async () => {
    // Saying "that address isn't on our list" would turn this into a way to test addresses, and
    // someone trying to leave should never be shown a failure either way.
    const { route } = await routeFor()
    const response = await route.GET(new Request('https://kira.app/unsubscribe?t=rubbish'))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("isn't valid")
  })

  it('still confirms the opt-out when the mirror hook throws', async () => {
    // The suppression is already recorded — that IS the obligation. A failing side effect must not
    // turn a successful opt-out into an error page.
    const store = memoryStore()
    const route = createUnsubscribeRoute({
      secret: SECRET,
      store,
      brandName: 'Kira',
      onUnsubscribed: vi.fn(async () => {
        throw new Error('mirror down')
      }),
    })
    const token = await signUnsubscribeToken('owner@example.com', SECRET)

    const response = await route.POST(
      new Request(`https://kira.app/unsubscribe?t=${encodeURIComponent(token)}`, { method: 'POST' }),
    )

    expect(response.status).toBe(200)
    expect(store.suppressed.has('owner@example.com')).toBe(true)
  })

  it('accepts the token from a posted form body (the confirm button)', async () => {
    const { store, route, token } = await routeFor()
    const body = new FormData()
    body.set('t', token)

    await route.POST(new Request('https://kira.app/unsubscribe', { method: 'POST', body }))

    expect(store.suppressed.has('owner@example.com')).toBe(true)
  })
})

describe('List-Unsubscribe headers', () => {
  it('emits both RFC 2369 and RFC 8058 one-click headers', () => {
    const headers = listUnsubscribeHeaders('https://kira.app/unsubscribe?t=abc')
    expect(headers['List-Unsubscribe']).toBe('<https://kira.app/unsubscribe?t=abc>')
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })
})
