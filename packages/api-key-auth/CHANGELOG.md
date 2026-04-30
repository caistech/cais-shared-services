# @caistech/api-key-auth — Changelog

## 0.1.1 — 2026-04-30

Widen Stripe peer range from `^17.0.0` to `>=17.0.0` so consumers can
upgrade Stripe to v22+ without npm rejecting the install.

The package never imports the Stripe SDK at runtime — `import type
Stripe from 'stripe'` is type-only. Runtime calls (`webhooks.constructEvent`,
`checkout.sessions.listLineItems`) are made on the consumer-provided
`opts.stripe` instance, and both method signatures are stable across
Stripe v17 → v22, so any v17+ release works at runtime. The previous
tight range was unnecessarily restrictive — every Stripe major bump in
a consumer project would trip ERESOLVE.

Hit by `property-services` Vercel build:
```
peer stripe@"^17.0.0" from @caistech/api-key-auth@0.1.0
Conflicting peer dependency: stripe@17.7.0 (consumer has stripe@22.1.0)
```

No code changes; package.json only.

## 0.1.0 — 2026-04-30

Initial release. B2B public-API authentication for the CAIS portfolio.

### Core (Deno + Node)

- `verifyApiKey()` — sha256-hashed opaque keys, prefix-indexed lookup,
  constant-time hash comparison.
- `checkMonthlyQuota()` — calendar-month rollover semantics; supports
  `monthly_limit = -1` (Enterprise unlimited).
- `incrementUsage()` — atomic counter increment via the
  `increment_api_usage(uuid, int)` SQL function.
- `logUsage()` — fire-and-forget insert into `api_usage_logs`.
- `withApiKey()` — Deno-compatible Request → Response wrapper. Sets
  `X-RateLimit-Limit / Remaining / Reset` headers, returns 401 / 429 with
  structured bodies.
- `generateApiKey()` — produces `{ plaintext, hash, prefix }` with
  configurable `productPrefix` (default `cais`, e.g. `cais_props_live_…`).

### Stripe sub-module (Node only)

- `handleStripeWebhook()` — signature verification, event-id idempotency,
  out-of-order tolerance via `api_keys.last_stripe_event_at`. Handles
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`. Calls `onKeyIssued` exactly once per
  new key with the plaintext (never stored).

### Migration

- `migrations/001_api_key_auth.sql` — `pgcrypto`, `api_keys`,
  `api_usage_logs`, `stripe_webhook_events`, `increment_api_usage()`.
  Idempotent.

### Not yet included (planned for 0.2.0)

- Composition with `@caistech/platform-trust-middleware` for audit-log
  writes and AI cost metering. Blocked on PTM shipping a Deno-compatible
  build (`'crypto'` → `'node:crypto'`, Next.js code split into a sub-path).
