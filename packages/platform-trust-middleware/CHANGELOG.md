# @caistech/platform-trust-middleware — Changelog

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
