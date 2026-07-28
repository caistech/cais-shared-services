# @caistech/subscription-billing

Stripe subscription lifecycle, shared across the portfolio.

The package owns the mechanics every product repeats — building a checkout session, verifying the
webhook, deduping on `event.id`, ignoring out-of-order deliveries, and normalizing Stripe's status
vocabulary. The product keeps what is genuinely its own: **the price** and **the table**.

## Why it exists

Two divergent forks of this existed before it — Kira (`users` table, valuation-derived dynamic
price, 7-day trial) and LaunchReady (`profiles` table, fixed price id, no trial) — and **neither was
idempotent or ordering-safe**. Stripe retries on any non-2xx and does not guarantee delivery order,
so both were one redelivery away from double-applying and one out-of-order event away from
resurrecting cancelled state. A resold, white-label channel cannot ship three billing shapes.

## Install

```bash
npm install @caistech/subscription-billing
```

Peers: `stripe` (>=17), `@supabase/supabase-js` (optional — only for the bundled adapter).

## 1. Migration

Apply `migration.sql`. Part 1 (the `stripe_webhook_events` idempotency ledger) is required; part 2
is a commented template for the columns the Supabase adapter writes onto *your* subscriber table.

`last_stripe_event_at` is what enables the out-of-order guard. Without it you get last-write-wins.

## 2. Checkout

```ts
import { createSubscriptionCheckoutSession } from '@caistech/subscription-billing'

// Dynamic price — computed server-side so the client can't forge it.
const session = await createSubscriptionCheckoutSession({
  stripe,
  lineItem: {
    currency: 'AUD',
    unitAmount: Math.round(quote.monthly * 100), // minor units
    productName: 'Kira Business Plan',
  },
  trialDays: 30,
  cardAtSignup: true,          // default — see below
  successUrl: `${base}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl: `${base}/plan`,
  subscriptionMetadata: { supabase_user_id: user.id },
})
```

Or a fixed price: `lineItem: { priceId: 'price_123' }`.

**`cardAtSignup` defaults to true** (`payment_method_collection: 'always'`). With a trial and
`if_required`, Stripe happily creates the subscription with no payment method — and the first charge
silently fails 30 days later, after the customer has been using the product all month.

Put the identifiers you'll need later in **`subscriptionMetadata`**, not just `metadata`: session
metadata only appears on `checkout.session.completed`, while subscription metadata rides on every
subsequent lifecycle event.

## 2b. Arrears — "you are never billed for the month you are in" (v0.2.0)

The default shapes above bill **in advance**. If your commercial model is that the period is **owed
from day one and invoiced when it closes**, with a cancellation before the bill falls due **waiving**
that month, use the arrears line item.

```ts
const session = await createSubscriptionCheckoutSession({
  stripe,
  lineItem: {
    arrears: true,
    meterEventName: 'kira_subscription_month', // stable per product
    currency: 'AUD',
    unitAmount: Math.round(quote.monthly * 100),
    productName: 'Kira Business Plan',
    lookupKeyPrefix: 'kira',
  },
  // NO trialDays — it is the opposite offer, and passing both throws.
  successUrl, cancelUrl,
})
```

Then report each period as it **begins**, and waive on cancellation:

```ts
import { cancelWithWaiver, reportPeriodOwed } from '@caistech/subscription-billing'

await reportPeriodOwed({
  stripe,
  eventName: 'kira_subscription_month',
  stripeCustomerId,
  identifier: `${subscriptionId}:${periodStartUnix}`, // dedupes a retried webhook
})

await cancelWithWaiver({ stripe, subscriptionId }) // prorate:false + invoice_now:false
```

### Four things that bite

1. **A trial is not arrears.** They look identical for thirty days and then invert: the day-30
   charge under a trial buys days 30–60, under arrears it pays for days 0–30. A product that means
   arrears and ships `trialDays: 30` under-bills by one month per customer, forever. Passing both
   throws rather than silently picking one.
2. **Arrears can't be an inline `price_data` flag.** Checkout's `price_data.recurring` accepts only
   `interval`/`interval_count` — no `usage_type`, no `meter` — so the Price must exist before the
   session does. That is what `ensureMeteredPrice` is for, and it is keyed on a deterministic
   `lookup_key` so a per-customer price doesn't create a new Price object per checkout.
3. **Dropping `trialDays` without switching to arrears charges immediately.** The full amount comes
   out at checkout — the exact opposite of the intent. Change both together.
4. **An unreported period invoices $0 and bills nobody**, against a subscription that looks
   completely healthy. `reportPeriodOwed` throws on failure so the caller can assert it happened;
   treat it as an error path, not a promise you may ignore.

The waiver is `cancelWithWaiver`, not two options set correctly at a call site, because a promise
that can be forgotten is not a promise. An invoice landing after a customer cancelled and was told
the month was on us is the failure this shape exists to make structurally impossible.

`createBillingPortalSession` is also exported — every subscription product owes its customers a way
to cancel and update their card.

## 3. Webhook

```ts
import {
  createSupabaseIdempotencyStore,
  createSupabaseSubscriptionAdapter,
  handleSubscriptionWebhook,
} from '@caistech/subscription-billing'

export async function POST(request: Request) {
  const rawBody = await request.text()   // MUST be the raw body — see caveat below

  const result = await handleSubscriptionWebhook(
    {
      stripe,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      idempotency: createSupabaseIdempotencyStore({ supabase }),
      adapter: createSupabaseSubscriptionAdapter({
        supabase,
        table: 'users',
        onCancelled: async ({ id }) => {
          await supabase.from('kira_agents').update({ status: 'inactive' }).eq('user_id', id)
        },
      }),
    },
    rawBody,
    request.headers.get('stripe-signature'),
  )

  return Response.json(result.body, { status: result.status })
}
```

**Raw body:** parse-then-restringify fails signature verification. Read `request.text()` before any
JSON parsing.

### What it handles

| Stripe event | Recorded status |
|---|---|
| `checkout.session.completed` | retrieved from the subscription — `trialing` during a trial, not a flat `active` |
| `customer.subscription.created` / `.updated` | mapped from `subscription.status` |
| `customer.subscription.deleted` | `cancelled` (+ `onCancelled` hook) |
| `invoice.payment_failed` | `past_due` (even when Stripe still reports `active` — dunning lags) |
| `invoice.payment_succeeded` | mapped from the subscription (recovers a `past_due` row) |
| anything else | acked, no claim consumed |

### Outcomes

Every call returns `{ status, body: { outcome, ... } }`. `outcome` is one of `applied`, `duplicate`,
`stale`, `subscriber_missing`, `ignored_type`, `signature_invalid`, `missing_signature`, `error` —
log it; it makes "why didn't the subscription update?" a one-line answer.

`subscriber_missing` is **expected**, not an error: Stripe frequently delivers checkout completion
before the buyer has finished setting a password, and the product's own onboarding writes the same
fields from the same session. The reducer acks 200 rather than looping Stripe retries against an
account that doesn't exist yet.

## Idempotency, and one deliberate departure

`claim` inserts the `event.id`; a unique violation means already-seen, so the redelivery
short-circuits. **If the apply then fails, the claim is released (row deleted) before returning
500.** Without that, Stripe's retry is answered "duplicate" and one transient DB error silently and
permanently drops a subscription event. `@caistech/api-key-auth` has the older behaviour; this is
the corrected shape.

Failing to *reach* the idempotency store returns 500 rather than proceeding — fail closed, so a
broken store can't become an at-least-once double-apply.

## Converging two table shapes

The adapter is a column map plus an optional projection, so products converge by **config**, not by
a second webhook handler:

```ts
// Kira — defaults already match (users.subscription_status, stripe_customer_id, ...)
createSupabaseSubscriptionAdapter({ supabase, table: 'users' })

// LaunchReady — same lifecycle, different vocabulary
createSupabaseSubscriptionAdapter({
  supabase,
  table: 'profiles',
  columns: { status: 'stripe_subscription_status', currentPeriodEnd: 'stripe_current_period_end' },
  extraColumns: (s) => ({ plan: s.status === 'active' || s.status === 'trialing' ? 'pro' : 'free' }),
})
```

Set a column to `null` to disable it (e.g. `email: null` when the table has no email, so the adapter
never tries to match on it).

Need something the map can't express? Implement `SubscriptionAdapter` directly — `find` / `apply` /
`onCancelled` / `onSubscriberMissing` — and keep the reducer.

## Status vocabulary

Stripe spells it `canceled`; this package normalizes to **`cancelled`** (two Ls), which is what the
products' own types and admin panels already read. Map it to whatever your column stores via
`extraColumns`; don't re-spell it in the reducer.

## API-version tolerance

`current_period_end` moved from the subscription onto its items, and the invoice→subscription link
moved under `parent.subscription_details`, in the 2025-03 API version. Consumers pin different SDK
majors, so both shapes are read. You do not need to align your `stripe` version with this package's.

## Tests

`npm test` (vitest) — 28 tests covering status mapping, signature rejection, the duplicate
short-circuit, the out-of-order guard, claim-release-on-failure, the missing-subscriber ack, both
adapter column shapes, and the checkout builder.
