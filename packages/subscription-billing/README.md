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

`createBillingPortalSession` is also exported — every subscription product owes its customers a way
to cancel and update their card.

### Tax (v0.2.0)

A product that advertises "$499 **+ GST**" has to actually collect it, and the two mechanisms are
not interchangeable:

```ts
// A fixed statutory rate the seller always charges (AU GST). No Stripe Tax subscription needed.
taxRates: [process.env.STRIPE_GST_TAX_RATE_ID!]   // → subscription_data.default_tax_rates

// Or: let Stripe Tax work it out from where the buyer is. Needs Stripe Tax + your registrations.
automaticTax: true                                 // → automatic_tax.enabled (+ customer_update)
```

Passing both throws rather than letting Stripe pick one.

Two traps this closes, both of which fail **silently** — a correct-looking invoice with no tax on it:

- **`default_tax_rates` goes on the SUBSCRIPTION, not the line item.** A line-item rate covers the
  checkout invoice only; every renewal after it bills untaxed.
- **`price_data` defaults to `tax_behavior: 'unspecified'`,** which disqualifies the line from tax
  calculation entirely. So a dynamic line with `taxRates` or `automaticTax` is set to `exclusive`
  automatically — pass `lineItem.taxBehavior` to override.

A fixed Stripe Price (`priceId`) carries its own tax behaviour: set it on the Price object, since
the package cannot change a price it did not build.

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
