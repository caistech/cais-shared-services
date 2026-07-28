/**
 * Checkout-session builder.
 *
 * Wraps the two session shapes the portfolio actually uses — a fixed Stripe Price id (LaunchReady)
 * and a dynamic `price_data` line (Kira, whose monthly price is derived server-side from the
 * owner's valuation gap) — behind one call, so trial + card-on-file + metadata behaviour is
 * identical whichever shape a product needs. The PRICE stays the product's business; the session
 * mechanics are shared.
 */

import type Stripe from 'stripe'

import { ensureBillingMeter, ensureMeteredPrice } from './arrears.js'

/** A line item priced by an existing Stripe Price object. */
export interface FixedPriceLineItem {
  priceId: string
  quantity?: number
}

/**
 * A line item priced at request time (`price_data`). Use when the price is computed per customer
 * and must not be forgeable by the client — compute it server-side, then pass it here.
 */
export interface DynamicPriceLineItem {
  /** ISO currency code; case-insensitive (lower-cased for Stripe). */
  currency: string
  /** Amount in the currency's MINOR unit (cents). Round before passing. */
  unitAmount: number
  interval?: 'day' | 'week' | 'month' | 'year'
  productName: string
  productDescription?: string
  quantity?: number
}

/**
 * A line item billed IN ARREARS — the period is owed from day one and invoiced when it closes,
 * and a cancellation before the bill falls due waives it. See `./arrears.ts` for the model and
 * why it cannot be a flag on `DynamicPriceLineItem`: Checkout's inline `price_data.recurring`
 * has no `usage_type` and no `meter`, so the Price must exist before the session does.
 *
 * The price is still computed per customer — it is resolved to a reusable Price object keyed on
 * the band, not to a new one per checkout.
 */
export interface ArrearsPriceLineItem {
  /** Discriminator. Set it explicitly: arrears is a commercial decision, not a default. */
  arrears: true
  /** Meter event name, stable per product (e.g. `kira_subscription_month`). */
  meterEventName: string
  /** ISO currency code; case-insensitive. */
  currency: string
  /** Amount in the currency's MINOR unit (cents) for ONE period. Round before passing. */
  unitAmount: number
  interval?: 'day' | 'week' | 'month' | 'year'
  productName: string
  productDescription?: string
  /** Namespace for the generated price `lookup_key` — pass the product slug. */
  lookupKeyPrefix: string
  /** Dashboard label for the meter, if it has to be created. */
  meterDisplayName?: string
}

export type CheckoutLineItem = FixedPriceLineItem | DynamicPriceLineItem | ArrearsPriceLineItem

export interface CreateCheckoutSessionOptions {
  /** Stripe SDK instance — the caller constructs it (and pins the API version). */
  stripe: Stripe
  lineItem: CheckoutLineItem
  successUrl: string
  cancelUrl: string
  /** Free-trial length. Omit for no trial. */
  trialDays?: number
  /**
   * Capture a payment method at signup even though the trial means nothing is charged today
   * (card-on-file). Default TRUE: with a trial and `if_required`, Stripe will happily create the
   * subscription with no card, and the first charge then silently fails 30 days later.
   */
  cardAtSignup?: boolean
  customerEmail?: string
  /** Existing Stripe customer to bill (mutually exclusive with `customerEmail` in Stripe's API). */
  customerId?: string
  clientReferenceId?: string
  /** Session metadata — travels to `checkout.session.completed`. */
  metadata?: Record<string, string>
  /** Subscription metadata — travels to every later `customer.subscription.*` event. */
  subscriptionMetadata?: Record<string, string>
  allowPromotionCodes?: boolean
  billingAddressCollection?: 'auto' | 'required'
}

function isFixedPrice(item: CheckoutLineItem): item is FixedPriceLineItem {
  return 'priceId' in item
}

function isArrears(item: CheckoutLineItem): item is ArrearsPriceLineItem {
  return 'arrears' in item && item.arrears === true
}

/**
 * Resolve an arrears line item to a Checkout line.
 *
 * Two Stripe constraints are load-bearing here and both fail confusingly if broken: a metered price
 * cannot be created inline via `price_data`, and a metered line item must NOT carry `quantity`
 * (Stripe rejects the session — the quantity comes from reported usage, not from the cart).
 */
async function arrearsLine(
  stripe: Stripe,
  item: ArrearsPriceLineItem,
): Promise<Stripe.Checkout.SessionCreateParams.LineItem> {
  const meter = await ensureBillingMeter({
    stripe,
    eventName: item.meterEventName,
    displayName: item.meterDisplayName,
  })

  const price = await ensureMeteredPrice({
    stripe,
    meterId: meter.id,
    currency: item.currency,
    unitAmount: item.unitAmount,
    interval: item.interval,
    productName: item.productName,
    productDescription: item.productDescription,
    lookupKeyPrefix: item.lookupKeyPrefix,
  })

  return { price: price.id }
}

/**
 * Build and create a subscription Checkout Session.
 *
 * Put the identifiers you'll need to find the subscriber later into `subscriptionMetadata` (not
 * just `metadata`): session metadata is only present on `checkout.session.completed`, whereas
 * subscription metadata rides on every subsequent lifecycle event.
 */
export async function createSubscriptionCheckoutSession(
  opts: CreateCheckoutSessionOptions,
): Promise<Stripe.Checkout.Session> {
  const {
    stripe,
    lineItem,
    successUrl,
    cancelUrl,
    trialDays,
    cardAtSignup = true,
    customerEmail,
    customerId,
    clientReferenceId,
    metadata,
    subscriptionMetadata,
    allowPromotionCodes,
    billingAddressCollection = 'auto',
  } = opts

  // A trial and arrears are contradictory offers, and the contradiction is invisible for thirty
  // days: a trial gives the first period away, arrears bills it in retrospect. Refuse rather than
  // silently pick one — the wrong choice here is a month of revenue per customer.
  if (isArrears(lineItem) && trialDays != null) {
    throw new Error(
      'trialDays cannot be combined with an arrears line item: a trial gives the first period ' +
        'away, whereas arrears bills it when the period closes. Choose one.',
    )
  }

  let line: Stripe.Checkout.SessionCreateParams.LineItem
  if (isArrears(lineItem)) {
    line = await arrearsLine(stripe, lineItem)
  } else if (isFixedPrice(lineItem)) {
    line = { price: lineItem.priceId, quantity: lineItem.quantity ?? 1 }
  } else {
    line = {
      price_data: {
        currency: lineItem.currency.toLowerCase(),
        unit_amount: lineItem.unitAmount,
        recurring: { interval: lineItem.interval ?? 'month' },
        product_data: {
          name: lineItem.productName,
          ...(lineItem.productDescription ? { description: lineItem.productDescription } : {}),
        },
      },
      quantity: lineItem.quantity ?? 1,
    }
  }

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {}
  if (trialDays != null) subscriptionData.trial_period_days = trialDays
  if (subscriptionMetadata) subscriptionData.metadata = subscriptionMetadata

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [line],
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_collection: cardAtSignup ? 'always' : 'if_required',
    billing_address_collection: billingAddressCollection,
    ...(Object.keys(subscriptionData).length ? { subscription_data: subscriptionData } : {}),
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    ...(customerId ? { customer: customerId } : {}),
    ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(allowPromotionCodes != null ? { allow_promotion_codes: allowPromotionCodes } : {}),
  })
}

/**
 * Open the Stripe billing portal for a customer — cancel, update card, see invoices. Every
 * subscription product owes its customers this; Kira shipped without it.
 */
export async function createBillingPortalSession(opts: {
  stripe: Stripe
  customerId: string
  returnUrl: string
}): Promise<Stripe.BillingPortal.Session> {
  return opts.stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
  })
}
