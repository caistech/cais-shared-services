/**
 * @caistech/subscription-billing — shared types.
 *
 * The package's contract is deliberately narrow: it normalizes Stripe's subscription vocabulary
 * into ONE `SubscriptionState` and hands it to the product's adapter. It never knows the product's
 * table, columns, plan names, or price. That split is what lets Kira (`users.subscription_status`,
 * valuation-derived dynamic price) and LaunchReady (`profiles.plan`, fixed price id) run the same
 * lifecycle code instead of two divergent forks.
 */

/**
 * The portfolio's canonical subscription vocabulary. Note `cancelled` (two Ls) — Stripe spells it
 * `canceled`; we normalize to the spelling the products' own types and admin panels already read.
 * Map it to whatever your table stores via the adapter, don't re-spell it here.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'incomplete'
  | 'unpaid'
  | 'paused'

/** Normalized state derived from a Stripe event — what the adapter writes. */
export interface SubscriptionState {
  status: SubscriptionStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  /** The Stripe Price id, when the event carried one. Null for dynamic `price_data` sessions. */
  priceId: string | null
  /** ISO end of the current paid period, when Stripe reported one. */
  currentPeriodEnd: string | null
  /** ISO trial end, when the subscription is (or was) in trial. */
  trialEndsAt: string | null
  /**
   * ISO timestamp of the Stripe event that produced this state. The reducer compares it against the
   * subscriber's stored `lastStripeEventAt` so an out-of-order delivery can't overwrite newer state
   * with older state — Stripe does not guarantee ordering.
   */
  eventCreatedAt: string
  /** The Stripe event type this state came from (logging / adapter branching). */
  eventType: string
}

/**
 * How to locate the subscriber row. Populated from whatever the event carried — the adapter
 * decides which identifiers it can actually match on.
 */
export interface SubscriberRef {
  /** Lower-cased where known. */
  email: string | null
  /** From session/subscription metadata (e.g. `supabase_user_id`) — the most authoritative match. */
  userId: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

/** The minimum the adapter must return about a located subscriber. */
export interface SubscriberRecord {
  /** Primary key of the subscriber row, passed back to `apply`. */
  id: string
  /**
   * The `event_created_at` of the last Stripe event applied to this row, if the product stores one.
   * Omit (or null) to opt out of the out-of-order guard — last write wins.
   */
  lastStripeEventAt?: string | null
}

/**
 * The product-side seam. Implement it (or use `createSupabaseSubscriptionAdapter`) to map the
 * normalized state onto your own table.
 */
export interface SubscriptionAdapter {
  /** Locate the subscriber. Return null when the account doesn't exist yet. */
  find(ref: SubscriberRef): Promise<SubscriberRecord | null>
  /** Write the state. Throw to make the reducer return 500 so Stripe retries. */
  apply(record: SubscriberRecord, state: SubscriptionState): Promise<void>
  /**
   * Side effects after a cancellation has been written (deactivate agents, revoke access).
   * Separate from `apply` so a failure here is distinguishable from a failed state write.
   */
  onCancelled?(record: SubscriberRecord, state: SubscriptionState): Promise<void>
  /**
   * Called when no subscriber row exists yet. This is EXPECTED in flows where checkout completes
   * before the account is created (Stripe frequently delivers before the buyer has finished setting
   * a password) — the product's onboarding writes the same fields from the same session. Handle it
   * or leave it unset to no-op; either way the reducer acks 200 rather than looping Stripe retries.
   */
  onSubscriberMissing?(ref: SubscriberRef, state: SubscriptionState): Promise<void>
}

/** Why a webhook call did nothing. Surfaced in the response body for log-readability. */
export type WebhookOutcome =
  | 'applied'
  | 'duplicate'
  | 'stale'
  | 'subscriber_missing'
  | 'ignored_type'
  | 'signature_invalid'
  | 'missing_signature'
  | 'error'

export interface WebhookResult {
  /** HTTP status to return to Stripe. 200 = ack (don't retry); 4xx/5xx = Stripe retries. */
  status: number
  body: {
    received: boolean
    outcome: WebhookOutcome
    event_id?: string
    event_type?: string
    reason?: string
  }
}
