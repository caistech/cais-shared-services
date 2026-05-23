# @caistech/platform-trust-middleware — Changelog

## 0.4.1 — 2026-05-23

### BYOK config — explicit `supabaseUrl` / `serviceKey` / `projectId` options

Every public API now accepts an optional `PlatformTrustConfig` so a BYOK
consumer can point the middleware at THEIR Supabase trust-events project
without setting the portfolio-wide `PLATFORM_TRUST_*` env vars. Explicit
options take precedence over the env-var fallback.

```ts
// New: explicit config per route
export const POST = withTrust('write', 'bookings', handler, {
  supabaseUrl: process.env.MY_TRUST_SUPABASE_URL,
  serviceKey:  process.env.MY_TRUST_SERVICE_KEY,
  projectId:   process.env.MY_TRUST_PROJECT_ID,
})

// Still works: env-var fallback (legacy shared-infra pattern)
export const POST = withTrust('write', 'bookings', handler)
```

Same option shape now also accepted by:

- `createTrustMiddleware(rules, config?)`
- `trustGate(ctx, config?)`
- `trustLog(ctx, output, duration, config?)`
- `trustMeter(agentId, model, input, output, sessionId?, config?)`

New exports: `PlatformTrustConfig`, `ResolvedPlatformTrustConfig`,
`resolvePlatformTrustConfig()`, `WithTrustOptions`.

### Non-breaking

All existing call sites continue to work unchanged — the new options are
positional-tail and the env-var fallback path is preserved. Internal
plumbing was refactored so per-call configs are honoured, with a small
Supabase-client cache keyed by `(supabaseUrl, serviceKey)` so repeated
calls with the same config don't allocate fresh clients.

### Known residual audit finding

The `PLATFORM_TRUST_SUPABASE_URL` env-var name remains as a fallback for
backward compatibility with the portfolio's shared-trust manifest. The
phone-home audit (`scripts/audit-phone-home.mjs`) flags this env-var name
as a coupling hint and may continue to classify the package as
`NEEDS-REVIEW`. The explicit-option API above is the BYOK-correct path;
the env var is dev/migration-only. Renaming the env var to
`TRUST_SUPABASE_URL` is a follow-up that requires coordinated updates
across the portfolio-manifest and 14+ consumer Vercel projects.

## 0.4.0 — 2026-04-29

### Breaking change: write/delete fail-closed when unconfigured

When `PLATFORM_TRUST_SUPABASE_URL`, `PLATFORM_TRUST_SERVICE_KEY`, or
`PLATFORM_TRUST_PROJECT_ID` env vars are missing:

- **Before (0.3.x):** all operations passed through with a `console.warn`.
  Identified as the top remaining anti-pattern in
  `storefront-mcp/agent-attack.md` (FINDING-02 step 5, FINDING-04 step 2,
  FINDING-05 step 5) and `Connexions/CLAUDE.md`.
- **After (0.4.0):**
  - `read` operations still pass through (warning logged).
  - `write` / `delete` operations are **DENIED**. `trustGate()` returns
    `{ allowed: false, denial_reason: '...' }`. `withTrust()` and
    `createTrustMiddleware()` return `503` with a `missing_env` array.

### Local-dev escape hatch

Set `PLATFORM_TRUST_DEV_OVERRIDE='allow-unconfigured-writes'` to restore
the pre-0.4.0 fail-open behaviour. A loud warning is logged on every gate
call when the override is active. **Never set this var in production.**
Recommend adding a CI check that grep-fails on Vercel/Render env configs
that include the override token.

### Affected exports

- `trustGate()` — fail-closed behaviour
- `withTrust()` — fail-closed behaviour
- `createTrustMiddleware()` — fail-closed behaviour
- `trustLog()`, `trustMeter()`, `checkPermission`, `checkRateLimit`,
  `logAuditEvent`, `meterCall` — unchanged

### Migration

1. Bump consumers: `npm install @caistech/platform-trust-middleware@^0.4.0`
2. Verify all production deployments have the three `PLATFORM_TRUST_*`
   env vars set (Vercel project settings, Render env groups, etc.).
3. If any local-dev workflow relies on the old fail-open contract, add
   `PLATFORM_TRUST_DEV_OVERRIDE=allow-unconfigured-writes` to local
   `.env.local` only.

## 0.3.1

(historical — no changelog)

## 0.3.0

(historical — no changelog)
