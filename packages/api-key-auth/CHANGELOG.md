# @caistech/api-key-auth — Changelog

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
