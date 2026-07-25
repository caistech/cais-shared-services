/**
 * The webhook reducer — verify → dedupe → normalize → apply.
 *
 * Mirrors `@caistech/api-key-auth`'s Stripe idempotency model (insert on `event.id`, out-of-order
 * tolerance on `event.created`) but writes SUBSCRIPTION state through the caller's adapter instead
 * of provisioning API keys.
 *
 * One deliberate departure from api-key-auth: if a handler fails AFTER the dedupe row is inserted,
 * we DELETE that row before returning 500. Otherwise Stripe's retry is short-circuited as a
 * duplicate and the state is never applied — a failed write becomes a permanently lost event.
 */

import type Stripe from 'stripe'

import type {
  SubscriberRef,
  SubscriptionAdapter,
  SubscriptionState,
  SubscriptionStatus,
  WebhookResult,
} from './types.js'

/** Minimal shape of the client used for the idempotency table (a Supabase service-role client). */
export interface IdempotencyStore {
  /** Returns true when the event is NEW (claimed), false when already seen. Throws on failure. */
  claim(event: { id: string; type: string; createdAt: string }): Promise<boolean>
  /** Release a claim so a Stripe retry can re-process it. Best-effort; must not throw. */
  release(eventId: string): Promise<void>
}

export interface HandleSubscriptionWebhookOptions {
  stripe: Stripe
  webhookSecret: string
  adapter: SubscriptionAdapter
  /** Idempotency store. Omit ONLY if the adapter itself is idempotent — see README. */
  idempotency?: IdempotencyStore
  /**
   * Metadata keys that carry the product's own user id, tried in order (session metadata first,
   * then subscription metadata). Default: `['supabase_user_id', 'user_id']`.
   */
  userIdMetadataKeys?: string[]
  /**
   * On `checkout.session.completed`, retrieve the subscription so the recorded status reflects
   * reality (`trialing` during a trial, not `active`). Default true. Costs one API call; turning it
   * off means a trialing subscriber is recorded as active, which misreports the first charge date.
   */
  expandSubscription?: boolean
  /** Optional structured logger. */
  log?: (message: string, meta?: Record<string, unknown>) => void
}

/** Stripe's subscription vocabulary → the portfolio's. */
export function normalizeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'cancelled'
    case 'unpaid':
      return 'unpaid'
    case 'paused':
      return 'paused'
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete'
    default:
      return 'incomplete'
  }
}

const iso = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds == null ? null : new Date(unixSeconds * 1000).toISOString()

/**
 * `current_period_end` moved from the subscription onto its items in the 2025-03 API version.
 * Read the item first, fall back to the legacy top-level field, so the package works whichever
 * API version the consumer's SDK is pinned to.
 */
function periodEnd(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined
  const legacy = sub as unknown as { current_period_end?: number }
  return iso(item?.current_period_end ?? legacy.current_period_end ?? null)
}

function stateFromSubscription(
  sub: Stripe.Subscription,
  eventCreatedAt: string,
  eventType: string,
): SubscriptionState {
  return {
    status: normalizeStatus(sub.status),
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null),
    stripeSubscriptionId: sub.id,
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
    currentPeriodEnd: periodEnd(sub),
    trialEndsAt: iso(sub.trial_end),
    eventCreatedAt,
    eventType,
  }
}

function refFrom(
  parts: {
    email?: string | null
    userId?: string | null
    customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null
    subscription?: string | Stripe.Subscription | null
  },
): SubscriberRef {
  const customer = parts.customer
  const subscription = parts.subscription
  return {
    email: parts.email ? parts.email.toLowerCase() : null,
    userId: parts.userId ?? null,
    stripeCustomerId: typeof customer === 'string' ? customer : (customer?.id ?? null),
    stripeSubscriptionId: typeof subscription === 'string' ? subscription : (subscription?.id ?? null),
  }
}

function metadataUserId(
  keys: string[],
  ...sources: (Stripe.Metadata | null | undefined)[]
): string | null {
  for (const source of sources) {
    if (!source) continue
    for (const key of keys) {
      const value = source[key]
      if (value) return value
    }
  }
  return null
}

/**
 * Process one Stripe webhook request.
 *
 * @param rawBody The EXACT raw request body. A parsed-then-restringified body fails signature
 *                verification — read it with `request.text()` before any JSON parsing.
 * @param signatureHeader The `stripe-signature` header value.
 */
export async function handleSubscriptionWebhook(
  opts: HandleSubscriptionWebhookOptions,
  rawBody: string | Buffer,
  signatureHeader: string | null,
): Promise<WebhookResult> {
  const log = opts.log ?? (() => {})
  const userIdKeys = opts.userIdMetadataKeys ?? ['supabase_user_id', 'user_id']

  if (!signatureHeader) {
    return { status: 400, body: { received: false, outcome: 'missing_signature' } }
  }

  let event: Stripe.Event
  try {
    event = opts.stripe.webhooks.constructEvent(rawBody, signatureHeader, opts.webhookSecret)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { status: 400, body: { received: false, outcome: 'signature_invalid', reason } }
  }

  const eventCreatedAt = new Date(event.created * 1000).toISOString()
  const base = { event_id: event.id, event_type: event.type }

  // Resolve the event to (ref, state) BEFORE claiming it — an ignored type shouldn't consume an
  // idempotency row, so a later replay of a type we start handling still works.
  let resolved: { ref: SubscriberRef; state: SubscriptionState } | null
  try {
    resolved = await resolveEvent(opts, event, eventCreatedAt, userIdKeys)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    log('[subscription-billing] resolve failed', { ...base, reason })
    return { status: 500, body: { received: false, outcome: 'error', reason, ...base } }
  }

  if (!resolved) {
    return { status: 200, body: { received: true, outcome: 'ignored_type', ...base } }
  }

  if (opts.idempotency) {
    let claimed: boolean
    try {
      claimed = await opts.idempotency.claim({ id: event.id, type: event.type, createdAt: eventCreatedAt })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      // Fail closed: a broken idempotency store must not become an at-least-once double-apply.
      return { status: 500, body: { received: false, outcome: 'error', reason, ...base } }
    }
    if (!claimed) {
      return { status: 200, body: { received: true, outcome: 'duplicate', ...base } }
    }
  }

  try {
    const outcome = await applyState(opts, resolved.ref, resolved.state)
    log(`[subscription-billing] ${event.type} → ${outcome}`, base)
    return { status: 200, body: { received: true, outcome, ...base } }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    // Release the claim so Stripe's retry isn't swallowed as a duplicate.
    if (opts.idempotency) {
      try {
        await opts.idempotency.release(event.id)
      } catch {
        /* best-effort — a stuck claim is logged by the store, never thrown here */
      }
    }
    log('[subscription-billing] apply failed', { ...base, reason })
    return { status: 500, body: { received: false, outcome: 'error', reason, ...base } }
  }
}

async function applyState(
  opts: HandleSubscriptionWebhookOptions,
  ref: SubscriberRef,
  state: SubscriptionState,
): Promise<'applied' | 'stale' | 'subscriber_missing'> {
  const record = await opts.adapter.find(ref)

  if (!record) {
    await opts.adapter.onSubscriberMissing?.(ref, state)
    return 'subscriber_missing'
  }

  // Out-of-order guard: Stripe does not guarantee delivery order, so an older event must never
  // overwrite newer state. Opting out (no lastStripeEventAt) means last-write-wins.
  if (record.lastStripeEventAt && record.lastStripeEventAt >= state.eventCreatedAt) {
    return 'stale'
  }

  await opts.adapter.apply(record, state)
  if (state.status === 'cancelled') {
    await opts.adapter.onCancelled?.(record, state)
  }
  return 'applied'
}

async function resolveEvent(
  opts: HandleSubscriptionWebhookOptions,
  event: Stripe.Event,
  eventCreatedAt: string,
  userIdKeys: string[],
): Promise<{ ref: SubscriberRef; state: SubscriptionState } | null> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const email = session.customer_details?.email ?? session.customer_email ?? null
      const userId =
        metadataUserId(userIdKeys, session.metadata) ?? session.client_reference_id ?? null
      const ref = refFrom({
        email,
        userId,
        customer: session.customer,
        subscription: session.subscription,
      })

      // Retrieve the subscription so a trialing subscriber is recorded as trialing (and the first
      // charge date is right) rather than flatly "active".
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      if (subscriptionId && opts.expandSubscription !== false) {
        const sub = await opts.stripe.subscriptions.retrieve(subscriptionId)
        return { ref, state: stateFromSubscription(sub, eventCreatedAt, event.type) }
      }

      return {
        ref,
        state: {
          status: 'active',
          stripeCustomerId: ref.stripeCustomerId,
          stripeSubscriptionId: ref.stripeSubscriptionId,
          priceId: null,
          currentPeriodEnd: null,
          trialEndsAt: null,
          eventCreatedAt,
          eventType: event.type,
        },
      }
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const state = stateFromSubscription(sub, eventCreatedAt, event.type)
      // `customer.subscription.deleted` fires with status 'canceled', but be explicit: this event
      // means gone, whatever the payload says.
      if (event.type === 'customer.subscription.deleted') state.status = 'cancelled'
      return {
        ref: refFrom({
          userId: metadataUserId(userIdKeys, sub.metadata),
          customer: sub.customer,
          subscription: sub.id,
        }),
        state,
      }
    }

    case 'invoice.payment_failed':
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const legacy = invoice as unknown as { subscription?: string | Stripe.Subscription | null }
      const parent = (
        invoice as unknown as {
          parent?: { subscription_details?: { subscription?: string | Stripe.Subscription | null } }
        }
      ).parent
      // The invoice→subscription link moved under `parent.subscription_details` in the 2025-03 API
      // version; read both so the handler works on either pinning.
      const subscription = parent?.subscription_details?.subscription ?? legacy.subscription ?? null
      if (!subscription) return null

      const subscriptionId = typeof subscription === 'string' ? subscription : subscription.id
      const sub = await opts.stripe.subscriptions.retrieve(subscriptionId)
      const state = stateFromSubscription(sub, eventCreatedAt, event.type)
      // A failed payment can arrive while Stripe still reports `active` (before the dunning clock
      // moves it). Record the reality the product needs to act on.
      if (event.type === 'invoice.payment_failed' && state.status === 'active') {
        state.status = 'past_due'
      }
      return {
        ref: refFrom({
          email: invoice.customer_email,
          userId: metadataUserId(userIdKeys, sub.metadata, invoice.metadata),
          customer: invoice.customer,
          subscription: subscriptionId,
        }),
        state,
      }
    }

    default:
      return null
  }
}
