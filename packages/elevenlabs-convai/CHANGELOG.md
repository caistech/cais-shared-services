# @caistech/elevenlabs-convai — Changelog

## 0.3.0 — 2026-05-24

Full shared voice service — PR2 (front-end). Completes the loop: the package now owns
the front-door widget, not just the server plumbing.

### Added
- **`VoiceWidget`** at the subpath export `@caistech/elevenlabs-convai/react`. Config-driven
  via `VoiceWidgetProps` (placement, mode, overrides, text fallback). Provides its own
  `ConversationProvider`, self-contained responsive styles (full-screen sheet ≤640px, ≥44px
  touch targets), an explanatory header, and accessible controls. Built on
  `@elevenlabs/react` `useConversation` (1.6.x API: `ConversationProvider` + `getId()`).
- **Subpath packaging:** `react` + `@elevenlabs/react` are **optional** peer dependencies and
  the widget ships only from `/react`, so the main entry stays React-free for server-only
  consumers (verified: the main entry loads in Node without React).
- **`VoiceConfigBase`** is now the shared base for `VoiceConfig` (scaffold) and
  `VoiceWidgetProps` (runtime); `VoicePlacement` / `VoiceMode` / `VoiceConnectionStatus` types.
- **Scaffold wizard** `scripts/voice-init.mjs` — 5-question CLI that reads `voice-config.json`,
  emits `voice.config.ts` into a target project, and prints provisioning next-steps. Its pure
  config mapping (`buildVoiceConfig`, `renderVoiceConfigModule`) lives in the package and is
  unit-tested.
- Test suite grows to 56 (added widget-logic + voice-init coverage).

### Notes
- Identity stays server-owned: the widget exposes `onConnect(conversationId)` so the consumer
  binds the conversation to the verified user via a session-init route. The widget never sends
  an identity the agent relays to tools (pairs with the 0.2.0 memory-binding fix).

## 0.2.0 — 2026-05-24

Full shared voice service — PR1 (backend). Reviewed via `/plan-eng-review` + an
independent outside-voice pass; see `VOICE_SERVICE_PLAN.md` for the locked decisions.

### Added
- **`provisionVoiceAgent()`** — idempotent end-to-end provisioning. Keys on a stored
  agent id first, name-search fallback, and **aborts on 2+ name matches** (no guessing).
  Writes the Security allowlist, enables per-session overrides, and binds a
  **workspace-scoped** post-call webhook via `post_call_webhook_id`.
- **`bindWorkspaceWebhook()` / `setAllowlist()` / `setAgentOverrides()` / `setAgentTools()`**
  — provisioning building blocks. `listAgents()` / `findAgentsByName()` for idempotency.
- **`createConvaiWebhookRoutes()`** — Next.js route factory wrapping the pure handlers
  with body parsing, 400/401/500, signature verification, and a `resolveSession` identity
  seam. Includes an `onConversationComplete` product-extension callback (fires once).
- **Anonymous sessions** (`session.ts`) — HMAC-signed ephemeral tokens. No cross-session
  anon memory by design; `convai_anon_sessions` + `purge_expired_anon_sessions()` keep
  anon data short-lived. Anon rows are service-role-only under RLS.
- **`VoiceConfigBase`** shared type — `VoiceConfig` (scaffold) and `VoiceWidgetProps`
  (runtime) both extend it, so they can't drift.
- Full vitest suite (38 tests): provisioning branches, route boundaries, anon-token
  security, and the regressions below.

### Changed / Fixed
- **`createAgent` no longer writes `platform_settings.webhook`** — the deprecated per-agent
  shape that previously cross-bound one product's transcripts to another. Post-call
  delivery is workspace-scoped now.
- **Post-call webhook is retry-safe** — `message_index` is populated on the post-call path
  (was NULL, so the dedup index never fired) and is now `NOT NULL`; messages upsert on
  `(conversation_id, message_index)`. Side-effects (stat increment, `onConversationComplete`)
  fire **exactly once** behind a `processed_at` claim.
- **`total_conversations` counted once** (at post-call), not double-counted at start + end.
- **Memory identity is derived from the conversation binding** — `recall_memory`/`save_memory`
  no longer accept a tool-supplied `user_id` (closed a cross-tenant read/write hole); tools
  send `conversation_id` and the server resolves the bound user.
- **`get_conversation_context` decoupled from conversation status** — memories return
  regardless of whether the last call was `active` or `completed`, and the last conversation
  is found across any status (returning users are remembered again).
- Hot-path composite indexes + `pg_trgm` GIN on `convai_memory.content`.
- Supabase client typed via an optional `@supabase/supabase-js` peer (was `any`).

### Migration
- `migration.sql` is additive + idempotent; an UPGRADES section backfills `message_index`
  and adds the new columns/indexes to existing installs. Apply via `supabase db push` (or
  the SQL editor). No code change required beyond the new exports.

## 0.1.6 — 2026-05-23

### BYOK hygiene — remove residual reference to a CAS-owned host

The `createConversationTools(baseUrl)` factory was already correctly
parameterised — `baseUrl` is a required positional argument and the
package never embedded a hardcoded host in runtime code. However:

- The JSDoc example referenced `https://mova.vercel.app`, a CAS-owned
  Vercel deploy, which the phone-home audit flagged as a coupling hint.
- The README's `createAgent()` example used the same CAS host as the
  webhook URL placeholder.

Both have been replaced with the generic `https://your-app.example.com`
placeholder so the package surface contains no portfolio-specific URLs.

In addition, `createConversationTools()` now throws at call time if
`baseUrl` is missing or empty. TypeScript already enforced the type,
but a runtime guard makes the BYOK contract explicit: the package
ships no default host — the consumer's URL is the only host the
returned tool definitions ever target.

### Migration

No code changes required. Existing callers passing a valid `baseUrl`
work unchanged.
