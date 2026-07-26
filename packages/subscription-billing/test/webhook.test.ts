import { describe, expect, it, vi } from 'vitest'

import { createSubscriptionCheckoutSession } from '../src/checkout'
import type { SubscriberRecord, SubscriptionAdapter, SubscriptionState } from '../src/types'
import { handleSubscriptionWebhook, normalizeStatus } from '../src/webhook'

// ─── fixtures ────────────────────────────────────────────────────────────────

const EVENT_AT = 1_800_000_000 // seconds; ISO 2027-01-15T08:00:00.000Z
const EVENT_ISO = new Date(EVENT_AT * 1000).toISOString()

function subscription(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    status: 'trialing',
    customer: 'cus_123',
    trial_end: EVENT_AT + 30 * 86400,
    metadata: {},
    items: { data: [{ price: { id: 'price_123' }, current_period_end: EVENT_AT + 30 * 86400 }] },
    ...over,
  }
}

function event(type: string, object: unknown, created = EVENT_AT) {
  return { id: `evt_${type}_${created}`, type, created, data: { object } }
}

function stubStripe(evt: unknown, sub: unknown = subscription()) {
  return {
    webhooks: { constructEvent: () => evt },
    subscriptions: { retrieve: vi.fn(async () => sub) },
  } as never
}

function stubAdapter(over: Partial<SubscriptionAdapter> = {}) {
  const applied: SubscriptionState[] = []
  const adapter: SubscriptionAdapter = {
    find: async () => ({ id: 'user_1', lastStripeEventAt: null }) as SubscriberRecord,
    apply: async (_record, state) => {
      applied.push(state)
    },
    ...over,
  }
  return { adapter, applied }
}

function makeIdempotency(seen = new Set<string>()) {
  const released: string[] = []
  return {
    seen,
    released,
    store: {
      claim: async (e: { id: string }) => {
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      },
      release: async (id: string) => {
        // A real release DELETES the claim row — the mock must too, or the retry it exists to
        // enable is still answered "duplicate".
        released.push(id)
        seen.delete(id)
      },
    },
  }
}

// ─── status normalization ────────────────────────────────────────────────────

describe('normalizeStatus', () => {
  it("maps Stripe's one-L 'canceled' to the portfolio's 'cancelled'", () => {
    // The whole point of the mapping: Kira's AppUser type and admin panel read 'cancelled'.
    // The pre-package webhook wrote the US spelling, which no reader matched.
    expect(normalizeStatus('canceled')).toBe('cancelled')
  })

  it('preserves trialing rather than flattening it to active', () => {
    expect(normalizeStatus('trialing')).toBe('trialing')
  })

  it('collapses both incomplete states', () => {
    expect(normalizeStatus('incomplete')).toBe('incomplete')
    expect(normalizeStatus('incomplete_expired')).toBe('incomplete')
  })
})

// ─── signature ───────────────────────────────────────────────────────────────

describe('signature verification', () => {
  it('rejects a request with no stripe-signature header', async () => {
    const { adapter } = stubAdapter()
    const res = await handleSubscriptionWebhook(
      { stripe: stubStripe(null), webhookSecret: 'whsec', adapter },
      '{}',
      null,
    )
    expect(res.status).toBe(400)
    expect(res.body.outcome).toBe('missing_signature')
  })

  it('rejects a bad signature without touching the adapter', async () => {
    const apply = vi.fn()
    const stripe = {
      webhooks: {
        constructEvent: () => {
          throw new Error('no signatures found matching the expected signature')
        },
      },
    } as never
    const res = await handleSubscriptionWebhook(
      { stripe, webhookSecret: 'whsec', adapter: { find: async () => null, apply } },
      '{}',
      'sig',
    )
    expect(res.status).toBe(400)
    expect(res.body.outcome).toBe('signature_invalid')
    expect(apply).not.toHaveBeenCalled()
  })
})

// ─── the reducer ─────────────────────────────────────────────────────────────

describe('handleSubscriptionWebhook', () => {
  it('records a trialing checkout as trialing, with the trial end and period end', async () => {
    const evt = event('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_123',
      subscription: 'sub_123',
      customer_details: { email: 'Owner@Example.com' },
      metadata: {},
    })
    const { adapter, applied } = stubAdapter()
    const res = await handleSubscriptionWebhook(
      { stripe: stubStripe(evt), webhookSecret: 'whsec', adapter },
      '{}',
      'sig',
    )

    expect(res.status).toBe(200)
    expect(res.body.outcome).toBe('applied')
    expect(applied[0].status).toBe('trialing')
    expect(applied[0].trialEndsAt).toBe(new Date((EVENT_AT + 30 * 86400) * 1000).toISOString())
    expect(applied[0].currentPeriodEnd).toBe(new Date((EVENT_AT + 30 * 86400) * 1000).toISOString())
    expect(applied[0].priceId).toBe('price_123')
  })

  it('lower-cases the email it looks the subscriber up by', async () => {
    const evt = event('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_123',
      subscription: 'sub_123',
      customer_details: { email: 'Owner@Example.COM' },
    })
    const find = vi.fn(async () => ({ id: 'user_1' }))
    await handleSubscriptionWebhook(
      {
        stripe: stubStripe(evt),
        webhookSecret: 'whsec',
        adapter: { find, apply: async () => {} },
      },
      '{}',
      'sig',
    )
    expect(find.mock.calls[0][0].email).toBe('owner@example.com')
  })

  it('acks an unhandled event type without consuming an idempotency claim', async () => {
    const evt = event('customer.created', { id: 'cus_1' })
    const idem = makeIdempotency()
    const { adapter, applied } = stubAdapter()
    const res = await handleSubscriptionWebhook(
      { stripe: stubStripe(evt), webhookSecret: 'whsec', adapter, idempotency: idem.store },
      '{}',
      'sig',
    )
    expect(res.body.outcome).toBe('ignored_type')
    expect(applied).toHaveLength(0)
    // Not claiming means a later replay still works if we start handling the type.
    expect(idem.seen.size).toBe(0)
  })

  it('short-circuits a redelivered event without re-applying it', async () => {
    const evt = event('customer.subscription.updated', subscription({ status: 'active' }))
    const idem = makeIdempotency()
    const { adapter, applied } = stubAdapter()
    const opts = {
      stripe: stubStripe(evt),
      webhookSecret: 'whsec',
      adapter,
      idempotency: idem.store,
    }

    const first = await handleSubscriptionWebhook(opts, '{}', 'sig')
    const second = await handleSubscriptionWebhook(opts, '{}', 'sig')

    expect(first.body.outcome).toBe('applied')
    expect(second.body.outcome).toBe('duplicate')
    expect(applied).toHaveLength(1)
  })

  it('ignores an out-of-order event older than the state already stored', async () => {
    const evt = event('customer.subscription.updated', subscription({ status: 'active' }))
    const newer = new Date((EVENT_AT + 60) * 1000).toISOString()
    const { adapter, applied } = stubAdapter({
      find: async () => ({ id: 'user_1', lastStripeEventAt: newer }),
    })

    const res = await handleSubscriptionWebhook(
      { stripe: stubStripe(evt), webhookSecret: 'whsec', adapter },
      '{}',
      'sig',
    )

    expect(res.body.outcome).toBe('stale')
    expect(applied).toHaveLength(0)
  })

  it('releases the idempotency claim when the apply fails, so the retry can run', async () => {
    // Without the release, one transient DB error permanently drops a subscription event:
    // Stripe retries, the reducer sees a claimed id, and acks "duplicate" forever.
    const evt = event('customer.subscription.updated', subscription({ status: 'active' }))
    const idem = makeIdempotency()
    let attempt = 0
    const applied: SubscriptionState[] = []
    const adapter: SubscriptionAdapter = {
      find: async () => ({ id: 'user_1', lastStripeEventAt: null }),
      apply: async (_r, state) => {
        attempt += 1
        if (attempt === 1) throw new Error('connection reset')
        applied.push(state)
      },
    }
    const opts = {
      stripe: stubStripe(evt),
      webhookSecret: 'whsec',
      adapter,
      idempotency: idem.store,
    }

    const failed = await handleSubscriptionWebhook(opts, '{}', 'sig')
    expect(failed.status).toBe(500)
    expect(idem.released).toEqual([evt.id])

    const retried = await handleSubscriptionWebhook(opts, '{}', 'sig')
    expect(retried.body.outcome).toBe('applied')
    expect(applied).toHaveLength(1)
  })

  it('acks (not retries) when the account does not exist yet, and reports it', async () => {
    // Stripe frequently delivers checkout.session.completed before the buyer has finished
    // setting a password. That is expected — onboarding writes the same fields.
    const evt = event('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_123',
      subscription: 'sub_123',
      customer_details: { email: 'new@example.com' },
    })
    const onSubscriberMissing = vi.fn()
    const res = await handleSubscriptionWebhook(
      {
        stripe: stubStripe(evt),
        webhookSecret: 'whsec',
        adapter: { find: async () => null, apply: async () => {}, onSubscriberMissing },
      },
      '{}',
      'sig',
    )
    expect(res.status).toBe(200)
    expect(res.body.outcome).toBe('subscriber_missing')
    expect(onSubscriberMissing).toHaveBeenCalledOnce()
  })

  it('fires onCancelled after writing a cancellation', async () => {
    const evt = event('customer.subscription.deleted', subscription({ status: 'canceled' }))
    const onCancelled = vi.fn()
    const { adapter, applied } = stubAdapter({ onCancelled })
    await handleSubscriptionWebhook(
      { stripe: stubStripe(evt), webhookSecret: 'whsec', adapter },
      '{}',
      'sig',
    )
    expect(applied[0].status).toBe('cancelled')
    expect(onCancelled).toHaveBeenCalledOnce()
  })

  it('marks a failed payment past_due even when Stripe still reports active', async () => {
    const invoice = {
      id: 'in_1',
      customer: 'cus_123',
      customer_email: 'owner@example.com',
      parent: { subscription_details: { subscription: 'sub_123' } },
    }
    const evt = event('invoice.payment_failed', invoice)
    const { adapter, applied } = stubAdapter()
    await handleSubscriptionWebhook(
      {
        stripe: stubStripe(evt, subscription({ status: 'active' })),
        webhookSecret: 'whsec',
        adapter,
      },
      '{}',
      'sig',
    )
    expect(applied[0].status).toBe('past_due')
  })

  it('reads the invoice→subscription link from the legacy top-level field too', async () => {
    // The link moved under parent.subscription_details in the 2025-03 API version; consumers
    // pin different SDK majors (Kira 20, this repo 17), so both shapes must resolve.
    const evt = event('invoice.payment_succeeded', {
      id: 'in_2',
      customer: 'cus_123',
      subscription: 'sub_123',
    })
    const { adapter, applied } = stubAdapter()
    await handleSubscriptionWebhook(
      {
        stripe: stubStripe(evt, subscription({ status: 'active' })),
        webhookSecret: 'whsec',
        adapter,
      },
      '{}',
      'sig',
    )
    expect(applied[0].status).toBe('active')
  })

  it('prefers a metadata user id over the email when locating the subscriber', async () => {
    const evt = event('customer.subscription.updated', {
      ...subscription({ status: 'active' }),
      metadata: { supabase_user_id: 'user_abc' },
    })
    const find = vi.fn(async () => ({ id: 'user_abc' }))
    await handleSubscriptionWebhook(
      { stripe: stubStripe(evt), webhookSecret: 'whsec', adapter: { find, apply: async () => {} } },
      '{}',
      'sig',
    )
    expect(find.mock.calls[0][0].userId).toBe('user_abc')
  })
})

// ─── checkout builder ────────────────────────────────────────────────────────

describe('createSubscriptionCheckoutSession', () => {
  function stripeSpy() {
    const create = vi.fn(async (params: Record<string, unknown>) => ({ id: 'cs_1', ...params }))
    return { create, stripe: { checkout: { sessions: { create } } } as never }
  }

  it('captures a card by default so a trial subscription has a payment method on file', async () => {
    // With trial + if_required, Stripe creates the subscription with no card and the first
    // charge silently fails 30 days later.
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { priceId: 'price_123' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      trialDays: 30,
    })
    const params = create.mock.calls[0][0]
    expect(params.payment_method_collection).toBe('always')
    expect((params.subscription_data as Record<string, unknown>).trial_period_days).toBe(30)
  })

  it('builds a dynamic price_data line for server-computed pricing', async () => {
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: {
        currency: 'AUD',
        unitAmount: 49900,
        productName: 'Kira Business Plan',
        productDescription: 'Always-on AI partner',
      },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
    })
    const line = (create.mock.calls[0][0].line_items as Record<string, unknown>[])[0]
    const priceData = line.price_data as Record<string, unknown>
    expect(priceData.currency).toBe('aud') // Stripe requires lower-case
    expect(priceData.unit_amount).toBe(49900)
    expect((priceData.recurring as Record<string, unknown>).interval).toBe('month')
  })

  it('omits subscription_data entirely when there is no trial and no metadata', async () => {
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { priceId: 'price_123' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
    })
    expect(create.mock.calls[0][0].subscription_data).toBeUndefined()
  })

  it('puts a fixed tax rate on the SUBSCRIPTION, so renewals stay taxed too', async () => {
    // A line-item tax rate covers the checkout invoice only; every renewal after it bills untaxed,
    // which nobody notices until an accountant asks why one invoice has GST and the next eleven
    // don't.
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { currency: 'AUD', unitAmount: 49900, productName: 'Plan' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      taxRates: ['txr_gst_au'],
    })
    const params = create.mock.calls[0][0]
    expect((params.subscription_data as Record<string, unknown>).default_tax_rates).toEqual(['txr_gst_au'])
  })

  it('makes a taxed dynamic price exclusive, because unspecified silently drops the tax line', async () => {
    // Stripe defaults price_data to tax_behavior 'unspecified', which disqualifies the line from
    // tax calculation — the invoice comes out with no tax and no error at all.
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { currency: 'AUD', unitAmount: 49900, productName: 'Plan' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      taxRates: ['txr_gst_au'],
    })
    const line = (create.mock.calls[0][0].line_items as Record<string, unknown>[])[0]
    expect((line.price_data as Record<string, unknown>).tax_behavior).toBe('exclusive')
  })

  it('leaves tax_behavior unset when no tax is in play', async () => {
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { currency: 'AUD', unitAmount: 49900, productName: 'Plan' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
    })
    const line = (create.mock.calls[0][0].line_items as Record<string, unknown>[])[0]
    expect((line.price_data as Record<string, unknown>).tax_behavior).toBeUndefined()
  })

  it('honours an explicit inclusive behaviour over the exclusive default', async () => {
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { currency: 'AUD', unitAmount: 49900, productName: 'Plan', taxBehavior: 'inclusive' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      taxRates: ['txr_gst_au'],
    })
    const line = (create.mock.calls[0][0].line_items as Record<string, unknown>[])[0]
    expect((line.price_data as Record<string, unknown>).tax_behavior).toBe('inclusive')
  })

  it('enables automatic tax, and only asks to save the address when there is a customer to save it on', async () => {
    const { create, stripe } = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { priceId: 'price_123' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      automaticTax: true,
      customerEmail: 'owner@example.com',
    })
    const params = create.mock.calls[0][0]
    expect(params.automatic_tax).toEqual({ enabled: true })
    // customer_update against customer_email is a Stripe API error, not a no-op.
    expect(params.customer_update).toBeUndefined()

    const second = stripeSpy()
    await createSubscriptionCheckoutSession({
      stripe: second.stripe,
      lineItem: { priceId: 'price_123' },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      automaticTax: true,
      customerId: 'cus_123',
    })
    expect(second.create.mock.calls[0][0].customer_update).toEqual({ address: 'auto' })
  })

  it('refuses a fixed rate and automatic tax together rather than silently picking one', async () => {
    const { stripe } = stripeSpy()
    await expect(
      createSubscriptionCheckoutSession({
        stripe,
        lineItem: { priceId: 'price_123' },
        successUrl: 'https://x/ok',
        cancelUrl: 'https://x/no',
        taxRates: ['txr_gst_au'],
        automaticTax: true,
      }),
    ).rejects.toThrow(/taxRates OR automaticTax/)
  })
})
