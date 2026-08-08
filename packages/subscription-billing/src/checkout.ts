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
  /**
   * Your own sentence on Stripe's hosted checkout page.
   *
   * EXISTS FOR ONE SPECIFIC FAILURE, worth stating so it is used for the right thing. An ARREARS
   * subscription must be priced with a Billing Meter, and Stripe then renders the page honestly and
   * alarmingly: "Price varies", "billed monthly based on usage", "A$0.00 due today". Every one is
   * true — the amount genuinely is not known until the period closes — and together they read, to a
   * cautious buyer at the moment he hands over a card, as a company that will not say what it
   * charges. `productName` and `productDescription` cannot answer it: Stripe substitutes its own
   * subtitle for metered prices, and a Product it auto-created can never be edited afterwards.
   *
   * `submit.message` sits directly beside the pay button, which is the one place left to say the
   * fixed figure in plain words. Keep it to the number and the timing; it is not a place for terms.
   *
   * Stripe caps each field at 1200 characters and rejects longer.
   */
  customText?: {
    submit?: { message: string }
    afterSubmit?: { message: string }
    termsOfServiceAcceptance?: { message: string }
  }
  /**
   * Stripe Tax Rate ids applied to the subscription — e.g. Australian GST at 10%.
   *
   * WHY THIS HAD TO BE AN OPTION RATHER THAN THE CALLER'S JOB. This function builds `line_items`
   * and `subscription_data` itself and passes nothing through, so a product quoting prices
   * tax-EXCLUSIVE ("$999 + GST", the portfolio standard) had no way to make the tax real. Kira
   * shipped exactly that gap: every price surface carried "+ GST", and nothing in the system would
   * ever have added it to an invoice. The suffix is a claim; this is the capability behind it.
   *
   * Applied as `subscription_data.default_tax_rates`, NOT `line_items[].tax_rates`, and the
   * difference is the whole point on a recurring charge: default tax rates are copied onto every
   * invoice the subscription generates, so month two is taxed like month one. A line-item rate
   * covers the checkout and quietly stops applying afterwards, which is a failure nobody sees until
   * an accountant reconciles a year of invoices.
   *
   * The rates must already exist in Stripe, and a Tax Rate belongs to ONE mode — a test-mode id
   * fails in live. Resolve the id per mode (see `./mode.ts`) rather than holding one in a single
   * variable.
   *
   * Mutually exclusive with Stripe Tax: Stripe rejects a session that sets both `automatic_tax`
   * and `default_tax_rates`. This is the manual-rate path, correct for a single-jurisdiction seller;
   * a product selling into many jurisdictions wants Stripe Tax instead.
   */
  taxRateIds?: string[]
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
    customText,
    taxRateIds,
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
  // An EMPTY array is dropped rather than sent. `default_tax_rates: []` is not "no tax" to Stripe in
  // every code path, and more practically it lets a caller whose id lookup returned nothing believe
  // tax was configured. Absent means absent.
  if (taxRateIds && taxRateIds.length) subscriptionData.default_tax_rates = taxRateIds

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
    ...(customText
      ? {
          custom_text: {
            ...(customText.submit ? { submit: customText.submit } : {}),
            ...(customText.afterSubmit ? { after_submit: customText.afterSubmit } : {}),
            ...(customText.termsOfServiceAcceptance
              ? { terms_of_service_acceptance: customText.termsOfServiceAcceptance }
              : {}),
          },
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
