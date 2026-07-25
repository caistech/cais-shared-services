/**
 * @caistech/attribution — first-touch referral attribution.
 *
 * Extracted from F2K-Projects' ROI portal, which had the only correct implementation in the
 * portfolio: HMAC-signed, HttpOnly, scoped, windowed, and DB-enforced immutable. Every other
 * variant was a capture-only `?ref=` tag with no signature and no immutability — fine for
 * analytics, unusable for deciding who gets paid.
 *
 * That is the distinction this package exists for. When attribution drives COMMISSION, three
 * properties stop being nice-to-haves:
 *   1. TAMPER-EVIDENT — the payload is HMAC-signed, so a referrer can't rewrite themselves into
 *      someone else's introduction from page JS.
 *   2. FIRST-TOUCH WINS — a later touch never overwrites an earlier valid one. The person who made
 *      the introduction is the person who gets paid, not the last link clicked.
 *   3. IMMUTABLE ONCE WRITTEN — enforced in the database (see migration.sql), because an
 *      application-layer rule is one forgotten code path away from a silent reassignment.
 *
 * Zero dependencies; Node crypto only.
 *
 * WIRE FORMAT NOTE: the signed payload keys (e/a/g/t/ts) are deliberately identical to
 * F2K-Projects' original, so cookies already issued in the wild stay valid when F2K migrates onto
 * this package. Do not "tidy" them.
 */

import crypto from 'node:crypto'

/** 90 days. The window a first touch is honoured for. */
export const DEFAULT_MAX_AGE_SECONDS = 90 * 24 * 60 * 60

export interface FirstTouch {
  /**
   * What the introduction was TO — an estate slug, a product slug, a campaign. Lets one person be
   * introduced to different things by different referrers without collision. Use a constant when
   * the product has only one thing to be introduced to.
   */
  scope: string
  /** Who introduced them (the agent / broker / introducer id). */
  referrerId: string
  /** Their firm, when there is one — the payee may be the brokerage, not the individual. */
  referrerOrgId: string | null
  /** The invite/referral token the link carried, kept for audit. */
  token: string
  /** ISO timestamp of the FIRST touch (epoch ms is what's carried in the signed blob). */
  firstTouchAt: string
}

export interface AttributionOptions {
  /**
   * HMAC secret. Defaults to `ATTRIBUTION_SECRET`. Resolved lazily at call time so importing this
   * module during a build (with no env) doesn't throw.
   */
  secret?: string
  /** Env var names to try, in order, when `secret` isn't given. */
  secretEnvKeys?: string[]
  /** Cookie name prefix. Default `ft_`. */
  cookiePrefix?: string
  /** Attribution window. Default 90 days. */
  maxAgeSeconds?: number
}

export interface CookieOptions {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
}

export interface Attribution {
  cookieName(scope: string): string
  /** Serialise + sign a first-touch payload for the cookie value. */
  sign(touch: FirstTouch): string
  /** Verify + parse a cookie value. Returns null if missing, tampered, malformed, or expired. */
  parse(cookieValue: string | undefined | null): FirstTouch | null
  /** Cookie attributes to set alongside the value. */
  cookieOptions(): CookieOptions
  /**
   * First-touch-wins resolution. Returns the touch that should be persisted given what is already
   * on the visitor and what this visit carries.
   */
  retainFirstTouch(existingCookieValue: string | undefined | null, incoming: FirstTouch): FirstTouch
  /** True when the incoming touch should be WRITTEN (i.e. there is no valid existing one). */
  shouldWrite(existingCookieValue: string | undefined | null): boolean
}

export function createAttribution(options: AttributionOptions = {}): Attribution {
  const prefix = options.cookiePrefix ?? 'ft_'
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS
  const envKeys = options.secretEnvKeys ?? ['ATTRIBUTION_SECRET']

  function secret(): string {
    if (options.secret) return options.secret
    for (const key of envKeys) {
      const value = process.env[key]
      if (value) return value
    }
    throw new Error(`attribution: no secret — set ${envKeys.join(' or ')}`)
  }

  function mac(body: string): string {
    return crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  }

  function parse(cookieValue: string | undefined | null): FirstTouch | null {
    if (!cookieValue) return null
    const dot = cookieValue.lastIndexOf('.')
    if (dot <= 0) return null
    const body = cookieValue.slice(0, dot)
    const signature = cookieValue.slice(dot + 1)

    const expected = mac(body)
    // Constant-time compare; lengths must match first (timingSafeEqual throws otherwise).
    if (
      expected.length !== signature.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    ) {
      return null
    }

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      if (
        !payload ||
        typeof payload.e !== 'string' ||
        typeof payload.a !== 'string' ||
        typeof payload.ts !== 'number'
      ) {
        return null
      }
      // Outside the window is treated as no attribution at all, not as a stale attribution —
      // an expired first touch must not keep a later, valid referrer from being recorded.
      if (Date.now() - payload.ts > maxAgeSeconds * 1000) return null
      return {
        scope: payload.e,
        referrerId: payload.a,
        referrerOrgId: payload.g ?? null,
        token: typeof payload.t === 'string' ? payload.t : '',
        firstTouchAt: new Date(payload.ts).toISOString(),
      }
    } catch {
      return null
    }
  }

  return {
    cookieName: (scope) => `${prefix}${scope}`,

    sign(touch) {
      const payload = {
        e: touch.scope,
        a: touch.referrerId,
        g: touch.referrerOrgId,
        t: touch.token,
        ts: new Date(touch.firstTouchAt).getTime(),
      }
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
      return `${body}.${mac(body)}`
    },

    parse,

    cookieOptions: () => ({
      httpOnly: true,
      sameSite: 'lax',
      // Lax + Secure: the link is followed cross-site (an email or the referrer's own page), so
      // Strict would drop the cookie on the very navigation that establishes the attribution.
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: maxAgeSeconds,
    }),

    shouldWrite: (existing) => parse(existing) === null,

    retainFirstTouch(existing, incoming) {
      // First touch wins. The introduction was made by whoever got here first; a later link does
      // not reassign it, which is precisely what stops referrers from poaching each other's
      // introductions by getting the last click.
      return parse(existing) ?? incoming
    },
  }
}

/** A first touch stamped now. Convenience for the resolver route. */
export function firstTouchNow(
  parts: Omit<FirstTouch, 'firstTouchAt'>,
  at: Date = new Date(),
): FirstTouch {
  return { ...parts, firstTouchAt: at.toISOString() }
}
