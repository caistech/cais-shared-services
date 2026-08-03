/**
 * @caistech/subscription-billing
 *
 * Stripe subscription lifecycle, shared. The package owns the mechanics every product repeats —
 * building a checkout session (fixed price OR dynamic `price_data`, trial, card-on-file), verifying
 * the webhook, deduping on `event.id`, ignoring out-of-order deliveries, and normalizing Stripe's
 * status vocabulary. The product keeps what is genuinely its own: the PRICE and the TABLE.
 *
 * Why it exists: the portfolio had two divergent forks of this (Kira's `users` shape with a
 * valuation-derived price and a 7-day trial; LaunchReady's `profiles` shape with a fixed price and
 * no trial), neither idempotent. A resold, white-label channel cannot ship three billing shapes.
 *
 * Wire it:
 *   1. Apply `migration.sql` (idempotency table + the columns the adapter expects).
 *   2. Checkout — `createSubscriptionCheckoutSession({ stripe, lineItem, trialDays, ... })`.
 *   3. Webhook — `handleSubscriptionWebhook({ stripe, webhookSecret, adapter, idempotency }, rawBody, sig)`.
 */

export type {
  SubscriberRecord,
  SubscriberRef,
  SubscriptionAdapter,
  SubscriptionState,
  SubscriptionStatus,
  WebhookOutcome,
  WebhookResult,
} from './types.js'

export type {
  ArrearsPriceLineItem,
  CheckoutLineItem,
  CreateCheckoutSessionOptions,
  DynamicPriceLineItem,
  FixedPriceLineItem,
} from './checkout.js'
export { createBillingPortalSession, createSubscriptionCheckoutSession } from './checkout.js'

export type {
  CancelWithWaiverOptions,
  EnsureBillingMeterOptions,
  EnsureMeteredPriceOptions,
  MeterAggregation,
  ReportPeriodOwedOptions,
} from './arrears.js'
export {
  cancelWithWaiver,
  ensureBillingMeter,
  ensureMeteredPrice,
  reportPeriodOwed,
} from './arrears.js'

export type { HandleSubscriptionWebhookOptions, IdempotencyStore } from './webhook.js'
export { handleSubscriptionWebhook, normalizeStatus } from './webhook.js'

export type { SubscriberColumns, SupabaseSubscriptionAdapterOptions } from './supabase.js'
export { createSupabaseIdempotencyStore, createSupabaseSubscriptionAdapter } from './supabase.js'

// Test/live mode switch — also available as the '@caistech/subscription-billing/mode' subpath.
export * from './mode.js'
