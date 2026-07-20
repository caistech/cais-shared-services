# Inbound asks from Kira → cais-shared-services (3 package changes)

**Source:** Kira `fix/voice-memory-canonical-adoption` (PR caistech/Kira#2), 2026-07-20 — reply to
this repo's `HANDOFF.md` (voice-provisioning standardisation). Full context: Kira repo
`HANDOFF_RESPONSE.md`. These three unblock Kira surfaces and/or fix a live security hole; #3 is a
portfolio-wide gap, not Kira-specific.

---

## 1. `@caistech/elevenlabs-convai` — hub `VoiceWidget`: consumer `dynamicVariables` + `signedUrl`

**Why:** `VoiceWidget@0.4.9` only auto-injects `user_id`; there is no way for a consumer to pass
arbitrary ElevenLabs dynamic variables, and no signed-URL connect. This blocks migrating Kira's
live voice surfaces onto the hub widget:
- `/start` (onboarding) needs a `journey_type` **dynamic variable** — dropping it regresses the flow.
- the chat coaching surface connects via a **signed URL** (more controlled than a public `agentId`);
  the widget only supports `agentId`, so migrating would downgrade the connection.

**Ask:**
- Add `dynamicVariables?: Record<string,string>` to `VoiceWidgetProps`, merged into
  `buildStartOptions` alongside the existing `user_id`.
- Add signed-URL connect — a `signedUrl?: string` prop (or `getSignedUrl?: () => Promise<string>`),
  taking precedence over `agentId` when present.

**Acceptance:** a consumer can pass `{journey_type:'business'}` and the agent receives it; a consumer
can connect by signed URL without exposing the `agentId`. Then Kira migrates `/start` + `/chat`.

---

## 2. `@caistech/elevenlabs-convai` — tool webhooks fail OPEN (no auth) **[LIVE SECURITY HOLE]**

**Why:** the conversation/memory **tool** routes (`start_conversation`, `save_message`,
`recall_memory`, `save_memory`, `update_topic`) verify **no** signature/secret — only `postCall`
does. `resolveSession` grants identity from the body's **public** `elevenlabs_agent_id`. An
unauthenticated caller can `start_conversation` bound to a victim's agent, then `recall_memory`
(read the victim's memory) / `save_memory` (poison it). Live in every consumer that uses the
agent-id identity model.

Kira has shipped an **interim** guard (a shared-secret header on its own routes — `toolSecretOk` +
header injection in `kiraMemoryTools`/reprovision), but the durable fix belongs here so every
consumer is safe and Kira can drop the local guard.

**Ask:** require a shared secret on the tool routes, **fail-closed** — same posture as the post-call
HMAC and `mintAnonSessionToken` (throw when the secret is unset; never fail-open). `createConversationTools`
should be able to attach that secret to the tool `webhook.headers` so provisioned agents carry it.

**Acceptance:** a tool POST without the configured secret → 401; an unset secret throws at route
build (no silent fail-open).

---

## 3. `@caistech/corporate-components` — `AuthForm` "confirmation-required" state **[portfolio-wide]**

**Why:** turning `mailer_autoconfirm` **OFF** (the safer default, and what closes an email-link
account-takeover class) breaks login on any product whose signup UX has no post-signup "check your
email" step — the user signs up, isn't logged in, and hits a raw "Email not confirmed". Kira hit
exactly this and had to build the flow locally. Every product that goes autoconfirm-off will
re-discover it.

**Ask:** `AuthForm` handles it natively:
- after `signUp` returns no session → render a **confirmation-pending** panel with a **resend**
  (`supabase.auth.resend({ type:'signup', email })`), instead of attempting login.
- map the **"Email not confirmed"** login error to that same panel.
- confirm the canonical `/auth/callback` covers `type=signup` (verifyOtp).

**Acceptance:** a product with autoconfirm OFF gets a working signup → confirm-email → login flow
from `AuthForm` alone, no per-product code.

**Extraction trigger:** Kira is the **1st** occurrence. Kira's local implementation
(`components/auth/AuthForm.tsx` pending-panel + resend) is the reference; if a 2nd repo needs it,
build it into `AuthForm` per the 2nd-occurrence rule.

---

## 4. `@caistech/sayfix-embed` — report pill needs a vertical offset / z-index below modals

**Why:** the floating "Report a problem" pill overlaps primary actions on nearly every screen
(naive-tester 2026-07-20: drawer Sign-out, `/start` cards, voice Start-a-call + Review, and the
Terms modal's Cancel/Agree — a real mis-tap). The widget only exposes `position: 'bottom-right' |
'bottom-left'` — no vertical offset, and it renders **above** modals. Kira moved it to `bottom-left`
as a stopgap, but a bottom-corner pill still collides with modal action rows.

**Ask:**
- add an `offset?: { bottom?: number; side?: number }` (or `bottomOffset`) so consumers can lift the
  pill above bottom control bars / safe-area;
- ensure the pill's `z-index` sits **below** app modals/dialogs (or hides while a dialog is open),
  so it never covers a modal's action buttons.

**Acceptance:** on a phone, the pill never overlaps a modal's buttons or a full-width bottom CTA.

---

## 5. `@caistech/elevenlabs-convai` — own the `get_conversation_context` recall, don't trust a consumer RPC

**Why:** `handleStartConversation` delegates recall to a **consumer-provided** `get_conversation_context`
RPC (`supabase.rpc('get_conversation_context', …)`), falling back to its own query "no status filter,
matching the RPC." That's an **unstated contract**: the consumer's RPC must NOT filter
`status = 'active'`. Kira's hand-rolled RPC did exactly that — so recall returned `has_history: false`
on every return visit even with completed conversations full of messages (the welcome-back never
fired), on BOTH the chat-page greeting AND the in-call voice recall (both hit the same RPC). It was
silent (the storage≠memory trap). Any product that hand-rolls this RPC can re-introduce it.

**Ask:** the package should **own the recall query** so consumers can't get it wrong:
- ship the canonical `get_conversation_context` SQL as part of the package's migration/schema (so it's
  correct + rich — memories, summary, time-gap — and consistent across products), OR
- drop the RPC dependency and always use the package's built-in query (which is already correct — no
  status filter) for the base case, keeping the RPC purely optional/additive.

**Acceptance:** a consumer that adopts the loop gets a working welcome-back recall with **zero
hand-rolled SQL** — the "finished conversations are `completed`, not `active`" trap is impossible to
hit. *(Kira reference: `20260720600000_fix_welcome_back_recall.sql` — `status IN ('active','completed')`.)*
