/**
 * Stripe test/live mode — one switch, with the dangerous mistakes made impossible rather than
 * merely unlikely.
 *
 *   STRIPE_LIVE_MODE=false  → test keys, test prices   (the default, and the default when unset)
 *   STRIPE_LIVE_MODE=true   → live keys, live prices
 *
 * Both sets live in the environment at once. Nothing is edited to go live; a single flag is
 * flipped, and it flips back just as fast when something looks wrong — which is the entire reason
 * to do it this way rather than swapping key values in and out under pressure.
 *
 * THE TWO FAILURES THIS PREVENTS. Both are silent in every system that does not check:
 *
 *   1. Believing you are live when you are not. If the flag is on and a live key is missing or
 *      malformed, this THROWS rather than falling back to test — a fallback takes fake payments
 *      that look real, and you learn about it from the bank statement.
 *   2. Believing you are testing when you are live. If the flag is off but a live key sits in the
 *      test slot, this THROWS. That direction charges real cards belonging to real people during
 *      what somebody thinks is a rehearsal.
 *
 * PROVENANCE. Lifted from Kira's `lib/billing/stripe-mode.ts`, which is the mature implementation
 * of this in the portfolio; MMCBuild has the primitive version (one key, no mode concept) and is a
 * migration target, not a source. Kira's logic is preserved as-is. What is NEW here is everything
 * under "price IDs" and "publishable key" below — the two halves Kira never needed and therefore
 * never had, because it prices dynamically via `price_data` and uses Stripe-hosted checkout.
 *
 * WHY THAT MATTERS: those are exactly the halves a product with FIXED prices and an embedded
 * checkout will hit on its first flip, and until now nothing in the portfolio had driven this
 * switch with fixed prices at all.
 */
import type Stripe from 'stripe'

export type StripeMode = 'live' | 'test'

/**
 * Which mode we are in.
 *
 * Anything other than the exact string "true" is TEST. A typo, an empty string, a missing variable
 * — all test. The safe state is the one you fall into by accident.
 */
export function stripeMode(): StripeMode {
  return process.env.STRIPE_LIVE_MODE === 'true' ? 'live' : 'test'
}

export function isLiveMode(): boolean {
  return stripeMode() === 'live'
}

/** The secret key for the current mode, or a loud error naming exactly what is wrong. */
export function stripeSecretKey(): string {
  const mode = stripeMode()

  if (mode === 'live') {
    const key = process.env.STRIPE_SECRET_KEY_LIVE
    if (!key) {
      throw new Error(
        'STRIPE_LIVE_MODE is true but STRIPE_SECRET_KEY_LIVE is not set. Refusing to fall back to ' +
          'the test key — that would take payments that look real and are not.'
      )
    }
    if (!key.startsWith('sk_live')) {
      throw new Error(
        'STRIPE_LIVE_MODE is true but STRIPE_SECRET_KEY_LIVE is not a live key (expected sk_live…).'
      )
    }
    return key
  }

  // STRIPE_SECRET_KEY is the historical name and stays the test slot, so a repo adopting this
  // switch has to rename nothing.
  const key = process.env.STRIPE_SECRET_KEY_TEST ?? process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.')
  if (key.startsWith('sk_live')) {
    throw new Error(
      'A LIVE Stripe key is in the test slot while STRIPE_LIVE_MODE is off. Refusing to run: this ' +
        'charges real cards during what looks like a test. Move it to STRIPE_SECRET_KEY_LIVE.'
    )
  }
  return key
}

/**
 * The webhook signing secret for the current mode.
 *
 * Test and live endpoints have DIFFERENT signing secrets and BOTH start `whsec_`, so nothing in the
 * string reveals a mismatch. Flipping the key without flipping this is the classic way to go live
 * and have every webhook fail signature verification — silently — while checkout appears to work
 * perfectly.
 */
export function stripeWebhookSecret(): string {
  const mode = stripeMode()

  if (mode === 'live') {
    const secret = process.env.STRIPE_WEBHOOK_SECRET_LIVE
    if (!secret) {
      throw new Error(
        'STRIPE_LIVE_MODE is true but STRIPE_WEBHOOK_SECRET_LIVE is not set. Register a LIVE ' +
          'webhook endpoint in Stripe and set its signing secret — the test secret cannot verify ' +
          'live events.'
      )
    }
    return secret
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET_TEST ?? process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.')
  return secret
}

/**
 * A price ID for the current mode.
 *
 * NEW — and the half that will bite first. A Stripe `price_…` belongs to ONE mode: a price created
 * in test does not exist in live. A product holding fixed price IDs in single-slot env vars
 * (`STRIPE_FOUNDATION_PRICE_ID`) therefore keeps sending TEST price IDs after the flag is flipped,
 * and the live API answers `No such price` — at checkout, in front of a customer.
 *
 * MMCBuild has eleven price vars in exactly that single-slot shape. Kira never hit this because it
 * builds prices dynamically with `price_data`, which is why the pattern reached maturity without
 * ever covering it.
 *
 * Resolution, by mode:  STRIPE_PRICE_<NAME>_LIVE  |  STRIPE_PRICE_<NAME>_TEST
 * Legacy fallback (test only): STRIPE_PRICE_<NAME>, then STRIPE_<NAME>_PRICE_ID — so an existing
 * repo adopts this without renaming anything on day one.
 *
 * THROWS when absent. Deliberately not `?? ''`: an empty price ID fails deep inside a Stripe call
 * with a confusing error, at the worst possible moment, instead of at config time where it belongs.
 */
export function stripePriceId(name: string): string {
  const key = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const mode = stripeMode()

  if (mode === 'live') {
    const id = process.env[`STRIPE_PRICE_${key}_LIVE`]
    if (!id) {
      throw new Error(
        `STRIPE_LIVE_MODE is true but STRIPE_PRICE_${key}_LIVE is not set. A price created in test ` +
          `does not exist in live — create the live price in Stripe and set its id. Refusing to ` +
          `fall back to the test price, which the live API would reject as "No such price" at checkout.`
      )
    }
    if (!id.startsWith('price_')) {
      throw new Error(
        `STRIPE_PRICE_${key}_LIVE is "${id}", which is not a price id (expected price_…). A ` +
          `product id (prod_…) is the usual mix-up and Stripe rejects it at checkout.`
      )
    }
    return id
  }

  const id =
    process.env[`STRIPE_PRICE_${key}_TEST`] ??
    process.env[`STRIPE_PRICE_${key}`] ??
    process.env[`STRIPE_${key}_PRICE_ID`]
  if (!id) {
    throw new Error(
      `No test price id for "${name}". Set STRIPE_PRICE_${key}_TEST (or the legacy ` +
        `STRIPE_${key}_PRICE_ID).`
    )
  }
  if (!id.startsWith('price_')) {
    throw new Error(`Price id for "${name}" is "${id}", which is not a price id (expected price_…).`)
  }
  return id
}

/**
 * The publishable key for the current mode.
 *
 * ⚠️ THIS HALF IS NOT COVERED BY THE FLAG ALONE. `NEXT_PUBLIC_*` is inlined at BUILD time, so a
 * running deployment keeps whatever it was built with. Flipping STRIPE_LIVE_MODE switches the
 * server instantly and the browser bundle not at all — meaning a live secret key and a test
 * publishable key can coexist, and the mismatch surfaces as a confusing client-side failure.
 *
 * A product using Stripe-HOSTED checkout has no publishable key at all and can ignore this
 * entirely (Kira's case — the server redirects, the browser never talks to Stripe). A product using
 * Elements or embedded checkout MUST REDEPLOY when it flips the flag. There is no way around it,
 * so the rule is stated rather than hidden.
 */
export function stripePublishableKey(): string {
  const mode = stripeMode()
  const key =
    mode === 'live'
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
      : (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST ??
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

  if (!key) {
    throw new Error(
      `No ${mode} publishable key. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_${mode.toUpperCase()}. ` +
        `Remember this is inlined at BUILD time — flipping STRIPE_LIVE_MODE is not enough, the app ` +
        `must be redeployed for the browser to pick it up.`
    )
  }

  const expected = mode === 'live' ? 'pk_live' : 'pk_test'
  if (!key.startsWith(expected)) {
    throw new Error(
      `The ${mode}-mode publishable key does not start with ${expected}. The server and the browser ` +
        `are in different Stripe modes — usually a deploy that flipped the flag without rebuilding.`
    )
  }
  return key
}

export interface PreflightResult {
  mode: StripeMode
  ok: boolean
  /** One line per thing checked, in the order checked. */
  checks: { name: string; ok: boolean; detail?: string }[]
}

/**
 * Can this deployment actually transact in its current mode?
 *
 * NEW. Kira's switch is safe at the point of USE — every accessor throws on a bad config. But the
 * point of use is a customer at checkout, and "we found out when someone tried to pay" is a poor
 * discovery mechanism for a flag you flip deliberately. This answers the same questions before the
 * flip instead of during it, and never throws, so it is safe to expose on a health route or run in
 * CI as a gate.
 *
 * Pass the price names the product actually needs; they are the half most likely to be missing,
 * because live prices must be created separately in Stripe and nothing reminds you.
 */
export function stripeModePreflight(
  options: { priceNames?: string[]; publishable?: boolean } = {}
): PreflightResult {
  const mode = stripeMode()
  const checks: PreflightResult['checks'] = []

  const check = (name: string, fn: () => unknown) => {
    try {
      fn()
      checks.push({ name, ok: true })
    } catch (err) {
      checks.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) })
    }
  }

  check('secret key', stripeSecretKey)
  check('webhook secret', stripeWebhookSecret)
  for (const price of options.priceNames ?? []) check(`price: ${price}`, () => stripePriceId(price))
  if (options.publishable) check('publishable key', stripePublishableKey)

  return { mode, ok: checks.every((c) => c.ok), checks }
}

// Built lazily and cached per mode. Constructing at module load throws during `next build`
// page-data collection, when no keys are present.
let cached: { mode: StripeMode; client: Stripe } | null = null

/**
 * The Stripe client for the current mode.
 *
 * `stripeCtor` is the `Stripe` class — passed in rather than imported, because `stripe` is a PEER
 * dependency here and this module must not pull a second copy into the consumer's bundle.
 */
export function getStripe(stripeCtor: new (key: string, config?: Stripe.StripeConfig) => Stripe): Stripe {
  const mode = stripeMode()
  if (cached && cached.mode === mode) return cached.client

  const client = new stripeCtor(stripeSecretKey(), {} as Stripe.StripeConfig)
  cached = { mode, client }

  // Log the mode once per process. When something is wrong with billing, "which mode was it in?" is
  // the first question, and it should be answerable from the logs rather than by inspection.
  console.log(`[billing] Stripe client constructed in ${mode.toUpperCase()} mode`)
  return client
}

/** Test seam — drops the cached client so a test can change env between calls. */
export function __resetStripeModeCache(): void {
  cached = null
}
