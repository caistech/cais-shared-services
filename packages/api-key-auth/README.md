# @caistech/api-key-auth

B2B public-API authentication, monthly quota with calendar-month rollover,
`X-RateLimit-*` response headers, and a Stripe billing webhook handler.

**Deno-first.** The auth + quota path runs unchanged on Supabase Edge
Functions (`npm:@caistech/api-key-auth`) and on Node. The Stripe sub-module
(`@caistech/api-key-auth/stripe`) is Node-only — Stripe's SDK does not
ship a Deno build.

## Why this exists

`@caistech/platform-trust-middleware` covers **internal AI agent gating**
(per-agent rate limits, scope/operation policies, token cost metering) but
not **paying B2B customers calling a public API**:

- API-key lifecycle (issue → verify → revoke) keyed by `X-API-Key`.
- Calendar-month quota (`monthly_limit` per customer / plan tier).
- Public 429 semantics with `X-RateLimit-Limit / Remaining / Reset`.
- Stripe webhook idempotency and out-of-order tolerance.

This package is purpose-built for that. See
`docs/STEP_5_HUB_AUDIT.md` in `property-services` for the design rationale.

## Install

```bash
npm install @caistech/api-key-auth --legacy-peer-deps
```

For Stripe webhook handling (Node only):

```bash
npm install @caistech/api-key-auth stripe --legacy-peer-deps
```

GitHub Packages registry — add to `.npmrc`:

```
@caistech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

## Schema

Apply `migrations/001_api_key_auth.sql` against the consumer's Supabase
project. It creates `api_keys`, `api_usage_logs`, `stripe_webhook_events`,
and the `increment_api_usage(uuid, int)` SQL function. The migration is
idempotent (`if not exists`) and self-heals `pgcrypto`.

## Quickstart — Supabase Edge Function (Deno)

```ts
// supabase/functions/derive/index.ts
import { withApiKey } from 'npm:@caistech/api-key-auth@^0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@^2.49.4'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

export default withApiKey(
  {
    supabase,
    endpoint: '/derive',
    weight: req => (req.headers.get('X-Force-Refresh') === '1' ? 2 : 1),
  },
  async (req, { apiKey }) => {
    // your handler logic — apiKey is the verified ApiKeyRow
    return new Response(JSON.stringify({ hello: apiKey.customer_email }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
)
```

## Quickstart — Stripe webhook (Next.js / Node)

```ts
// app/api/billing/webhook/route.ts
import Stripe from 'stripe'
import { handleStripeWebhook } from '@caistech/api-key-auth/stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(req: Request) {
  const rawBody = Buffer.from(await req.arrayBuffer())
  const signature = req.headers.get('stripe-signature')

  const result = await handleStripeWebhook(
    {
      supabase: supabaseAdmin,
      stripe,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      productPrefix: 'props', // → keys look like cais_props_live_<random>
      planMap: {
        'price_starter_id':    { tier: 'starter',    monthly_limit: 1_000 },
        'price_pro_id':        { tier: 'pro',        monthly_limit: 10_000 },
        'price_enterprise_id': { tier: 'enterprise', monthly_limit: -1 },
      },
      onKeyIssued: async ({ plaintext, customerEmail, planTier }) => {
        await resend.emails.send({
          from: 'Property Services <noreply@…>',
          to: customerEmail,
          subject: `Your ${planTier} API key`,
          text: `Your API key (save it now — it won't be shown again):\n\n${plaintext}`,
        })
      },
    },
    rawBody,
    signature
  )

  return Response.json(result.body, { status: result.status })
}
```

## Public API

### Core (Deno + Node)

- `verifyApiKey(supabase, presentedKey)` → `{ ok, key?, error? }`
- `checkMonthlyQuota(key, opts?)` → `{ ok, remaining, limit, reset_at, current_period_calls }`
- `incrementUsage(supabase, key, weight?)` — atomic via `increment_api_usage` RPC
- `logUsage(supabase, key, { endpoint, cache_hit?, duration_ms?, status_code? })`
- `withApiKey(opts, handler)` — composable wrapper for Edge Function handlers
- `generateApiKey(opts?)` — produces `{ plaintext, hash, prefix }`
- `sha256Hex(input)`, `constantTimeEqualHex(a, b)` — exposed for advanced auth flows

### Stripe sub-module (Node only)

- `handleStripeWebhook(opts, rawBody, signatureHeader)` →
  `{ status, body }`

## Key format

`cais[_<productPrefix>]_<env>_<base64url(32 random bytes)>`

Examples:

| productPrefix | environment | example |
|---|---|---|
| (none) | live | `cais_live_AbCdEf…` |
| `props` | live | `cais_props_live_AbCdEf…` |
| `props` | test | `cais_props_test_AbCdEf…` |
| `deal` | live | `cais_deal_live_…` |

The package stores `sha256(plaintext)` as `key_hash` and the first 12 chars
as `key_prefix` (indexed). Lookup is by prefix; comparison is constant-time.

## Versioning

`0.1.0` ships verify + quota + Stripe billing. `0.2.0` will add composition
with `@caistech/platform-trust-middleware` (audit logging + AI cost
metering) once that package gains a Deno-compatible build.

## License

PRIVATE — internal CAIS portfolio use only.
