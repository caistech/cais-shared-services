# Usage Guide — `@caistech/api-key-auth`

Companion to `README.md`. Covers consumer setup, env vars, key issuance,
revocation, manual key admin, and Edge Function patterns.

## 1. One-time consumer setup

### 1.1 Apply the migration

```bash
# In your consumer repo:
psql "$DATABASE_URL" -f node_modules/@caistech/api-key-auth/migrations/001_api_key_auth.sql
```

Or via Supabase CLI:

```bash
supabase db push --include-extra-schemas \
  node_modules/@caistech/api-key-auth/migrations/001_api_key_auth.sql
```

The migration is idempotent and creates `pgcrypto` if missing.

### 1.2 Decide your `productPrefix`

Hub default is bare `cais`. Set a per-product prefix so issued keys are
distinguishable in logs and customer dashboards.

| Portfolio API | Suggested prefix |
|---|---|
| property-services | `props` |
| DealFindrs | `deal` |
| MMC Build | `mmc` |
| F2K | `f2k` |
| TenderWatch | `tw` |

Pass it once in your Stripe webhook config (`productPrefix: 'props'`).
Verification doesn't need the prefix — keys are looked up by their first
12 chars regardless of which product issued them.

### 1.3 Required env vars

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | Edge Function | Same project as `api_keys` table |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function | Server-side only — never expose |
| `STRIPE_SECRET_KEY` | Webhook handler | Determines live/test |
| `STRIPE_WEBHOOK_SECRET` | Webhook handler | Set per webhook endpoint in Stripe dashboard |

## 2. Edge Function patterns

### 2.1 Basic auth + quota

```ts
import { withApiKey } from 'npm:@caistech/api-key-auth@^0.1.0'

export default withApiKey(
  { supabase, endpoint: '/derive' },
  async (req, { apiKey }) => {
    // apiKey: ApiKeyRow — verified, active, within quota, increment already committed
    return new Response('ok')
  }
)
```

### 2.2 Variable weight (force-refresh costs 2x)

```ts
withApiKey(
  {
    supabase,
    endpoint: '/derive',
    weight: req => (req.headers.get('X-Force-Refresh') === '1' ? 2 : 1),
  },
  handler
)
```

### 2.3 Cache-hit logging

The wrapper reads `X-Cache-Hit: 1` (or `true`) on the response and writes
it to `api_usage_logs.cache_hit`. Set the header in your handler:

```ts
async (req, { apiKey }) => {
  const cached = await tryCache(req)
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { 'Content-Type': 'application/json', 'X-Cache-Hit': '1' },
    })
  }
  // … fall through to live work …
}
```

### 2.4 Custom header name

```ts
withApiKey({ supabase, endpoint: '/derive', headerName: 'authorization' }, handler)
```

(Pass through whatever your customers expect — but `X-API-Key` is the
common-case default.)

## 3. Manual key administration

The package does not ship an admin CLI. SQL primitives:

```sql
-- Revoke a key (preserves usage history):
update api_keys set active = false, revoked_at = now() where key_prefix = 'cais_props_l';

-- Restore a key:
update api_keys set active = true, revoked_at = null where id = '...';

-- Bump a customer to a higher plan manually:
update api_keys set plan_tier = 'pro', monthly_limit = 10000 where id = '...';

-- Find heavy users this month:
select customer_email, current_period_calls, monthly_limit
  from api_keys
 where current_period_calls > monthly_limit * 0.8
   and monthly_limit > 0
 order by current_period_calls desc;
```

## 4. Soft-warning email job (separate cron)

The package does NOT send 80%-quota warning emails. That belongs to a
separate cron in the consumer repo:

```sql
-- Identify keys at >= 80% usage that haven't been emailed this period:
select id, customer_email, current_period_calls, monthly_limit
  from api_keys
 where monthly_limit > 0
   and current_period_calls::float / monthly_limit >= 0.8
   and (warning_sent_at is null or warning_sent_at < period_start);
```

(You'll need to add a `warning_sent_at timestamptz` column on `api_keys`
in a follow-up migration.)

## 5. Out-of-order Stripe events

The webhook handler tolerates Stripe redelivering events out of order:

- `stripe_webhook_events.event_id` is the dedupe key (PRIMARY KEY).
- For each `api_keys` row, `last_stripe_event_at` stores the `created`
  timestamp of the most recently APPLIED event.
- Subscription updates / cancellations are ignored if their event's
  `created` is older than the row's `last_stripe_event_at`.
- This prevents a delayed `subscription.updated` (downgrade) from
  overwriting a more recent `subscription.updated` (upgrade) that arrived
  first.

## 6. Migrating from a hand-rolled `src/lib/api-key-auth.ts`

If your consumer repo already has a local implementation:

1. Apply this package's migration (idempotent — won't break existing tables
   if column names match).
2. Replace local imports:
   ```diff
   - import { withApiKey } from '@/lib/api-key-auth'
   + import { withApiKey } from 'npm:@caistech/api-key-auth@^0.1.0'
   ```
3. Delete the local file.
4. Run your auth tests against staging before promoting.

## 7. Versioning policy

- `0.1.x` — patch fixes against the API surface above.
- `0.2.0` — adds optional composition with
  `@caistech/platform-trust-middleware` for audit-log writes and AI token
  cost metering on `/assess`-style endpoints. Requires that package
  shipping a Deno-compatible build first.
- `1.0.0` — when a second portfolio API has shipped against this package
  in production for ≥4 weeks without breaking changes.
