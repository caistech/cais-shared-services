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
  /**
   * How the amount relates to tax. `exclusive` means `unitAmount` is the pre-tax price and tax is
   * ADDED on top — the shape a product wants when it advertises "$499 + GST".
   *
   * Stripe's default is `unspecified`, which silently disqualifies the line from any tax
   * calculation: attach a tax rate to an unspecified-behaviour price and the invoice comes out with
   * no tax line and no error. Set it explicitly whenever `taxRates` or `automaticTax` is in play.
   */
  taxBehavior?: 'exclusive' | 'inclusive' | 'unspecified'
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
  /**
   * Stripe Tax Rate ids applied to the subscription (`subscription_data.default_tax_rates`), so
   * every invoice — the first one and every renewal — carries the tax as its own line.
   *
   * Use this for a FIXED statutory rate the seller always charges (AU GST at 10%). It needs no
   * Stripe Tax subscription and no customer address, which is what makes it the right default for a
   * single-jurisdiction seller. Reach for `automaticTax` instead when the rate depends on where the
   * buyer is.
   *
   * Applying it to `subscription_data` rather than the line item is deliberate: line-item tax rates
   * cover the checkout only, and the renewals then quietly bill untaxed.
   */
  taxRates?: string[]
  /**
   * Let Stripe Tax compute the rate from the customer's location
   * (`automatic_tax.enabled` + `customer_update.address` so the address collected at checkout is
   * saved for renewals). Requires Stripe Tax to be enabled with your registrations recorded.
   *
   * Mutually exclusive with `taxRates` — Stripe rejects a session that carries both, rather than
   * quietly picking one.
   */
  automaticTax?: boolean
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
    taxRates,
    automaticTax,
  } = opts

  // Caught here rather than at Stripe: the API error for this is not obvious, and a session that
  // silently taxed by the wrong mechanism would be worse than one that failed to create.
  if (taxRates?.length && automaticTax) {
    throw new Error(
      'subscription-billing: pass taxRates OR automaticTax, not both — Stripe cannot apply a fixed rate and compute one.',
    )
  }

  const line: Stripe.Checkout.SessionCreateParams.LineItem = isFixedPrice(lineItem)
    ? { price: lineItem.priceId, quantity: lineItem.quantity ?? 1 }
    : {
        price_data: {
          currency: lineItem.currency.toLowerCase(),
          unit_amount: lineItem.unitAmount,
          recurring: { interval: lineItem.interval ?? 'month' },
          // A tax rate on an `unspecified` price yields an invoice with no tax line, so default to
          // exclusive whenever tax is in play — "$X plus tax" is what a dynamic price means.
          ...(lineItem.taxBehavior
            ? { tax_behavior: lineItem.taxBehavior }
            : taxRates?.length || automaticTax
              ? { tax_behavior: 'exclusive' as const }
              : {}),
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
  // On the subscription, not the line item: a line-item rate covers the first invoice only and
  // every renewal after it bills untaxed.
  if (taxRates?.length) subscriptionData.default_tax_rates = taxRates

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
    // `customer_update.address` rides with automatic tax so the address collected at checkout is
    // saved on the customer and the RENEWALS stay taxed. Stripe only accepts it for an EXISTING
    // customer — sending it alongside `customer_email` is an API error, and a session that fails to
    // create is not a trade worth making for an address Stripe sets on the new customer anyway.
    ...(automaticTax
      ? {
          automatic_tax: { enabled: true },
          ...(customerId ? { customer_update: { address: 'auto' as const } } : {}),
        }
      : {}),
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
