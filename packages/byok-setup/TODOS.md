# @caistech/byok-setup — Deferred backlog

Captured from `/plan-eng-review` (2026-05-24, scope C). v0.1 ships the core + CLI +
env-file/vercel adapters. The following are intentionally deferred.

## 1. React `<ByokSetupWizard>` web component
The "one page, paste, submit" UX. **Reuses the exported core** (validate / secrets /
adapters) — no re-implementation. Renders the manifest grouped by `provider`, two-pass
by `phase`.
- Why deferred: prove the schema on the CLI + one real consumer first.
- Depends on: nothing — the core is ready.

## 2. Supabase config adapter
Configure Supabase Auth redirect URLs + SMTP from the manifest (the `supabase`
destination). Pattern to reuse: RaiseReadyTemplate `configure-supabase-auth` route.
- Why deferred: most products' Supabase need is just env vars, already covered by
  env-file/vercel.

## 3. feature-preflight.mjs convergence onto the unified schema
Rewire the portfolio preflight checker to read `byok.config.json`.
- **Blocked on: SEMANTIC regression tests** across all ~16 product manifests —
  `exclusiveGroup` redefines `required`, so a parse-only test is insufficient
  (D4 of the 2026-05-24 review). Do this in its OWN PR, not bundled.

## 4. Portfolio rollout
Author a `byok.config.json` per product (preflight + mmc-application done). Then each
product consumes `@caistech/byok-setup`.

## Smaller follow-ups
- Optional **live-ping** key validation per provider (regex proves shape, not validity —
  see SCHEMA finding 4).
- **CI publish pipeline** for the package (currently published manually).
