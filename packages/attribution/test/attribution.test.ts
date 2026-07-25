import { describe, expect, it } from 'vitest'

import { createAttribution, firstTouchNow, type FirstTouch } from '../src/index'

const SECRET = 'test-attribution-secret'
const attribution = createAttribution({ secret: SECRET, cookiePrefix: 'k_ft_' })

const touch = (over: Partial<FirstTouch> = {}): FirstTouch => ({
  scope: 'kira',
  referrerId: 'broker_1',
  referrerOrgId: 'brokerage_9',
  token: 'tok_abc',
  firstTouchAt: new Date('2027-01-10T00:00:00.000Z').toISOString(),
  ...over,
})

describe('sign / parse round-trip', () => {
  it('preserves every field the commission calculation needs', () => {
    const parsed = attribution.parse(attribution.sign(touch()))
    expect(parsed).toEqual(touch())
  })

  it('scopes the cookie name so two referrers can introduce the same person to two things', () => {
    expect(attribution.cookieName('kira')).toBe('k_ft_kira')
    expect(attribution.cookieName('seafields')).toBe('k_ft_seafields')
  })
})

describe('tamper resistance', () => {
  it('rejects a payload edited to name a different referrer', () => {
    // The attack this exists to stop: rewriting yourself into someone else's introduction.
    const signed = attribution.sign(touch())
    const [body, mac] = signed.split('.')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    decoded.a = 'broker_impostor'
    const forgedBody = Buffer.from(JSON.stringify(decoded)).toString('base64url')

    expect(attribution.parse(`${forgedBody}.${mac}`)).toBeNull()
  })

  it('rejects a signature made with a different secret', () => {
    const other = createAttribution({ secret: 'not-the-secret', cookiePrefix: 'k_ft_' })
    expect(attribution.parse(other.sign(touch()))).toBeNull()
  })

  it('rejects malformed, empty and unsigned values without throwing', () => {
    for (const value of ['', null, undefined, 'no-dot', '.', 'a.b']) {
      expect(attribution.parse(value as string)).toBeNull()
    }
  })

  it('rejects a signature of the wrong length rather than throwing on the compare', () => {
    // timingSafeEqual throws on length mismatch — the length check must come first.
    const signed = attribution.sign(touch())
    expect(() => attribution.parse(`${signed.split('.')[0]}.short`)).not.toThrow()
    expect(attribution.parse(`${signed.split('.')[0]}.short`)).toBeNull()
  })
})

describe('the attribution window', () => {
  it('honours a touch inside the window', () => {
    const recent = firstTouchNow({ scope: 'kira', referrerId: 'b1', referrerOrgId: null, token: 't' })
    expect(attribution.parse(attribution.sign(recent))).not.toBeNull()
  })

  it('treats an expired touch as NO attribution, not as a stale one', () => {
    // The distinction matters: expired must let a later valid referrer be recorded, rather than
    // leaving the visitor permanently attributed to someone out of window.
    const old = touch({ firstTouchAt: new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString() })
    expect(attribution.parse(attribution.sign(old))).toBeNull()
    expect(attribution.shouldWrite(attribution.sign(old))).toBe(true)
  })

  it('respects a custom window', () => {
    const shortWindow = createAttribution({ secret: SECRET, maxAgeSeconds: 60 })
    const twoMinutesAgo = touch({ firstTouchAt: new Date(Date.now() - 120_000).toISOString() })
    expect(shortWindow.parse(shortWindow.sign(twoMinutesAgo))).toBeNull()
  })
})

describe('first-touch wins', () => {
  it('keeps the original referrer when a second link is followed', () => {
    // The commercial rule: the person who made the introduction is paid, not the last click.
    const first = touch({ referrerId: 'broker_first' })
    const second = touch({ referrerId: 'broker_second' })

    const retained = attribution.retainFirstTouch(attribution.sign(first), second)

    expect(retained.referrerId).toBe('broker_first')
    expect(retained.firstTouchAt).toBe(first.firstTouchAt)
  })

  it('accepts the incoming touch when there is no valid existing one', () => {
    expect(attribution.retainFirstTouch(null, touch()).referrerId).toBe('broker_1')
    expect(attribution.shouldWrite(null)).toBe(true)
  })

  it('does not rewrite a valid existing cookie', () => {
    expect(attribution.shouldWrite(attribution.sign(touch()))).toBe(false)
  })

  it('replaces a TAMPERED cookie rather than trusting it', () => {
    expect(attribution.shouldWrite('garbage.value')).toBe(true)
  })
})

describe('cookie attributes', () => {
  it('is HttpOnly and SameSite=Lax', () => {
    const options = attribution.cookieOptions()
    // HttpOnly: not readable or forgeable from page JS.
    expect(options.httpOnly).toBe(true)
    // Lax, not Strict: the link is followed cross-site (an email, the referrer's own page), and
    // Strict would drop the cookie on the very navigation that establishes the attribution.
    expect(options.sameSite).toBe('lax')
    expect(options.maxAge).toBe(90 * 24 * 3600)
  })
})

describe('secret resolution', () => {
  it('does not throw at construction when no secret is configured', () => {
    // Importing this during a build with no env must not explode; it throws on USE.
    expect(() => createAttribution({ secretEnvKeys: ['DEFINITELY_UNSET_SECRET'] })).not.toThrow()
  })

  it('throws a named error when actually used without a secret', () => {
    const unconfigured = createAttribution({ secretEnvKeys: ['DEFINITELY_UNSET_SECRET'] })
    expect(() => unconfigured.sign(touch())).toThrow(/DEFINITELY_UNSET_SECRET/)
  })
})

describe('wire-format compatibility with F2K-Projects', () => {
  it('reads a cookie signed by the original implementation', () => {
    // The compact keys (e/a/g/t/ts) are deliberately unchanged so cookies already in the wild stay
    // valid when F2K migrates onto this package. This test is what stops a future tidy-up.
    const crypto = require('node:crypto') as typeof import('node:crypto')
    const legacyPayload = { e: 'seafields', a: 'agent_7', g: 'agency_3', t: 'tok', ts: Date.now() }
    const body = Buffer.from(JSON.stringify(legacyPayload)).toString('base64url')
    const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')

    const parsed = attribution.parse(`${body}.${mac}`)

    expect(parsed?.scope).toBe('seafields')
    expect(parsed?.referrerId).toBe('agent_7')
    expect(parsed?.referrerOrgId).toBe('agency_3')
  })
})
