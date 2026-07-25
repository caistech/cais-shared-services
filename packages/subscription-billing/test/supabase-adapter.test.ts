import { describe, expect, it } from 'vitest'

import { createSupabaseIdempotencyStore, createSupabaseSubscriptionAdapter } from '../src/supabase'
import type { SubscriptionState } from '../src/types'

// ─── a minimal Supabase query-builder double ─────────────────────────────────
//
// Records every select/update/insert/delete so the tests can assert WHICH column the adapter
// matched on and WHAT patch it wrote — the two things that actually differ between products.

interface Call {
  table: string
  op: 'select' | 'update' | 'insert' | 'delete'
  column?: string
  value?: string
  patch?: Record<string, unknown>
  row?: Record<string, unknown>
}

function mockSupabase(rows: Record<string, Record<string, unknown> | null> = {}, insertError?: { code?: string; message: string }) {
  const calls: Call[] = []

  const client = {
    from(table: string) {
      return {
        select() {
          // maybeSingle() resolves against the last eq() applied — enough for this adapter,
          // which only ever filters on one column at a time.
          let matched = ''
          const query = {
            eq(column: string, value: string) {
              matched = `${column}:${value}`
              calls.push({ table, op: 'select', column, value })
              return query
            },
            maybeSingle: async () => ({ data: rows[matched] ?? null, error: null }),
          }
          return query
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async (column: string, value: string) => {
              calls.push({ table, op: 'update', column, value, patch })
              return { error: null }
            },
          }
        },
        insert: async (row: Record<string, unknown>) => {
          calls.push({ table, op: 'insert', row })
          return { error: insertError ?? null }
        },
        delete() {
          return {
            eq: async (column: string, value: string) => {
              calls.push({ table, op: 'delete', column, value })
              return { error: null }
            },
          }
        },
      }
    },
  }

  return { client: client as never, calls }
}

const state = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  status: 'trialing',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  priceId: 'price_1',
  currentPeriodEnd: '2027-02-14T00:00:00.000Z',
  trialEndsAt: '2027-02-14T00:00:00.000Z',
  eventCreatedAt: '2027-01-15T08:00:00.000Z',
  eventType: 'checkout.session.completed',
  ...over,
})

describe('createSupabaseSubscriptionAdapter — lookup order', () => {
  it('matches on the metadata user id before any Stripe id or email', async () => {
    const { client, calls } = mockSupabase({ 'id:user_1': { id: 'user_1', last_stripe_event_at: null } })
    const adapter = createSupabaseSubscriptionAdapter({ supabase: client, table: 'users' })

    const found = await adapter.find({
      userId: 'user_1',
      email: 'owner@example.com',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })

    expect(found?.id).toBe('user_1')
    expect(calls.filter((c) => c.op === 'select')).toHaveLength(1)
    expect(calls[0].column).toBe('id')
  })

  it('falls back through subscription id → customer id → email', async () => {
    const { client, calls } = mockSupabase({
      'email:owner@example.com': { id: 'user_9', last_stripe_event_at: null },
    })
    const adapter = createSupabaseSubscriptionAdapter({ supabase: client, table: 'users' })

    const found = await adapter.find({
      userId: null,
      email: 'owner@example.com',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })

    expect(found?.id).toBe('user_9')
    expect(calls.map((c) => c.column)).toEqual([
      'stripe_subscription_id',
      'stripe_customer_id',
      'email',
    ])
  })

  it('skips identifiers whose column is disabled', async () => {
    const { client, calls } = mockSupabase()
    const adapter = createSupabaseSubscriptionAdapter({
      supabase: client,
      table: 'profiles',
      columns: { email: null, userId: 'id' },
    })

    await adapter.find({
      userId: null,
      email: 'owner@example.com',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: null,
    })

    expect(calls.map((c) => c.column)).toEqual(['stripe_customer_id'])
  })
})

describe('createSupabaseSubscriptionAdapter — apply', () => {
  it("writes Kira's shape: status, stripe ids, and the out-of-order stamp", async () => {
    const { client, calls } = mockSupabase()
    const adapter = createSupabaseSubscriptionAdapter({ supabase: client, table: 'users' })

    await adapter.apply({ id: 'user_1' }, state())

    const patch = calls.find((c) => c.op === 'update')!.patch!
    expect(patch.subscription_status).toBe('trialing')
    expect(patch.stripe_customer_id).toBe('cus_1')
    expect(patch.stripe_subscription_id).toBe('sub_1')
    expect(patch.last_stripe_event_at).toBe('2027-01-15T08:00:00.000Z')
    expect(patch.updated_at).toBeTypeOf('string')
  })

  it("writes LaunchReady's shape via a column map + extraColumns, with no code fork", async () => {
    const { client, calls } = mockSupabase()
    const adapter = createSupabaseSubscriptionAdapter({
      supabase: client,
      table: 'profiles',
      columns: {
        status: 'stripe_subscription_status',
        currentPeriodEnd: 'stripe_current_period_end',
        lastStripeEventAt: 'last_stripe_event_at',
        updatedAt: null,
      },
      extraColumns: (s) => ({ plan: s.status === 'active' || s.status === 'trialing' ? 'pro' : 'free' }),
    })

    await adapter.apply({ id: 'user_1' }, state({ status: 'past_due' }))

    const patch = calls.find((c) => c.op === 'update')!.patch!
    expect(patch.stripe_subscription_status).toBe('past_due')
    expect(patch.plan).toBe('free')
    expect(patch.stripe_current_period_end).toBe('2027-02-14T00:00:00.000Z')
    expect(patch.updated_at).toBeUndefined()
    expect(patch.subscription_status).toBeUndefined()
  })

  it('clears the subscription id on cancellation so the row stops matching as a subscriber', async () => {
    const { client, calls } = mockSupabase()
    const adapter = createSupabaseSubscriptionAdapter({ supabase: client, table: 'users' })

    await adapter.apply({ id: 'user_1' }, state({ status: 'cancelled' }))

    const patch = calls.find((c) => c.op === 'update')!.patch!
    expect(patch.stripe_subscription_id).toBeNull()
    expect(patch.subscription_status).toBe('cancelled')
  })
})

describe('createSupabaseIdempotencyStore', () => {
  it('claims a new event and reports a unique violation as already-seen', async () => {
    const fresh = mockSupabase()
    const store = createSupabaseIdempotencyStore({ supabase: fresh.client })
    expect(
      await store.claim({ id: 'evt_1', type: 'customer.subscription.updated', createdAt: 'now' }),
    ).toBe(true)

    const dup = mockSupabase({}, { code: '23505', message: 'duplicate key value' })
    const dupStore = createSupabaseIdempotencyStore({ supabase: dup.client })
    expect(
      await dupStore.claim({ id: 'evt_1', type: 'customer.subscription.updated', createdAt: 'now' }),
    ).toBe(false)
  })

  it('throws on a real store failure rather than silently double-applying', async () => {
    const broken = mockSupabase({}, { code: '08006', message: 'connection failure' })
    const store = createSupabaseIdempotencyStore({ supabase: broken.client })
    await expect(
      store.claim({ id: 'evt_1', type: 'x', createdAt: 'now' }),
    ).rejects.toThrow(/connection failure/)
  })

  it('releases a claim by deleting the event row', async () => {
    const { client, calls } = mockSupabase()
    await createSupabaseIdempotencyStore({ supabase: client }).release('evt_1')
    expect(calls).toContainEqual({
      table: 'stripe_webhook_events',
      op: 'delete',
      column: 'event_id',
      value: 'evt_1',
    })
  })
})
