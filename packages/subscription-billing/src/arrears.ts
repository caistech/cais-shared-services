/**
 * Arrears billing — "owed but unbilled until the period closes."
 *
 * THE COMMERCIAL MODEL THIS EXISTS FOR
 *
 * The card is captured on day one and the month is owed from the start; it is simply not invoiced
 * until the period closes. If the customer cancels before that bill falls due, the in-progress
 * month is WAIVED — no proration, no argument. Because the waiver is permanent rather than a
 * month-one offer, the sales line is stronger than any trial: *you are never billed for the month
 * you are in.*
 *
 * This is NOT the same as `trialDays: 30`, which is what products reach for first. The two look
 * identical for thirty days and then invert:
 *
 *   | | arrears (this module) | trialDays: 30 |
 *   |---|---|---|
 *   | the day-30 charge | pays for days 0–30, behind | pays for days 30–60, ahead |
 *   | cancel on day 45 | that month is waived | already paid, no refund |
 *   | month 1 revenue | owed and invoiced | never invoiced — given away |
 *
 * Same date, same amount, opposite contract. A product that means arrears and ships a trial
 * under-bills by one month per customer, forever.
 *
 * WHY THIS ISN'T JUST A FLAG ON `DynamicPriceLineItem`
 *
 * Arrears means a metered price, and Checkout's inline `price_data.recurring` accepts only
 * `interval` and `interval_count` — there is no `usage_type` and no `meter` on it. So an arrears
 * line item cannot be expressed inline at all: the Price object has to exist BEFORE the session is
 * created. That is what `ensureMeteredPrice` is for, and why the arrears shape resolves to a price
 * id rather than carrying an extra field.
 *
 * WHY METERED RATHER THAN CUSTOM INVOICE LOGIC
 *
 * A metered subscription invoices at period close by construction, and
 * `cancel(prorate: false, invoice_now: false)` discards the accrued period. The waiver is therefore
 * a property of how the subscription was built rather than a rule someone has to remember to apply
 * — which matters, because the failure it prevents (an invoice landing after a customer has
 * cancelled and been told the month was on us) is the kind that ends a referral relationship.
 *
 * THE FAILURE MODE TO GUARD
 *
 * Unreported usage invoices ZERO. A metered subscription with nothing reported bills nobody, looks
 * completely healthy, and produces $0 invoices that no alarm fires on. `reportPeriodOwed` therefore
 * THROWS on failure rather than resolving — the caller is expected to assert the report happened,
 * not hope it did.
 */

import type Stripe from 'stripe'

/**
 * How values reported inside one period combine.
 *
 * Typed as a literal union rather than Stripe's own `Formula`, which gained members after v17 —
 * the peer range this package supports. `'sum'` and `'count'` exist in every supported version.
 */
export type MeterAggregation = 'count' | 'sum'

/**
 * Default aggregation for a subscription meter.
 *
 * `sum` with ONE reported event per period gives exactly one unit. Double-reporting is prevented by
 * the `identifier` on the event (see `reportPeriodOwed`) plus the caller's own webhook idempotency,
 * not by the aggregation — Stripe's identifier uniqueness window is "at least 24 hours", which
 * covers retries but is not a substitute for not reporting the same period from two places.
 */
const PERIOD_AGGREGATION: MeterAggregation = 'sum'

export interface EnsureBillingMeterOptions {
  stripe: Stripe
  /** Meter event name, e.g. `kira_subscription_month`. Stable per product — it is the join key. */
  eventName: string
  /** Human label in the Stripe dashboard. Defaults to `eventName`. */
  displayName?: string
  /**
   * How values reported within one period combine. Defaults to `sum`, which with a single reported
   * event per period yields exactly one unit.
   */
  aggregation?: MeterAggregation
}

/**
 * Find or create the billing meter for a product's subscription periods.
 *
 * Idempotent by `event_name` against ACTIVE meters, so it is safe to call on every checkout.
 * Stripe permits two meters with the same event name (the second one silently splits your usage),
 * which is exactly the sort of duplicate a per-request create would produce.
 */
export async function ensureBillingMeter(
  opts: EnsureBillingMeterOptions,
): Promise<Stripe.Billing.Meter> {
  const { stripe, eventName, displayName, aggregation = PERIOD_AGGREGATION } = opts

  for await (const meter of stripe.billing.meters.list({ status: 'active', limit: 100 })) {
    if (meter.event_name === eventName) return meter
  }

  return stripe.billing.meters.create({
    display_name: displayName ?? eventName,
    event_name: eventName,
    default_aggregation: { formula: aggregation },
  })
}

export interface EnsureMeteredPriceOptions {
  stripe: Stripe
  /** The meter this price bills against — from `ensureBillingMeter`. */
  meterId: string
  /** ISO currency code; case-insensitive. */
  currency: string
  /** Amount in the currency's MINOR unit (cents) for ONE period. Round before passing. */
  unitAmount: number
  interval?: 'day' | 'week' | 'month' | 'year'
  productName: string
  productDescription?: string
  /**
   * Namespace for the generated `lookup_key`, so two products in one Stripe account cannot collide
   * on the same amount. Defaults to the meter event name's owner — pass the product slug.
   */
  lookupKeyPrefix: string
}

/**
 * Find or create the metered Price for one price band.
 *
 * Idempotent by a deterministic `lookup_key` derived from the band. Without this, a per-customer
 * price (Kira's is derived from the owner's valuation gap) would create a new Price object on every
 * checkout — thousands of them, and no way to tell afterwards which customers are on "the same"
 * price.
 */
export async function ensureMeteredPrice(
  opts: EnsureMeteredPriceOptions,
): Promise<Stripe.Price> {
  const {
    stripe,
    meterId,
    currency,
    unitAmount,
    interval = 'month',
    productName,
    productDescription,
    lookupKeyPrefix,
  } = opts

  const code = currency.toLowerCase()
  const lookupKey = `${lookupKeyPrefix}-arrears-${code}-${unitAmount}-${interval}`

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  if (existing.data[0]) return existing.data[0]

  return stripe.prices.create({
    currency: code,
    unit_amount: unitAmount,
    lookup_key: lookupKey,
    recurring: { interval, usage_type: 'metered', meter: meterId },
    product_data: {
      name: productName,
      ...(productDescription ? { metadata: { description: productDescription } } : {}),
    },
  })
}

export interface ReportPeriodOwedOptions {
  stripe: Stripe
  /** Meter event name — must match the meter the subscription's price bills against. */
  eventName: string
  stripeCustomerId: string
  /**
   * Units owed for this period. Almost always 1: the metered price's `unit_amount` IS the monthly
   * fee, and the meter exists to control WHEN it is invoiced, not how much.
   */
  value?: number
  /**
   * Idempotency key for this period, e.g. `${subscriptionId}:${periodStartUnix}`. Stripe enforces
   * uniqueness over a rolling window of at least 24 hours, so a retried webhook cannot report the
   * same period twice. Pass one — the generated default dedupes nothing.
   */
  identifier: string
  /** Event time. Must be within the past 35 days. Defaults to now. */
  timestampSeconds?: number
}

/**
 * Report that a period is owed.
 *
 * Call it when a period BEGINS, not when it ends — the invoice is cut at period close from whatever
 * has been reported by then, so reporting late is reporting nothing.
 *
 * Throws on failure, deliberately. An unreported period invoices $0 against a subscription that
 * looks entirely healthy, so the only safe posture is for the caller to treat a failed report as an
 * error it must handle rather than a promise it may ignore.
 */
export async function reportPeriodOwed(
  opts: ReportPeriodOwedOptions,
): Promise<Stripe.Billing.MeterEvent> {
  const { stripe, eventName, stripeCustomerId, value = 1, identifier, timestampSeconds } = opts

  if (!stripeCustomerId) throw new Error('reportPeriodOwed: stripeCustomerId is required')
  if (!identifier) {
    throw new Error(
      'reportPeriodOwed: identifier is required — without it a retried webhook reports the same ' +
        'period twice.',
    )
  }

  return stripe.billing.meterEvents.create({
    event_name: eventName,
    payload: { stripe_customer_id: stripeCustomerId, value: String(value) },
    identifier,
    ...(timestampSeconds != null ? { timestamp: timestampSeconds } : {}),
  })
}

export interface CancelWithWaiverOptions {
  stripe: Stripe
  subscriptionId: string
}

/**
 * Cancel immediately and waive the month in progress.
 *
 * `invoice_now: false` is the waiver — it tells Stripe not to cut a final invoice for the accrued
 * period, so the customer's last act produces no bill. `prorate: false` stops any pending
 * proration being swept into one. Both must be present: `invoice_now` alone still leaves
 * prorations to be collected.
 *
 * This is the whole promise as code. It exists as a named function, rather than a call site with
 * two options set correctly, because the promise is only worth making if it cannot be forgotten.
 */
export async function cancelWithWaiver(
  opts: CancelWithWaiverOptions,
): Promise<Stripe.Subscription> {
  return opts.stripe.subscriptions.cancel(opts.subscriptionId, {
    prorate: false,
    invoice_now: false,
  })
}
