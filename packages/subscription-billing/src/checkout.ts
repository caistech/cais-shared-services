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

export type CheckoutLineItem = FixedPriceLineItem | DynamicPriceLineItem

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

  const line: Stripe.Checkout.SessionCreateParams.LineItem = isFixedPrice(lineItem)
    ? { price: lineItem.priceId, quantity: lineItem.quantity ?? 1 }
    : {
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
