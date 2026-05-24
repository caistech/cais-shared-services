# Voice Service Plan — `@caistech/elevenlabs-convai` v1

Status: **SHIPPED in v0.3.3** (eng review CLEARED 2026-05-24; PR1 backend + PR2 react widget + scaffold wizard landed). Retained as the design record.
Reviewed via `/plan-eng-review` + independent Claude subagent (outside voice).

> **Note (2026-05-25):** the `@caistech → @mmcbuild` rename referenced below (decision 17C + deferred TODO 1) is **CANCELLED** — `@caistech` is the canonical scope per global CLAUDE.md. Treat those rename items as historical; do not action them.

---

## Problem

The package ships server-only today (agent CRUD, webhook handlers, conversation
tools, `migration.sql` with `convai_agents/_conversations/_messages/_memory` +
`get_conversation_context` RPC + RLS, an unimplemented `VoiceWidgetProps`). It
implements the "Kira model": user talks to an ElevenLabs ConvAI agent → mid-call
webhook tools + post-call webhook write to Supabase → context read back at the next
call's start for persistent cross-session memory. Consumed by ~17 portfolio products.
BYOK (each product supplies its own ElevenLabs key; only the agent ID reaches the
browser).

Goal: build it into the full shared voice service — automated provisioning, drop-in
webhook routes, the missing front-end widget, and a scaffold wizard — so a new product
gets a working voice agent end-to-end from one onboarding ritual.

## Shape

One plan, two sequenced PRs:
- **PR1 (backend):** provisioning + webhook routes + schema changes + full tests.
  Validated on mmcbuild before PR2.
- **PR2 (front-end):** `VoiceWidget` React component (subpath export) + scaffold wizard.

**Prerequisite (blocks PR1):** author `cais-shared-services/voice-config.json` —
canonical persona (voice ID, model, opening style, signature line). `provisionVoiceAgent`
needs it at provision time, so it is a dependency of BOTH PRs.

## Ownership boundary

Hub owns the SHAPE: the 4 core conversation tables, the `VoiceWidget` component, the
`VoiceConfigBase` type, the provisioning logic. Product owns the VALUES: its config,
its domain extension table. Product-specific data is handled via an
`onConversationComplete(conversation, supabase)` callback — the hub never knows about
product domain tables. The `tableNames` override is legacy-compat only (Kira's
`kira_*`); new products always use `convai_*`.

---

## Locked decisions

| # | Decision |
|---|---|
| 1A | New `bindWorkspaceWebhook()` (workspace-scoped create-then-bind via `post_call_webhook_id`); STRIP the post-call `platform_settings.webhook` block from `createAgent`. Tool webhooks stay per-agent-inline (correct — they target the consumer's own baseUrl, not the leak vector). |
| 2A | Idempotency: check stored `elevenlabs_agent_id` first; name-search fallback that ABORTS on 2+ matches (no silent pick, no duplicates). |
| 13A | (supersedes 7A) Populate `message_index` in the post-call insert + make column `NOT NULL`, then `UNIQUE(conversation_id, message_index)` + upsert onConflict-ignore. Without this the dedup index never fires (NULLs are distinct in Postgres). |
| 14A | Decouple memory lookup from conversation status in `get_conversation_context`; find the last conversation across any status. (Current `status='active'` filter hides completed calls AND their memories — defeats the core feature.) |
| 15A | Drop `user_id` from the recall/save tool parameters; derive it from the conversation binding (set at `handleStartConversation` against the verified session). Closes a cross-tenant memory read/write hole on the authed path. Requires changing the tool signatures to send `conversation_id`. |
| 16B | NO anon persistence. Anon session token is ephemeral (not stored client-side); anon `conversation`/`message`/`memory` rows purged at call end / short TTL. Anon works live; cross-session memory is authed-only. Collapses the PII/storage/compliance surface. |
| 3A | Server-minted HMAC-signed session token for identity (ephemeral for anon per 16B). Anon `convai_*` rows are service-role-only (no client SELECT); authed rows keep `auth.uid()` RLS. |
| 11A | Composite hot-path indexes: `convai_conversations(agent_id,user_id,status,last_message_at DESC)`, `convai_messages(conversation_id,timestamp DESC)`, `convai_memory(agent_id,user_id,active,importance DESC)`. |
| 12A | `pg_trgm` GIN index on `convai_memory.content`; keep the ILIKE recall query. |
| 9B | Add `@supabase/supabase-js` as an OPTIONAL peer dep; type-only import of `SupabaseClient` to type the handler data path (replace `any`). |
| 4A | `VoiceWidget` at subpath export `@caistech/elevenlabs-convai/react`; `react` + `@elevenlabs/react` as OPTIONAL peer deps (`peerDependenciesMeta.optional`). Main entry stays React-free so server consumers are untouched. |
| 8A | Extract `VoiceConfigBase` (shared fields). `VoiceConfig` = base + scaffold-only fields; `VoiceWidgetProps` = base + runtime-only fields (userId, sessionId, callbacks, clientTools). |
| 5A | Scaffold wizard lives in `cais-shared-services/scripts/` (alongside `onboard-new-project.sh`), imports the hub's provisioning functions. Runtime package stays runtime-only. |
| 17C | (supersedes 6C) Publish under the single `@caistech` scope for these PRs; do the `@mmcbuild` rename as a clean hard-cut afterward (no dual-publish overlap window). Removes version-skew risk on the webhook layer. |
| 10A | Full vitest coverage: every provisioning branch (incl. 2+-match abort, API failures) with mocked fetch, all route error paths, anon-token mint/resolve/reject security paths, the 4 mandatory regressions, plus a supabase-backed RLS integration test. |

### Folded corrections (from outside voice / code-quality minors)
- Move the `total_conversations` increment behind the `processed_at` flag so it fires once (currently double-counted in `handleStartConversation:124` + `handlePostCallWebhook:446`).
- Add a re-provision step to PATCH the ~17 existing live agents off the old per-agent webhook block (1A migration gap).
- Enable `conversation_config_override` flags in `provisionVoiceAgent` so `VoiceWidget` per-session prompt/firstMessage overrides don't silently no-op (the clarifier use-case).
- Reconcile duplicated webhook-URL derivation (`agent-client.ts:78-82` vs `conversation-tools.ts:39`); make fire-and-forget stat updates log explicitly instead of swallowing errors.

---

## Data flow (after changes)

```
                    ElevenLabs ConvAI agent
                    (conversation_config_override ENABLED at provision time)
        mid-call tools │            ▲ context at call start
   (send conversation_id,│          │ (memories decoupled from conversation status)
    NOT user_id)        ▼           │
        createConvaiWebhookRoutes({ supabase, tableNames, onConversationComplete })
                    │  user_id derived from the conversation binding (verified session)
                    ▼
   convai_agents / _conversations / _messages (message_index NOT NULL, UNIQUE)
   / _memory   + ephemeral anon sessions (purged)   + composite + pg_trgm indexes
                    │
                    └─ onConversationComplete(conversation, supabase)  ← fires once via processed_at
                       (product writes its own domain table; hub never knows about it)
```

## Failure modes (new/changed paths)

| Path | Realistic failure | Test | Error handling | Visibility |
|---|---|---|---|---|
| `provisionVoiceAgent` | EL API 5xx mid-provision | ✅ 10A | retry/abort + surface | operator-visible |
| `bindWorkspaceWebhook` | bound to wrong workspace webhook | ✅ regression | derive + verify id | — |
| post-call retry | duplicate transcript | ✅ regression (13A) | unique + upsert | — |
| `onConversationComplete` | product callback throws | ✅ 10A | isolated try/catch; core writes commit | logged |
| anon token | forged / expired | ✅ security 10A | reject | 401 |
| context RPC | returning user reads as new | ✅ regression (14A) | status-decoupled | — |
| recall/save | agent names another `user_id` | ✅ security (15A) | derived; param removed | — |

No critical gaps: every new path has a test + error handling + a visible-or-logged outcome.

## Parallelization

```
Lane A (PR1 schema):  migration.sql (anon, indexes, message_index NOT NULL, processed_at)
Lane B (PR1 server):  provision.ts + bindWorkspaceWebhook + agent-client strip + routes.ts
                      ↳ depends on Lane A (handlers read new columns)
Lane C (PR1 tests):   vitest harness — scaffold in parallel, asserts after A+B
Lane D (PR2):         react/ subpath + VoiceConfigBase + wizard — waits on PR1 merge + voice-config.json

Order: A → B (sequential, shared schema contract). C scaffolds alongside.
       D is a separate PR after PR1 validates on mmcbuild.
```

## NOT in scope (deferred)

- Cross-session anon memory (dropped per 16B — privacy/storage liability without validated demand).
- Long-lived consent + data-retention machinery (`@caistech/security`) — only needed if anon persistence returns.
- Avatar-voice layer (CLAUDE.md future; package extends by version bump).
- Per-user usage metering / team-admin Usage breakdown (`@caistech/usage-meters`).
- PR2 wizard runtime UI (wizard is scaffold-time CLI only).

## Deferred TODOs (see repo-root TODOS.md)
1. `@caistech → @mmcbuild` hard-cut migration (after voice PRs stable).
2. Per-session rate limiting on the anon webhook/connect path (`@caistech/platform-trust-middleware`).

## Outside-voice findings (the second opinion that paid off)
1. **[CRITICAL]** message_index NULL on post-call path → dedup index never fires → fixed by 13A.
2. `total_conversations` double-counted → folded correction.
3. Context RPC `status='active'` filter defeats persistent memory → fixed by 14A.
4. Anon-session coherence (persistence mechanism) → resolved by 16B (no persistence).
5. `createAgent` webhook strip leaves ~17 live agents un-migrated → re-provision step folded.
6. Override flags not enabled → widget overrides no-op → folded correction.
7. `voice-config.json` is a PR1 prerequisite too → reflected above.
8. **[SECURITY]** tool-supplied `user_id` cross-tenant hole → fixed by 15A.
9. Dual-publish skew risk → resolved by 17C (single scope + later hard-cut).
10. Generalizing before proving one consumer → mitigated by sequencing + PR1-validates-on-mmcbuild.
