/**
 * Supabase implementations of the two seams: the subscriber-table adapter and the idempotency store.
 *
 * These exist so convergence is a CONFIG change, not a rewrite. Kira's `users.subscription_status`
 * and LaunchReady's `profiles.plan` + `profiles.stripe_subscription_status` are the same lifecycle
 * with different column names — expressed here as a column map plus an optional `extraColumns`
 * projection, rather than two hand-rolled webhook handlers that drift apart.
 *
 * Requires a SERVICE-ROLE client: these tables are RLS-on and the reducer runs server-side.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  SubscriberRecord,
  SubscriberRef,
  SubscriptionAdapter,
  SubscriptionState,
} from './types.js'
import type { IdempotencyStore } from './webhook.js'

export interface SubscriberColumns {
  /** Primary key. Default `id`. */
  id?: string
  /** Email column used to locate the row. Default `email`. Set null if the table has none. */
  email?: string | null
  /**
   * Column matching `SubscriberRef.userId`. Default: the primary key (the common shape, where the
   * subscriber row id IS the auth user id). Set null to never match on user id.
   */
  userId?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  /** Column holding the normalized status. Default `subscription_status`. */
  status?: string | null
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  /** Enables the out-of-order guard when set. Default `last_stripe_event_at`. */
  lastStripeEventAt?: string | null
  /** Touched on every write when set. Default `updated_at`. */
  updatedAt?: string | null
}

export interface SupabaseSubscriptionAdapterOptions {
  supabase: SupabaseClient
  /** The subscriber table, e.g. `users` (Kira) or `profiles` (LaunchReady). */
  table: string
  columns?: SubscriberColumns
  /**
   * Extra columns to write alongside the standard ones — the product's own vocabulary. e.g.
   * `(state) => ({ plan: state.status === 'active' || state.status === 'trialing' ? 'pro' : 'free' })`.
   */
  extraColumns?: (state: SubscriptionState) => Record<string, unknown>
  onCancelled?: (record: SubscriberRecord, state: SubscriptionState) => Promise<void>
  onSubscriberMissing?: (ref: SubscriberRef, state: SubscriptionState) => Promise<void>
}

const DEFAULTS: Required<Omit<SubscriberColumns, 'userId'>> & { userId?: string | null } = {
  id: 'id',
  email: 'email',
  stripeCustomerId: 'stripe_customer_id',
  stripeSubscriptionId: 'stripe_subscription_id',
  status: 'subscription_status',
  currentPeriodEnd: null,
  trialEndsAt: null,
  lastStripeEventAt: 'last_stripe_event_at',
  updatedAt: 'updated_at',
}

export function createSupabaseSubscriptionAdapter(
  opts: SupabaseSubscriptionAdapterOptions,
): SubscriptionAdapter {
  const { supabase, table } = opts
  const cols = { ...DEFAULTS, ...opts.columns }
  const idCol = cols.id
  // `userId === undefined` means "not configured" → fall back to the pk; an explicit null disables it.
  const userIdCol = opts.columns && 'userId' in opts.columns ? opts.columns.userId : idCol

  const selectCols = [idCol, cols.lastStripeEventAt].filter(Boolean).join(', ')

  async function findBy(column: string, value: string): Promise<SubscriberRecord | null> {
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .eq(column, value)
      .maybeSingle()
    if (error) throw new Error(`subscription-billing find(${column}): ${error.message}`)
    if (!data) return null
    const row = data as unknown as Record<string, unknown>
    return {
      id: String(row[idCol]),
      lastStripeEventAt: cols.lastStripeEventAt
        ? ((row[cols.lastStripeEventAt] as string | null) ?? null)
        : null,
    }
  }

  return {
    async find(ref) {
      // Most authoritative identifier first: an explicit user id beats a Stripe id, which beats an
      // email (emails change, and a user can check out with a different one).
      const attempts: Array<[string | null | undefined, string | null]> = [
        [userIdCol, ref.userId],
        [cols.stripeSubscriptionId, ref.stripeSubscriptionId],
        [cols.stripeCustomerId, ref.stripeCustomerId],
        [cols.email, ref.email],
      ]
      for (const [column, value] of attempts) {
        if (!column || !value) continue
        const found = await findBy(column, value)
        if (found) return found
      }
      return null
    },

    async apply(record, state) {
      const patch: Record<string, unknown> = {}
      if (cols.status) patch[cols.status] = state.status
      if (cols.stripeCustomerId && state.stripeCustomerId) {
        patch[cols.stripeCustomerId] = state.stripeCustomerId
      }
      if (cols.stripeSubscriptionId) {
        // Null it on cancellation so a cancelled row can't be matched as an active subscriber.
        patch[cols.stripeSubscriptionId] =
          state.status === 'cancelled' ? null : (state.stripeSubscriptionId ?? null)
      }
      if (cols.currentPeriodEnd) patch[cols.currentPeriodEnd] = state.currentPeriodEnd
      if (cols.trialEndsAt) patch[cols.trialEndsAt] = state.trialEndsAt
      if (cols.lastStripeEventAt) patch[cols.lastStripeEventAt] = state.eventCreatedAt
      if (cols.updatedAt) patch[cols.updatedAt] = new Date().toISOString()
      Object.assign(patch, opts.extraColumns?.(state) ?? {})

      const { error } = await supabase.from(table).update(patch).eq(idCol, record.id)
      if (error) throw new Error(`subscription-billing apply: ${error.message}`)
    },

    ...(opts.onCancelled ? { onCancelled: opts.onCancelled } : {}),
    ...(opts.onSubscriberMissing ? { onSubscriberMissing: opts.onSubscriberMissing } : {}),
  }
}

/**
 * Idempotency backed by the `stripe_webhook_events` table in `migration.sql`.
 *
 * `claim` inserts and treats a unique-violation as "already seen". `release` deletes the row so a
 * Stripe retry of a FAILED apply can run again — without it, one transient DB error would
 * permanently drop a subscription event.
 */
export function createSupabaseIdempotencyStore(opts: {
  supabase: SupabaseClient
  table?: string
}): IdempotencyStore {
  const table = opts.table ?? 'stripe_webhook_events'
  return {
    async claim(event) {
      const { error } = await opts.supabase.from(table).insert({
        event_id: event.id,
        event_type: event.type,
        event_created_at: event.createdAt,
      })
      if (!error) return true
      if (error.code === '23505' || /duplicate key/i.test(error.message)) return false
      throw new Error(`subscription-billing idempotency: ${error.message}`)
    },
    async release(eventId) {
      await opts.supabase.from(table).delete().eq('event_id', eventId)
    },
  }
}
