import { describe, expect, it, vi } from 'vitest'

import { createSubscriptionCheckoutSession } from '../src/checkout'

/**
 * Tax rates on a subscription checkout.
 *
 * These exist because the defect they guard is INVISIBLE: a product quoting "$999 + GST" with no
 * tax rate configured produces a perfectly healthy session, a successful payment, and an invoice
 * with no GST line. Nothing errors. The only way to catch it is to assert the parameter.
 */

function stubStripe() {
  const sessions = vi.fn(async (params: unknown) => ({ id: 'cs_1', url: 'https://pay', params }))
  const stripe = {
    checkout: { sessions: { create: sessions } },
  }
  return { stripe: stripe as never, sessions }
}

const BASE = {
  lineItem: { priceId: 'price_1' },
  successUrl: 'https://app/ok',
  cancelUrl: 'https://app/no',
} as const

/** The params object handed to Stripe on the single call. */
function sentParams(sessions: ReturnType<typeof stubStripe>['sessions']) {
  return sessions.mock.calls[0][0] as Record<string, never>
}

describe('taxRateIds', () => {
  it('applies rates as subscription default_tax_rates, so RENEWAL invoices are taxed too', async () => {
    const { stripe, sessions } = stubStripe()

    await createSubscriptionCheckoutSession({ stripe, ...BASE, taxRateIds: ['txr_gst'] })

    const params = sentParams(sessions)
    expect(params.subscription_data).toMatchObject({ default_tax_rates: ['txr_gst'] })
    // NOT on the line item: a line-item rate covers the first invoice and silently stops applying,
    // which is a year of untaxed invoices that nobody notices until reconciliation.
    expect(params.line_items[0]).not.toHaveProperty('tax_rates')
  })

  it('carries multiple rates', async () => {
    const { stripe, sessions } = stubStripe()

    await createSubscriptionCheckoutSession({ stripe, ...BASE, taxRateIds: ['txr_a', 'txr_b'] })

    expect(sentParams(sessions).subscription_data).toMatchObject({
      default_tax_rates: ['txr_a', 'txr_b'],
    })
  })

  it('sends no subscription_data at all when tax is not configured', async () => {
    const { stripe, sessions } = stubStripe()

    await createSubscriptionCheckoutSession({ stripe, ...BASE })

    expect(sentParams(sessions)).not.toHaveProperty('subscription_data')
  })

  it('treats an EMPTY array as absent, never as a configured "no tax"', async () => {
    const { stripe, sessions } = stubStripe()

    // The realistic path here is a caller whose env lookup returned nothing and mapped it to [].
    // Sending `default_tax_rates: []` would let that read as deliberate.
    await createSubscriptionCheckoutSession({ stripe, ...BASE, taxRateIds: [] })

    expect(sentParams(sessions)).not.toHaveProperty('subscription_data')
  })

  it('coexists with subscription metadata rather than replacing it', async () => {
    const { stripe, sessions } = stubStripe()

    await createSubscriptionCheckoutSession({
      stripe,
      ...BASE,
      taxRateIds: ['txr_gst'],
      subscriptionMetadata: { plan: 'growth' },
    })

    expect(sentParams(sessions).subscription_data).toMatchObject({
      default_tax_rates: ['txr_gst'],
      metadata: { plan: 'growth' },
    })
  })
})
