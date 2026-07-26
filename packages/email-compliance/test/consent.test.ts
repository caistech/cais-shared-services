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

describe('unsubscribe page branding', () => {
  // An unsubscribe page is reached from an email, by a mildly annoyed person, and asks them to
  // confirm an action — the exact shape of a phishing page. Field feedback on the unbranded version
  // was "my first thought is phishing and my second is I'll mark it as spam", which costs more
  // deliverability than the unsubscribe does. These assert the page says who it belongs to.
  const brand = {
    logoUrl: 'https://kira.app/avatar.jpeg',
    homeUrl: 'https://kira.app',
    accent: '#db2777',
    supportEmail: 'hello@kira.app',
  }
  const sender = {
    name: 'Global Buildtech Australia Pty Ltd',
    abn: '54 672 395 685',
    postal: '76-84 Brunswick Street, Fortitude Valley QLD 4006',
    email: 'dennis@corporateaisolutions.com',
    phone: '+61402612471',
  }

  async function brandedPage() {
    const store = memoryStore()
    const route = createUnsubscribeRoute({ secret: SECRET, store, brandName: 'Kira', brand, sender })
    const token = await signUnsubscribeToken('owner@example.com', SECRET)
    const response = await route.GET(
      new Request(`https://kira.app/unsubscribe?t=${encodeURIComponent(token)}`),
    )
    return response.text()
  }

  it('identifies itself — logo, brand, and a link back to something real', async () => {
    const html = await brandedPage()
    expect(html).toContain('https://kira.app/avatar.jpeg')
    expect(html).toContain('Back to Kira')
    expect(html).toContain('hello@kira.app')
  })

  it('carries the Spam Act identification the email carried', async () => {
    const html = await brandedPage()
    expect(html).toContain('Global Buildtech Australia Pty Ltd')
    expect(html).toContain('ABN 54 672 395 685')
    expect(html).toContain('Fortitude Valley')
  })

  it('applies the brand accent to the confirm button', async () => {
    const html = await brandedPage()
    expect(html).toContain('#db2777')
  })

  it('still renders without any branding — the option is additive', async () => {
    const store = memoryStore()
    const route = createUnsubscribeRoute({ secret: SECRET, store, brandName: 'Kira' })
    const token = await signUnsubscribeToken('owner@example.com', SECRET)
    const html = await route
      .GET(new Request(`https://kira.app/unsubscribe?t=${encodeURIComponent(token)}`))
      .then((r) => r.text())

    expect(html).toContain('Yes, unsubscribe me')
    expect(html).not.toContain('<img')
  })

  it('escapes brand and sender values rather than injecting them raw', async () => {
    const store = memoryStore()
    const route = createUnsubscribeRoute({
      secret: SECRET,
      store,
      brandName: '<script>alert(1)</script>',
      sender: { name: 'A & B "Co"', email: 'x@y.com' },
    })
    const token = await signUnsubscribeToken('owner@example.com', SECRET)
    const html = await route
      .GET(new Request(`https://kira.app/unsubscribe?t=${encodeURIComponent(token)}`))
      .then((r) => r.text())

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B &quot;Co&quot;')
  })

  it('escapes the token it echoes back into the confirm form', async () => {
    // The token is the only attacker-controlled value on the page, and it reaches a value=""
    // attribute. It is safe TODAY only because it gets there after HMAC verification and a
    // verifying token is base64url — an invariant held by a different function three frames away.
    // Escaped at the point of use so this does not depend on that holding.
    const store = memoryStore()
    const route = createUnsubscribeRoute({ secret: SECRET, store, brandName: 'Kira' })
    const html = await route
      .GET(new Request('https://kira.app/unsubscribe?t=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E'))
      .then((r) => r.text())

    expect(html).not.toContain('<script>alert(1)</script>')
  })
})
