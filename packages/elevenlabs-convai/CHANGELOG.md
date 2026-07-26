# @caistech/elevenlabs-convai — Changelog

## 0.10.0 — 2026-07-26

The post-call webhook fails closed. **This is a behaviour change — read the rollout note.**

### Fixed — a live auth hole, documented three times and asserted zero times
`routes.ts` guarded verification with `if (postCallSecret)`, so an unset secret **skipped** the
signature check instead of failing it — the exact opposite of `VOICE_MEMORY_STANDARD`'s
*"unverified → 401"*, in the package that documents the standard.

It matters because `handlePostCallWebhook` binds by `elevenlabs_agent_id` and `conversation_id`
taken from the request **body**, and an agent id is not a credential — it is shipped to the browser.
An unverified payload could therefore write conversation content the agent later recalls and speaks
back as fact. **Memory poisoning, not junk rows.**

Verified live before the fix: BucketLyst answered an unsigned POST with **400** (reached the
parser — unauthenticated); Singify and Kira returned 401 because their secrets happened to be set.
The defect was the *default*, and the next product to miss the one-time capture step inherited it
silently.

### Added
- **`postCallSecret` falls back to `process.env.ELEVENLABS_WEBHOOK_SECRET`.** Order: option → env →
  none. The secret is a one-time credential — ElevenLabs shows it only at webhook creation and masks
  it on every later GET — so a consumer that drops it has no way back. Reading the environment means
  a product is protected by CONFIGURATION rather than by every future caller threading an option
  through.
- **`allowUnsignedPostCall`** — serve unverified only behind a flag someone had to write down, so it
  appears in a diff and in review instead of arising from an unset variable nobody noticed.
- **`probeMemoryLoop({ expectPostCallAuth })`, default ON** — asserts an unsigned POST is refused.
  The cheapest probe in the suite and the only one whose failure is a live write path. Every other
  check can pass while this is broken, which is the same argument that justified the continuity
  check in 0.7.3.

### Where enforcement lives, and why not at construction
The refusal is in the **request handler** (500), not a constructor throw. The factory returns all
six routes whether or not a consumer mounts post-call, so throwing would fail tool-only consumers
who never expose the risky route — and a guard that produces false failures is a guard someone
switches off. Unlike the tool-secret guard, which is genuinely *inert* when unset, an unset
post-call secret now makes the route answer 500 on every request: it is already loud at the point
of risk. CI is what turns "loud when called" into "found before production".

### ⚠️ Rollout
There is **no automated dependency rollout** in this portfolio — no Dependabot, no Renovate, and
`scripts/bump-consumers.sh` is a machine-local script with a stale hardcoded list. A fixed default
reaches nobody until a consumer is bumped by hand. Audited at time of release: Kira, LingoPureAI,
Corporate-AI-Solutions, pipeline and AIFTIS-Demo already fail closed in their own hand-rolled
routes; BucketLyst, singify-platform and SayFix rely on the package default and pass a secret; Mova
was the one fail-open consumer and was fixed directly. **Upgrading is therefore about the next
product, not a live breach.**

## 0.9.0 — 2026-07-26

Makes the tool-webhook guard reachable by CONFIGURATION instead of by a code change.

### ⚠️ This version was published from an uncommitted working tree

`0.9.0` went to the registry — and into 21 production deployments — while `HEAD` sat at
`0.8.0`. The source below existed only on one machine, untracked, for the duration. That is the
same class of failure as the `0.7.2` divergence documented further down, one step worse: there
was no divergent commit to compare against, because there was no commit at all. **Publish from a
committed tree, or the thing running in production has no reviewable source.** Backfilled and
committed 2026-07-26.

### Added
- **`toolSecret` now falls back to `process.env.CONVAI_TOOL_SECRET`.** Resolution order is
  option → env → none. The guard shipped in `0.6.0` and was enabled in **exactly one consumer**;
  every other product had memory endpoints (`recall`/`save`) an anonymous caller could read and
  write, with identity derived from a public agent id that is shipped to the browser. Nothing was
  wrong with the code. Nobody turned it on. An option each consumer must discover and pass is not
  a mechanism — an env var the platform already sets is.
- **`requireToolSecret`** — refuse to construct the routes at all when no secret resolves.
  Defaults to `false` so this release breaks nobody. **Sequencing matters:** agents provisioned
  before the header existed do not send it, so flipping this on before re-provisioning turns every
  memory call into a 401. Re-provision, verify, then set it.
- **A loud one-time `console.error` when no secret resolves.** Unset is still permitted, but no
  longer silent — a guard that is quietly inert is indistinguishable from one that is working,
  which is the property that let this sit unnoticed across the portfolio.

### ⚠️ Still unfixed in this version
The **post-call webhook remains FAIL-OPEN**: `routes.ts` guards verification with
`if (postCallSecret)`, so an unset `ELEVENLABS_WEBHOOK_SECRET` **skips** the signature check
rather than refusing it — against `VOICE_MEMORY_STANDARD`'s explicit *"unverified → 401"*. An
unsigned payload can write conversation content the agent later recalls and speaks back as fact.
Consumers must still fail closed at their own route. See the `SHARED_SERVICES.md` entry.

## 0.8.0 — 2026-07-26

Moves the semantic-memory leg INSIDE the voice loop.

### Added
- **`completeConversationMemory()` runs the Mnemo dual-write inside the canonical post-call
  path**, on the new `@caistech/mnemo` transport client. `DATA_STANDARD` §6 names voice-agent
  memory as Mnemo target #2, so a memory-bearing agent is *supposed* to dual-write distilled
  facts — but the package terminated at the product's own Supabase and left that leg to each
  product to remember. Exactly one product remembered: Kira hand-rolled it, BucketLyst had no
  Mnemo integration at all, and nothing surfaced the difference, because `probeMemoryLoop`
  asserts save→recall→continuity against the product's OWN store and cannot tell a leg is
  missing. A product must now positively opt OUT (omit `semantic`).
- **`scopePrefix`** — explicit, and frozen per product once set: the Mnemo scope id IS the
  memory. Changing it silently orphans everything previously written under the old scope.

### Why the sequence is packaged rather than documented
Its ORDER is a trap: the prior-fact snapshot must be taken **BEFORE** the distil. Taken after,
every fact looks pre-existing and nothing is ever indexed — a silent no-op indistinguishable from
a working integration. A test pins it.

## 0.7.6 — 2026-07-26

*(Backfilled 2026-07-26. `0.7.4` and `0.7.5` were published during this same piece of work and
have no separate record; `0.7.4` is the `agent_id` fix below, which is what the source commit
names. What distinguished `0.7.5` was not written down and is not reconstructable — recorded here
as a gap rather than invented.)*

### Fixed
- **`convai_memory.agent_id` was `NOT NULL`** while the package's own `resolveToolIdentity`
  documents `agentId` as OPTIONAL and deliberately omits it, so recall scopes to the USER and
  survives re-provisioning. Every memory write failed the constraint and **the handler swallowed
  it behind a 200** — green status, nothing stored, for as long as nobody looked in the table.
  Fixed in BOTH the `CREATE TABLE` (new installs) **and §11 UPGRADES** (existing ones). The
  UPGRADES line is the one that matters: fixing only the CREATE leaves every database already on
  the schema still swallowing writes — a fix that doesn't reach the bug that's actually running.
  Guarded by an `information_schema` check, so it is a no-op where already patched.
  Kira prod's `kira_memory.agent_id` was already nullable and was never hit; this was BucketLyst's
  `convai_memory`. Stated specifically, because "we fixed it everywhere" should mean something.

## 0.7.3 — 2026-07-26

Publishes a check that was written, committed, and never shipped.

### ⚠️ Why this release exists at all

`0.7.2` was published to the registry, and then MORE source was committed under the same version
number and never republished. Git's `0.7.2` and the registry's `0.7.2` were different code — the
continuity check below existed only in git. Anyone installing `0.7.2` got a four-check probe and
had no way to know a fifth existed. **A same-version divergence is worse than an unfixed bug: npm
will never resolve it, because nobody reinstalls a version they already have.** Hence 0.7.3.

### Added
- **`probeMemoryLoop` now asserts CONTINUITY** — that a NEW conversation sees the previous one.
  This is the failure a user actually notices: they come back, and the agent greets them as a
  stranger while their memory rows sit in the database. **Every other check can pass while this is
  broken**, because save→recall inside one session says nothing about the next connect. Adds
  `expectContinuity` (default **TRUE**) and `startRoute` (default `'start_conversation'`).

### ⚠️ Behaviour change for existing `probeMemoryLoop` consumers
`expectContinuity` defaults to **true**, so a consumer that does not mount a start route will start
**failing** rather than quietly skipping. That is deliberate — a silently-skipped continuity check
is precisely how this class of bug shipped in the first place — but it means a portfolio-wide
rollout should expect red in repos without a start route, and decide whether to fix the repo or
pass `expectContinuity: false`. Choose before the rollout, not after.

## 0.7.2 — 2026-07-25

*(Backfilled 2026-07-26 — shipped without a changelog entry.)*

### Fixed
- **`ensureUserAgent` now scopes the agent NAME per user itself.** `provisionVoiceAgent` is
  idempotent BY NAME (`findAgentsByName`), so a consumer passing one constant `agentName` — the
  obvious thing to do — is handed user #1's agent for user #2, and the binding insert then dies on
  the unique `elevenlabs_agent_id`. Seen in BucketLyst production: the second buyer's dashboard
  logged `duplicate key value violates unique constraint convai_agents_elevenlabs_agent_id_key`
  and fell back to **no voice agent at all, silently**. The name is now derived inside the package,
  because a rule a consumer has to remember is not a mechanism.

## 0.7.1 — 2026-07-25

*(Backfilled 2026-07-26 — shipped without a changelog entry.)*

### Added
- **`ensureUserAgent()`** — the one-agent-per-user orchestration, made canonical. The primitives
  already existed, but the loop around them (look up the binding → provision if absent → bake
  `?uid=` + secret into the tools → write the `convai_agents` row) was hand-rolled per product, so
  every new memory-bearing product re-forked it. Now one idempotent call, safe on every page load.
  Throws loudly if the agent provisions but the binding row fails, because identity cannot resolve
  without it.

## 0.7.0 — 2026-07-25

The two 0.6.0 follow-ups: a reusable CI guard, and config that actually propagates.

### Added
- **`@caistech/elevenlabs-convai/testing` → `probeMemoryLoop()`** — a reusable CI guard for the
  memory loop. Calls the DEPLOYED webhook routes exactly as ElevenLabs does (body = LLM-filled
  params only; identity via the server-baked `?uid`) and asserts save→recall round-trips, auth is
  enforced (401 on a wrong secret), and identity is isolated (a different uid can't see the fact).
  A direct unit test hides the bug by supplying a conversation id; this can't. Needs only a base URL
  + a test user id; writes one sentinel and cleans it up given a supabase client. Never throws
  (a thrown call becomes a failed check). This is the guard that would have caught the whole
  "memory never worked in a real call" saga on day one.

### Fixed
- **`ensureWorkspaceTools` now UPDATES an existing workspace tool's config** (PATCH on a name+url
  match) instead of reusing it as-is. Previously a changed header (the tool secret), request-body
  schema, or description silently never propagated, so re-provisioning appeared to do nothing and
  consumers needed a manual patch script. Best-effort: a failed PATCH is non-fatal (the existing
  tool is still referenced). Removes the 0.6.0 "known limitation."

## 0.6.0 — 2026-07-25

Memory that works in a REAL voice call — server-baked identity + tool-webhook auth. This closes the
class of bug where an agent calls its memory tools but they always return "Conversation not found",
because ElevenLabs does NOT pass the conversation id to server-tool webhooks (the agent sends only
the LLM-filled params). Proven end-to-end in Kira; promoted here so every consumer is safe.

### Added
- **`createConvaiWebhookRoutes({ resolveToolIdentity })`** — resolve the owner of a recall/save call
  WITHOUT a conversation binding. When you know the owner at provision (one-agent-per-user, uid baked
  into the tool URL), return `{ userId, agentId? }` and recall/save resolve by user directly.
  `recall_memory` / `save_memory` no longer require `conversation_id` in the body when identity
  resolves. Falls back to the conversation binding for legacy callers. `handleRecallMemory` /
  `handleSaveMemory` accept an `identity` override; recall scopes to the whole user when `agentId`
  is null.
- **`createConvaiWebhookRoutes({ toolSecret })` + `createConversationTools(baseUrl, path, { secret })`**
  — tool-webhook auth (fail-closed only when set). Closes the P1 hole where an unauthenticated caller
  could POST recall/save against a victim (identity from a public agent id). Header:
  `x-convai-tool-secret` (exported as `CONVAI_TOOL_SECRET_HEADER`).
- **`createConversationTools(baseUrl, path, { identity: { param?, value } })`** — bakes `?uid=<value>`
  into the start/recall/save tool URLs so the route reads the owner back via `resolveToolIdentity`.

### Why
ElevenLabs server-tool webhooks receive only the LLM-filled parameters — never the real
conversation/agent id. Relying on the agent to supply `conversation_id` fails silently: the model
passes a placeholder ("current"/"default"), the webhook can't bind, and recall/save return
"Conversation not found". A direct-call test hides it because the test supplies the id. The fix is
to derive identity server-side (baked per-agent) instead of from the call payload.

### Backward-compatible
All additions are opt-in. Unset `resolveToolIdentity`/`toolSecret`/`identity` ⇒ exact prior behavior.

### Known limitation
`ensureWorkspaceTools` still matches an existing workspace tool by name+url and reuses it WITHOUT
updating config — so changing a tool's secret/identity requires deleting+recreating the workspace
tool (or a patch script), not just re-provisioning. Tracked for a follow-up.

## 0.4.7 — 2026-06-10

A face for the coach — the standard portfolio voice surface.

### Added
- **`avatarUrl` + `coachName` props on `VoiceWidget`.** When `avatarUrl` is set (a path to an image
  in the consumer's `/public`, e.g. `/female_avatar.jpeg`), the open panel shows a circular avatar +
  the coach's name, and the launcher shows the face instead of the mic emoji. The ring pulses while
  connected ("listening"). People speak more freely to a face than a mic icon — this makes the
  Morgan-style face-coach the one consistent voice surface across the portfolio. Backward-compatible
  (no avatar → unchanged mic-emoji launcher).

## 0.4.6 — 2026-06-09

Proactive greeter for the React widget.

### Added
- **`autoOpen` prop on `VoiceWidget`.** Opens the panel on mount showing the greeting/header
  with a one-tap "start" button — connects (and requests mic) only on that tap. The
  "greets-then-connects" pattern for a proactive greeter on a public page, where `autoConnect`
  (mic-on-load) is too aggressive. Backward-compatible: default behaviour (launcher → open+connect)
  is unchanged; the new pre-connect panel state only appears when the panel is open but no session
  has started yet.

## 0.4.5 — 2026-06-09

Re-provisioning fix: an agent that already had tools could not be re-provisioned.

### Fixed
- **`setAgentTools` re-sent inline `tools` alongside the new `tool_ids`.** It spread the agent's
  current `prompt` (which can carry a vestigial inline `tools` array) and added `tool_ids`, so
  ElevenLabs rejected the PATCH with `400 "Cannot specify both tools and tool IDs"` on every
  re-provision of an agent that already had `tool_ids`. Now strips `tools` + stale `tool_ids` from
  the prompt before writing the new `tool_ids`. Surfaced re-provisioning 11 SayFix per-product
  agents onto gpt-4.1-mini + the memory tools — 10 of them failed until this fix.

## 0.4.0 — 2026-05-25

The tools fix every voice product needs — plus self-verifying provisioning so a
silently-broken agent can never report "fully provisioned" again. Diagnosed live against
Singify (agent had `prompt.tools: []` / `tool_ids: []` despite provisioning "succeeding",
so the memory pull-loop was non-functional).

### Fixed
- **Tools were written in the deprecated inline shape and silently stripped.** `createAgent`
  + `setAgentTools` wrote `conversation_config.agent.tools`, which ElevenLabs no longer
  accepts (~April 2026) — agents ended up with **zero tools**, so recall/save-memory never
  fired. Tools are now created as **workspace tool entities** (`POST /v1/convai/tools`,
  `tool_config` envelope) and referenced by `conversation_config.agent.prompt.tool_ids`.
  Idempotent on **name + url** (not name alone) so one product can't bind another product's
  same-named tool (the cross-product leak class).
- **`bindWorkspaceWebhook` discarded the signing secret.** It returned only `webhookId`; the
  `webhook_secret` (shown once at creation) was dropped, so callers couldn't store it for
  `verifyWebhookSignature`. It now returns `{ webhookId, webhookSecret? }`, and
  `provisionVoiceAgent`'s result carries `webhookSecret`.

### Added
- **`verifyAgentProvisioned()` + a self-verify step in `provisionVoiceAgent`.** After
  provisioning, the LIVE agent is re-read and asserted — `tool_ids` count matches, post-call
  webhook bound, overrides enabled — and **throws** if not. Presence ≠ working: a 200 on every
  PATCH no longer counts as success.
- `ensureWorkspaceTools()` + `toWorkspaceToolConfig()` (+ `WORKSPACE_TOOLS_API`) exports.

### Breaking
- `bindWorkspaceWebhook` now returns `{ webhookId, webhookSecret? }` instead of a bare
  `string`. (provisionVoiceAgent already handles it; update any direct caller.)

### Migration
- **Re-run `provisionVoiceAgent` for every voice agent** — anything provisioned before 0.4.0
  likely has no tools (silent strip). Capture the returned `webhookSecret` into
  `ELEVENLABS_WEBHOOK_SECRET` (sensitive env, per the Vercel rule).

## 0.3.3 — 2026-05-24

The post-call webhook fix every consumer inherits. Both bugs were diagnosed live against
the Connexions methodology agents — agents provisioned by 0.3.2 were created but never
received post-call webhooks, and even an aligned secret returned 401 on verification.

### Fixed
- **`bindWorkspaceWebhook` was binding to the wrong field.** It PATCHed
  `platform_settings.post_call_webhook_id` (top-level), which ElevenLabs **silently ignores**
  — the agent's `post_call_webhook_id` stayed `null`, so no webhook ever fired. The binding
  field is `platform_settings.workspace_overrides.webhooks.post_call_webhook_id`
  (CONFIRMED 2026-05-24 against the live API). Now also sends
  `events: ['transcript'], transcript_format: 'json'` in the same block. Re-run
  `provisionVoiceAgent` (or `bindWorkspaceWebhook`) on any agent provisioned by ≤0.3.2 to
  rebind it correctly.
- **`verifyWebhookSignature` failed on env-stored secrets with stray whitespace.** A trailing
  `\n` (left by `echo secret | vercel env add`) or a proxied header with surrounding
  whitespace produced a silent HMAC mismatch → 401, even when the secret was correct.
  The secret and signature are now `.trim()`-ed before the HMAC compare. Real values have no
  whitespace, so this is safe and removes a class of "the secret is right but it still 401s".

### Upgrade note
A version bump is enough to get both fixes in code, but **already-provisioned agents must be
re-bound**: bump, then call `bindWorkspaceWebhook(apiKey, agentId, { name, url })` (or
re-run `provisionVoiceAgent`) once per existing agent. New agents are bound correctly on
first provision.

## 0.3.2 — 2026-05-24

Upgrade-friendliness for existing 0.1.x consumers.

### Changed
- **`TableNames.anonSessions` is now optional.** Only the anon-session/route layer reads it;
  the core handlers never do. This means a 0.1.x consumer's existing
  `{ agents, conversations, messages, memory }` `TableNames` keeps compiling after upgrading
  — no code edit required for the version bump. (Backward-compatible; no behaviour change.)

### Upgrade note (0.1.x → 0.3.x consumers)
A version bump still requires applying the 0.3.x schema migration to your Supabase project
(the post-call dedup uses a unique index on `(conversation_id, message_index)` and a
`processed_at` column — see `migration.sql`, which is idempotent and backfills existing rows).
The leak fix for an already-provisioned agent requires re-provisioning via `provisionVoiceAgent`
(workspace-scoped webhook), not just the bump.

## 0.3.1 — 2026-05-24

Workspace-webhook API shapes verified against the live ElevenLabs docs and corrected.

### Fixed
- **Workspace webhook create** — endpoint is `POST /v1/workspace/webhooks` (was incorrectly
  under `/v1/convai/...`), and the body is a `{ settings: { auth_type: 'hmac', name,
  webhook_url } }` envelope (was a flat `{ name, url, events }`; `events` is not a create
  param). The 0.3.0 shape would have 4xx'd on a real run.
- **Workspace webhook reuse-match** — list response items use `webhook_url` (not `url`); the
  duplicate-avoidance check now matches on the correct field, so re-provisioning reuses the
  existing webhook instead of creating duplicates.

### Verified correct (no change)
- List-agents pagination (`has_more` / `next_cursor`), allowlist item shape (`{ hostname }`).

### Still runtime-verify (documented in-code, not doc-extractable)
- Exact path of the agent→webhook binding field (`post_call_webhook_id` assumed),
  `platform_settings.auth.allowlist` path, and the override-enablement path. Confirm these on
  the first dev provisioning run (allowlist shows in Security; a real call delivers the
  post-call webhook; a per-session `firstMessage` override takes effect).

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
