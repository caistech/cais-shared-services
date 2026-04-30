/**
 * @caistech/api-key-auth/stripe
 *
 * Stripe billing webhook handler. NODE-ONLY — the official Stripe SDK
 * does not ship a Deno-compatible build, so this sub-module is intended
 * for Next.js API routes (or any Node server). The core api-key-auth
 * package (verify / quota / withApiKey) remains Deno-compatible.
 *
 * Behaviour:
 *   - Verifies the webhook signature using the provided secret.
 *   - Idempotent on Stripe `event.id`: the first attempt inserts into
 *     stripe_webhook_events; subsequent attempts short-circuit.
 *   - Tolerates out-of-order delivery on `event.created`: an event whose
 *     created timestamp is older than the row's last_stripe_event_at is
 *     ignored (the row already reflects a newer state).
 *   - Provisions a fresh api_keys row on `checkout.session.completed`,
 *     generates the plaintext key once, returns it via onKeyIssued.
 *   - Updates plan_tier / monthly_limit / active on subscription updates,
 *     marks revoked_at on cancellation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

import { generateApiKey, type GeneratedKey } from '../generateKey.js'
import type { PlanTier } from '../types.js'

export interface PlanMapEntry {
  tier: PlanTier
  monthly_limit: number
}

export interface PlanMap {
  /** Stripe Price ID → plan tier + monthly_limit. Use -1 for unlimited. */
  [stripePriceId: string]: PlanMapEntry
}

export interface HandleStripeWebhookOptions {
  /** Service-role Supabase client (writes to api_keys + stripe_webhook_events). */
  supabase: SupabaseClient
  /** Stripe SDK instance (caller constructs and configures version). */
  stripe: Stripe
  /** STRIPE_WEBHOOK_SECRET from env. */
  webhookSecret: string
  /** Map from Stripe Price ID to plan tier + monthly_limit. */
  planMap: PlanMap
  /** Optional brand prefix on issued keys (see generateApiKey). */
  productPrefix?: string
  /** 'live' or 'test'. Default: matched from process.env.STRIPE_SECRET_KEY shape. */
  environment?: 'live' | 'test'
  /**
   * Called exactly once when a new key is issued. Use this to email the
   * plaintext key to the customer — it is NEVER stored unhashed and cannot
   * be retrieved later.
   */
  onKeyIssued?: (info: {
    plaintext: string
    customerEmail: string
    planTier: PlanTier
    monthlyLimit: number
  }) => Promise<void> | void
}

export interface HandleStripeWebhookResult {
  /** HTTP status to return to Stripe. 200 = ack; 4xx = retry-able failure. */
  status: number
  /** Body to return to Stripe (logging-friendly). */
  body: { received: boolean; reason?: string; event_id?: string }
}

/**
 * Process a Stripe webhook request.
 *
 * @param rawBody - The exact request body (raw bytes / Buffer). Required
 *                  for signature verification.
 * @param signatureHeader - The `stripe-signature` header value.
 */
export async function handleStripeWebhook(
  opts: HandleStripeWebhookOptions,
  rawBody: string | Buffer,
  signatureHeader: string | null
): Promise<HandleStripeWebhookResult> {
  if (!signatureHeader) {
    return { status: 400, body: { received: false, reason: 'missing_signature' } }
  }

  let event: Stripe.Event
  try {
    event = opts.stripe.webhooks.constructEvent(rawBody, signatureHeader, opts.webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 400, body: { received: false, reason: `signature_invalid: ${msg}` } }
  }

  // Idempotency: insert event row, short-circuit if already seen.
  const dedupe = await opts.supabase.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    event_created_at: new Date(event.created * 1000).toISOString(),
  })
  if (dedupe.error) {
    if (
      dedupe.error.code === '23505' ||
      /duplicate key/i.test(dedupe.error.message)
    ) {
      return { status: 200, body: { received: true, reason: 'duplicate', event_id: event.id } }
    }
    return {
      status: 500,
      body: { received: false, reason: `dedupe_failed: ${dedupe.error.message}` },
    }
  }

  const eventCreatedIso = new Date(event.created * 1000).toISOString()

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(opts, event, eventCreatedIso)
        break
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(opts, event, eventCreatedIso)
        break
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(opts, event, eventCreatedIso)
        break
      default:
        return {
          status: 200,
          body: { received: true, reason: `ignored_type:${event.type}`, event_id: event.id },
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 500, body: { received: false, reason: msg, event_id: event.id } }
  }

  return { status: 200, body: { received: true, event_id: event.id } }
}

// ─────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────

async function onCheckoutCompleted(
  opts: HandleStripeWebhookOptions,
  event: Stripe.Event,
  eventCreatedIso: string
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? null
  if (!customerEmail) {
    throw new Error('checkout.session.completed missing customer email')
  }

  // Fetch line items to discover the price ID. session.line_items is not
  // expanded by default — use the SDK to retrieve them.
  const lineItems = await opts.stripe.checkout.sessions.listLineItems(session.id, {
    limit: 1,
  })
  const priceId = lineItems.data[0]?.price?.id
  if (!priceId) throw new Error('checkout.session.completed has no line item price')

  const plan = opts.planMap[priceId]
  if (!plan) throw new Error(`No planMap entry for price ${priceId}`)

  const generated: GeneratedKey = generateApiKey({
    productPrefix: opts.productPrefix,
    environment: opts.environment ?? defaultEnvironmentFromMode(opts),
  })

  const insert = await opts.supabase.from('api_keys').insert({
    key_hash: generated.hash,
    key_prefix: generated.prefix,
    customer_email: customerEmail,
    plan_tier: plan.tier,
    monthly_limit: plan.monthly_limit,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
    stripe_subscription_id:
      typeof session.subscription === 'string' ? session.subscription : null,
    active: true,
    last_stripe_event_at: eventCreatedIso,
  })
  if (insert.error) throw new Error(`insert api_keys failed: ${insert.error.message}`)

  if (opts.onKeyIssued) {
    await opts.onKeyIssued({
      plaintext: generated.plaintext,
      customerEmail,
      planTier: plan.tier,
      monthlyLimit: plan.monthly_limit,
    })
  }
}

async function onSubscriptionUpdated(
  opts: HandleStripeWebhookOptions,
  event: Stripe.Event,
  eventCreatedIso: string
): Promise<void> {
  const sub = event.data.object as Stripe.Subscription
  const priceId = sub.items.data[0]?.price?.id
  if (!priceId) return

  const plan = opts.planMap[priceId]
  if (!plan) throw new Error(`No planMap entry for price ${priceId}`)

  const isActive =
    sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due'

  // Out-of-order tolerance: only apply if event is newer than what's stored.
  const existing = await opts.supabase
    .from('api_keys')
    .select('id, last_stripe_event_at')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()

  if (existing.error) throw new Error(`lookup failed: ${existing.error.message}`)
  if (!existing.data) return // no key for this subscription yet

  if (
    existing.data.last_stripe_event_at &&
    existing.data.last_stripe_event_at >= eventCreatedIso
  ) {
    return // stale event, ignore
  }

  const update = await opts.supabase
    .from('api_keys')
    .update({
      plan_tier: plan.tier,
      monthly_limit: plan.monthly_limit,
      active: isActive,
      revoked_at: isActive ? null : new Date().toISOString(),
      last_stripe_event_at: eventCreatedIso,
    })
    .eq('id', existing.data.id)

  if (update.error) throw new Error(`subscription update failed: ${update.error.message}`)
}

async function onSubscriptionDeleted(
  opts: HandleStripeWebhookOptions,
  event: Stripe.Event,
  eventCreatedIso: string
): Promise<void> {
  const sub = event.data.object as Stripe.Subscription

  const existing = await opts.supabase
    .from('api_keys')
    .select('id, last_stripe_event_at')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()
  if (existing.error) throw new Error(`lookup failed: ${existing.error.message}`)
  if (!existing.data) return

  if (
    existing.data.last_stripe_event_at &&
    existing.data.last_stripe_event_at >= eventCreatedIso
  ) {
    return
  }

  const update = await opts.supabase
    .from('api_keys')
    .update({
      active: false,
      revoked_at: new Date().toISOString(),
      last_stripe_event_at: eventCreatedIso,
    })
    .eq('id', existing.data.id)
  if (update.error) throw new Error(`subscription cancel failed: ${update.error.message}`)
}

function defaultEnvironmentFromMode(opts: HandleStripeWebhookOptions): 'live' | 'test' {
  const apiKey = (opts.stripe as unknown as { _api?: { auth?: string } })._api?.auth ?? ''
  return apiKey.includes('test') ? 'test' : 'live'
}
