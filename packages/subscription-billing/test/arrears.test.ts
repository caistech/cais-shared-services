import { describe, expect, it, vi } from 'vitest'

import {
  cancelWithWaiver,
  ensureBillingMeter,
  ensureMeteredPrice,
  reportPeriodOwed,
} from '../src/arrears'
import { createSubscriptionCheckoutSession } from '../src/checkout'

// ─── fixtures ────────────────────────────────────────────────────────────────

/** `meters.list` is auto-paginating, so the stub has to be async-iterable like the real one. */
function meterList(meters: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const meter of meters) yield meter
    },
  }
}

function stubStripe(over: Record<string, unknown> = {}) {
  const created = {
    meters: vi.fn(async (params: unknown) => ({ id: 'mtr_new', ...(params as object) })),
    prices: vi.fn(async (params: unknown) => ({ id: 'price_new', ...(params as object) })),
    sessions: vi.fn(async (params: unknown) => ({ id: 'cs_1', url: 'https://pay', params })),
    meterEvents: vi.fn(async (params: unknown) => ({ identifier: 'evt', ...(params as object) })),
  }

  const stripe = {
    billing: {
      meters: { list: vi.fn(() => meterList([])), create: created.meters },
      meterEvents: { create: created.meterEvents },
    },
    prices: { list: vi.fn(async () => ({ data: [] })), create: created.prices },
    checkout: { sessions: { create: created.sessions } },
    subscriptions: { cancel: vi.fn(async (id: string, params: unknown) => ({ id, params })) },
    ...over,
  }

  return { stripe: stripe as never, raw: stripe, created }
}

// ─── the meter ───────────────────────────────────────────────────────────────

describe('ensureBillingMeter', () => {
  it('reuses an active meter with the same event name', async () => {
    const { stripe, raw, created } = stubStripe()
    raw.billing.meters.list = vi.fn(() =>
      meterList([{ id: 'mtr_other', event_name: 'other' }, { id: 'mtr_1', event_name: 'kira_month' }]),
    )

    const meter = await ensureBillingMeter({ stripe, eventName: 'kira_month' })

    expect(meter.id).toBe('mtr_1')
    // Two meters on one event name silently SPLIT the usage, so a duplicate create is not benign.
    expect(created.meters).not.toHaveBeenCalled()
  })

  it('creates a summing meter when none exists', async () => {
    const { stripe, created } = stubStripe()

    await ensureBillingMeter({ stripe, eventName: 'kira_month', displayName: 'Kira month' })

    expect(created.meters).toHaveBeenCalledWith({
      display_name: 'Kira month',
      event_name: 'kira_month',
      default_aggregation: { formula: 'sum' },
    })
  })
})

// ─── the price ───────────────────────────────────────────────────────────────

describe('ensureMeteredPrice', () => {
  const base = {
    meterId: 'mtr_1',
    currency: 'AUD',
    unitAmount: 99_900,
    productName: 'Kira Business Plan',
    lookupKeyPrefix: 'kira',
  }

  it('is metered, bound to the meter, and keyed on the band', async () => {
    const { stripe, created } = stubStripe()

    await ensureMeteredPrice({ stripe, ...base })

    const params = created.prices.mock.calls[0][0] as Record<string, never>
    expect(params).toMatchObject({
      currency: 'aud',
      unit_amount: 99_900,
      lookup_key: 'kira-arrears-aud-99900-month',
      recurring: { interval: 'month', usage_type: 'metered', meter: 'mtr_1' },
    })
  })

  it('reuses the price for a band instead of creating one per checkout', async () => {
    const { stripe, raw, created } = stubStripe()
    raw.prices.list = vi.fn(async () => ({ data: [{ id: 'price_existing' }] }))

    const price = await ensureMeteredPrice({ stripe, ...base })

    expect(price.id).toBe('price_existing')
    expect(created.prices).not.toHaveBeenCalled()
    expect(raw.prices.list).toHaveBeenCalledWith({
      lookup_keys: ['kira-arrears-aud-99900-month'],
      active: true,
      limit: 1,
    })
  })
})

// ─── checkout ────────────────────────────────────────────────────────────────

describe('createSubscriptionCheckoutSession — arrears', () => {
  const arrearsItem = {
    arrears: true as const,
    meterEventName: 'kira_month',
    currency: 'AUD',
    unitAmount: 99_900,
    productName: 'Kira Business Plan',
    lookupKeyPrefix: 'kira',
  }

  const urls = { successUrl: 'https://x/ok', cancelUrl: 'https://x/no' }

  it('sends the resolved price id with NO quantity', async () => {
    const { stripe, created } = stubStripe()

    await createSubscriptionCheckoutSession({ stripe, lineItem: arrearsItem, ...urls })

    const params = created.sessions.mock.calls[0][0] as { line_items: Record<string, unknown>[] }
    expect(params.line_items).toEqual([{ price: 'price_new' }])
    // Stripe rejects a metered line item that carries a quantity — the quantity comes from
    // reported usage, not from the cart.
    expect(params.line_items[0]).not.toHaveProperty('quantity')
  })

  it('still captures a card, because the month is owed from day one', async () => {
    const { stripe, created } = stubStripe()

    await createSubscriptionCheckoutSession({ stripe, lineItem: arrearsItem, ...urls })

    const params = created.sessions.mock.calls[0][0] as Record<string, unknown>
    expect(params.payment_method_collection).toBe('always')
    expect(params.subscription_data).toBeUndefined()
  })

  it('refuses a trial, which is the opposite offer', async () => {
    const { stripe, created } = stubStripe()

    await expect(
      createSubscriptionCheckoutSession({ stripe, lineItem: arrearsItem, trialDays: 30, ...urls }),
    ).rejects.toThrow(/trialDays cannot be combined with an arrears line item/)

    expect(created.sessions).not.toHaveBeenCalled()
  })

  it('leaves the fixed and dynamic shapes untouched', async () => {
    const { stripe, created } = stubStripe()

    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: { priceId: 'price_fixed' },
      trialDays: 14,
      ...urls,
    })

    const params = created.sessions.mock.calls[0][0] as {
      line_items: unknown[]
      subscription_data: { trial_period_days: number }
    }
    expect(params.line_items).toEqual([{ price: 'price_fixed', quantity: 1 }])
    expect(params.subscription_data.trial_period_days).toBe(14)
  })
})

// ─── reporting ───────────────────────────────────────────────────────────────

describe('reportPeriodOwed', () => {
  const base = { eventName: 'kira_month', stripeCustomerId: 'cus_1', identifier: 'sub_1:1800000000' }

  it('reports one unit against the customer, deduped by identifier', async () => {
    const { stripe, created } = stubStripe()

    await reportPeriodOwed({ stripe, ...base })

    expect(created.meterEvents).toHaveBeenCalledWith({
      event_name: 'kira_month',
      payload: { stripe_customer_id: 'cus_1', value: '1' },
      identifier: 'sub_1:1800000000',
    })
  })

  it('demands an identifier — without one a retried webhook bills the period twice', async () => {
    const { stripe } = stubStripe()

    await expect(reportPeriodOwed({ stripe, ...base, identifier: '' })).rejects.toThrow(
      /identifier is required/,
    )
  })

  it('propagates a failed report rather than resolving quietly', async () => {
    const { stripe, raw } = stubStripe()
    raw.billing.meterEvents.create = vi.fn(async () => {
      throw new Error('stripe down')
    })

    // An unreported period invoices $0 against a subscription that looks entirely healthy. The
    // caller must be able to see the failure.
    await expect(reportPeriodOwed({ stripe, ...base })).rejects.toThrow('stripe down')
  })
})

// ─── the waiver ──────────────────────────────────────────────────────────────

describe('cancelWithWaiver', () => {
  it('cancels without invoicing the period in progress', async () => {
    const { stripe, raw } = stubStripe()

    await cancelWithWaiver({ stripe, subscriptionId: 'sub_1' })

    // invoice_now:false IS the waiver; prorate:false stops a pending proration being swept into a
    // final bill. Both are required — invoice_now alone still collects prorations.
    expect(raw.subscriptions.cancel).toHaveBeenCalledWith('sub_1', {
      prorate: false,
      invoice_now: false,
    })
  })
})

// ─── custom_text ─────────────────────────────────────────────────────────────

describe('customText', () => {
  /**
   * WHY THIS FIELD EXISTS AT ALL. An arrears subscription must be priced with a Billing Meter, and
   * Stripe then renders "Price varies", "billed monthly based on usage" and "$0.00 due today" —
   * accurate, and read by a cautious buyer as a company that will not say what it charges.
   * productName/productDescription cannot answer it: Stripe substitutes its own subtitle for metered
   * prices, and refuses to update a Product it auto-created. This is the one place left to speak.
   */
  it('passes the submit message through to Stripe, snake-cased', async () => {
    const { stripe, created } = stubStripe()

    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: {
        arrears: true,
        meterEventName: 'kira_month',
        lookupKeyPrefix: 'kira',
        currency: 'aud',
        unitAmount: 99900,
        interval: 'month',
        productName: 'Plan',
      },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      customText: { submit: { message: 'A$999 + GST each month, after the month has finished.' } },
    })

    const params = created.sessions.mock.calls[0][0] as Record<string, any>
    expect(params.custom_text.submit.message).toBe(
      'A$999 + GST each month, after the month has finished.',
    )
    // Only the key that was supplied — Stripe rejects an empty object for the others.
    expect(params.custom_text.after_submit).toBeUndefined()
    expect(params.custom_text.terms_of_service_acceptance).toBeUndefined()
  })

  it('omits custom_text entirely when not supplied', async () => {
    const { stripe, created } = stubStripe()

    await createSubscriptionCheckoutSession({
      stripe,
      lineItem: {
        arrears: true,
        meterEventName: 'kira_month',
        lookupKeyPrefix: 'kira',
        currency: 'aud',
        unitAmount: 99900,
        interval: 'month',
        productName: 'Plan',
      },
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
    })

    const params = created.sessions.mock.calls[0][0] as Record<string, any>
    expect('custom_text' in params).toBe(false)
  })
})
