# Voice Memory Standard — persistent voice-agent memory & state (the floor)

> Canonical rule set for how a voice agent's **persistent memory and state-access** must
> run, in every voice-bearing product. Companion to `PRODUCT_STANDARDS.md` §6 (which carries
> the condensed gate + a pointer here) and the global CLAUDE.md "VOICE AI STANDARD RULE".
> **This file is the rubric `/voice-auditor` loads** — so the gate and the standard never drift.
>
> **Severity:** auth-pattern severity — a miss is a bug, not a polish item. The spine
> ("storage ≠ memory"; the agent PULLS, the operator never PUSHES) is the part teams get
> wrong; rule 10 (webhook verification) and 13–16 (resilience/observability) are
> security/correctness, not nice-to-haves.
>
> **Last updated:** 2026-05-25.

---

## 0. The spine (read first)

1. **Storage ≠ memory.** A transcript stored on ElevenLabs or in a DB gives **zero**
   continuity until the recall loop is wired. "The data is safe" is never "the agent knows it."
2. **The agent PULLS the user's state; the operator never PUSHES it.** The agent queries its
   memory + the product's domain data on demand. You never read the baseline / history /
   results to the agent via a prompt.

Everything below makes those two real and safe.

## A. The loop exists and runs

1. **Persistent memory loop is mandatory, end-to-end** — `recall-at-start → capture/distil
   mid-call → persist post-call → recall next session`, via `@caistech/elevenlabs-convai`.
   **Scoped by function:** a **coaching** agent (continuity *is* the value) runs the full loop;
   a pure **guide/clarifier** (transient help on one surface) must at minimum *pull* the current
   surface + draft context — cross-session persistence is could-add-value, not required.
2. **Storage ≠ memory** (see §0).

## B. Pull, never push

3. **The agent pulls the user's full state; the operator never reads it in.**
4. **Per-session overrides carry only the *trigger/notice* of the just-happened event**
   ("a take just finished — pull the latest"), **never the authoritative values** — the agent
   still pulls those. One source of truth; "pull never push" stays pure.
5. **Distil-then-recall, not raw replay** — the agent works off distilled memories + structured
   results + summaries, never raw transcript replay (won't fit the context window, won't scale
   to many sessions).
6. **Works off results, not raw artifacts** — expose the *analysis output* (scores, metrics, the
   distilled note), never the raw media / file / long doc. Artifacts are stored for the user to
   replay/read; the agent knows what the analysis *found*.

## C. Two queryable domains

7. **Conversation memory** (who the user is, what was discussed, saved facts) — via the hub's
   generic tools (`get_conversation_context` / `recall_memory` / `save_memory`).
8. **Product-domain data** (the user's product records + results) — via product-domain recall
   tools the build adds using the *same* `tool → webhook → product-handler → product-DB` pattern
   (e.g. Singify `get_baseline` / `get_singing_history`).

## D. Identity, security & privacy

9. **Identity is server-derived; the binding origin is server-side.** The conversation→user
   binding is established **server-side from the authenticated session at connect** (session-init
   reads the cookie); the **client never supplies the identity**. Tools send `conversation_id`,
   never `user_id`.
10. **Every convai webhook verifies its signature** — post-call **and** tool webhooks verify the
    HMAC (`verifyWebhookSignature`, with the `.trim()` fix); the secret is captured at creation
    (shown once), stored as a **sensitive** env (per the Vercel sensitive-env rule), and an
    unverified request is **rejected (401)**. An unverified webhook = anyone with the URL can
    forge transcripts and poison the user's memory.
11. **Three identity tiers — pick the right one; default anon to ephemeral.**
    - **Authed** — `user_id` from the verified session (the normal case). Cross-session memory on.
    - **Ephemeral anon** — a visitor with no account and no consent: the session is single-visit;
      **never tell them the agent remembers them**, and purge on the anon-TTL.
    - **Opt-in-identified anon** *(SayFix's case)* — an anonymous visitor who **explicitly consents**
      to be remembered and provides a recall key (name + email). The consent gate ("Do you want to
      be kept updated about this ticket?" → yes → capture name/email) is what *legitimises*
      cross-visit recall for a non-authed user: bind the consented email to the `convai_anon_session`,
      recall by it on return, and still honour the TTL + see/clear surface (Rule 12). Without the
      explicit opt-in, an anon stays ephemeral. Pre-auth single-user *internal* builds may instead
      key to a **founder-hardcoded `user_id`** so the loop runs in the thin slice without auth.
12. **Memory is owned, deletable, correctable, and retained on a clock** — own-row RLS; memory +
    transcripts **cascade on account deletion** (§4 Settings) and follow a stated **retention/TTL**
    (pairs with the migration's anon-purge); the user can **see and clear** what's remembered (a
    Settings memory surface); the agent can **overwrite a stale fact** ("forget that / actually it's X").

## E. Resilience & observability

13. **Degrade-don't-fake** — on any leg failing (recall miss/error, webhook timeout, ElevenLabs
    error mid-call) the agent behaves as a **first meeting**; it **never fabricates** remembered
    state. An agent that says "last time you…" on a silent recall failure is worse than one that forgets.
14. **Idempotent / exactly-once persist** — dedupe on `(conversation_id, message_index)`; a missed
    webhook is **detectable/recoverable, not silent loss**. (The package implements this via the
    `UNIQUE` index + upsert-on-conflict + `processed_at` gate — don't break it.)
15. **Recall has a first-turn latency budget** — recall completes before the greeting, OR the agent
    **greets generically and enriches** once state lands. Never block the greeting on the round-trip
    (dead air / talking before state loads).
16. **The loop is observable** — each stage emits a trace (recall hit/miss + what was pulled,
    persist success/fail) so amnesia is debuggable.

## F. Where it lives & how it's built

17. **Persistence in the product's OWN Supabase** (`migration.sql`), never a shared hub DB. The hub
    owns the *shape* (tools, tables, widget); the product owns the *values* and injects its own
    service-role `SupabaseClient`. *(Verified against the package: `createConvaiWebhookRoutes({ supabase })`
    takes a product-supplied client; the package holds no internal store.)*
18. **Provisioning correct** — `conversation_config_override` ENABLED at provision; the
    workspace-scoped post-call webhook bound via `bindWorkspaceWebhook` (never the deprecated
    per-agent inline shape); allowlist on every public agent; agent id in `voice.config.ts`, never a
    hand-set `NEXT_PUBLIC_*`.
19. **Consume the hub, never re-implement** — `@caistech/elevenlabs-convai` server + its `/react`
    VoiceWidget; **BYOK** (the user's ElevenLabs key).

### The three-leg wiring recipe (do ALL THREE — building a voice agent? this is the checklist)

A voice agent that only mounts *some* of these has **storage, not memory** (the SafeFix/Morgan
failure: the conversation was stored, but nothing distilled it and nothing recalled it). When a
session builds or audits any voice agent, wire every leg via the hub — never hand-roll:

1. **PERSIST + DISTIL (end of call).** Mount the post-call webhook on `handlePostCallWebhook`, and
   pass an **`onConversationComplete` distiller** (the hub's extension seam) that reads the
   transcript, extracts the salient, durable memories, and writes them via `handleSaveMemory`.
   Without the distiller, `convai_memory` stays **empty** — storage only. Use
   `distillConversationToMemory` (the hub orchestrator: read messages → your `extract` fn →
   idempotent `handleSaveMemory`) so you only supply the per-product extraction. **A bare ack-only
   post-call route is the #1 way this leg is silently skipped.**
2. **RECALL + INJECT (start of call).** Call `handleStartConversation` at connect (binds identity,
   returns `isReturningUser` + context), then `handleRecallMemory`, and **inject the pulled state
   into the agent's opening** — via the session override / `sendContextualUpdate` / `VoiceWidget.onReady`
   — so the agent *speaks from* recall. A "welcome back" banner the agent can't see is **not**
   recall (Rule 15: enrich before/at greeting; degrade-don't-fake on miss, Rule 13).
3. **CAPTURE-AS-YOU-GO (during call) is a *separate* path from memory.** Domain field capture
   (`save_field`-style tools → the product record) is NOT the memory loop; it's product-domain data
   (Rule 8). Both must be reliable: a model that drops tool calls over a long call breaks capture
   (use the hub's `DEFAULT_AGENT_LLM`, and a deterministic end-of-call backstop as the safety net).

If any leg is missing, the agent re-meets the user every time. Morgan is the reference
implementation; SayFix consumes the identical loop with the opt-in-identified-anon tier (Rule 11).

## G. The floor principle

20. **This is the minimum.** Product-specific requirements (Singify's recordings/baseline tools,
    RaiseReady's pitch history, Connexions' interview recall) are **extensions** surfaced during the
    build — they may add rules; they may never drop 1–19.

---

## Open question — BYOK + memory tenancy (resolve before lane-1 distribution)

Rules 11/18 put the agent + workspace webhook + secret in *a* workspace, and rule 19 is BYOK. In
multi-tenant distribution, **whose workspace/key hosts the agent + webhook, and whose Supabase holds
the memory — the distributor's, or each end-user's?** For the single-operator / thin slice the answer
is the **operator's** workspace + Supabase. The per-tenant model **must be resolved per the tenancy
model before lane-1 distribution** — do not silently assume it.

## Worked example — Singify

Pull loop: `get_baseline` + `get_singing_history` alongside the package's 5 memory tools, each
`tool → webhook → handler → singify DB`, identity server-derived. `singify_analyses` persists each
take's metrics + score (the progression history `get_singing_history` reads). Founder-hardcoded
`user_id` pre-auth. The prompt-injection of baseline is **removed** in favour of the pull. Result: the
coach opens *"welcome back — baseline X, last take your chorus pitch was 68, let's beat it"* with zero
state read in.

## Enforcement

`/voice-auditor` loads **this file** as its rubric. The `PRODUCT_STANDARDS.md` §6 gate is
**behavioural, not presence-only**: a live pass must show the loop *working* — the "welcome-back"
recall actually fires and is observable — not merely that the routes/tables exist. Static presence ≠
working memory (the storage≠memory trap, one level up). Backfill: the `/voice-auditor` portfolio sweep
flags non-compliant existing agents → `voice_agent_status` → scheduled remediation.
