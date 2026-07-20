# Voice Setup — the canonical activation runbook (read before wiring/activating voice on any product)

> **What this is.** The single, portable runbook for **turning the portfolio voice agent ON** in a
> product — the config + env + provisioning + wiring steps, in order. It sits alongside
> `VOICE_MEMORY_STANDARD.md` (the memory-loop rules) and `PRODUCT_STANDARDS.md` §6 (the placement
> gate): those say *what a good voice agent must do*; this says *how to make it exist and go live*.
>
> **Why it exists.** Voice "absent" is almost never missing code — it's an **un-mounted widget** or
> an **un-provisioned agent**. LaunchReady (2026-07-20) shipped the whole `@caistech/discovery-agent`
> stack but the widget was never rendered *and* the agent was never provisioned, so a naive-tester
> correctly reported "voice absent — a promise the product doesn't keep." This runbook makes both
> failure modes a checklist, not a rediscovery.
>
> **Never fork the voice stack.** Voice = `@caistech/discovery-agent` (config-driven interview) built
> on `@caistech/elevenlabs-convai` (provisioning + webhooks + memory loop + the `DiscoveryWidget`).
> Consume them; never hand-roll a voice route/client (that's the retired-legacy-stack mistake).
>
> **Last updated:** 2026-07-20.

---

## The two failure modes (check BOTH — either one = "voice absent")

1. **Widget not mounted.** The product widget (`DiscoveryWidget`, or a product wrapper like
   LaunchReady's `VoiceIngest`) exists but no page renders it — or it's gated behind an
   `enabled()` flag that's never true. **Fix: render it in the authed flow, gated by the
   activation flag.**
2. **Agent not provisioned.** No ElevenLabs agent id / post-call secret set, so the enable flag is
   correctly `false` and the widget hides. **Fix: run provisioning (below) and set the two env vars.**

A product is only "voice-live" when BOTH are true. Verify with `/voice-auditor` (behavioural — the
widget renders AND the memory loop fires), not just a code grep.

---

## Env-var scheme (canonical)

Two operator-supplied secrets, then two provisioning-extracted values. Per-product prefix (e.g.
`REVERSE_SCOUT_` for LaunchReady) keeps multiple agents in one repo unambiguous.

| Var | Source | Set as |
|---|---|---|
| `ELEVENLABS_API_KEY` | operator (ElevenLabs account) | Vercel **sensitive**, prod+preview |
| `VOICE_SESSION_SECRET` | operator (random 32+ bytes) | Vercel **sensitive**, prod+preview |
| `<PREFIX>_VOICE_AGENT_ID` | **provision() output** | Vercel prod+preview |
| `<PREFIX>_VOICE_POSTCALL_SECRET` | **provision() output** (the webhook HMAC secret) | Vercel **sensitive**, prod+preview |

The post-call secret is **extracted at provisioning — never invented, never a phantom
`ELEVENLABS_WEBHOOK_SECRET`.** HMAC verification happens INSIDE `@caistech/discovery-agent`'s
webhook handlers using this value (do not hand-roll a signature check).

---

## Activation steps (in order)

1. **Consume the packages.** `@caistech/discovery-agent` + `@caistech/elevenlabs-convai` (+ its
   `/react` `DiscoveryWidget`). Define the product's `DiscoveryConfig` (persona + stages + extraction
   schema + `onResult` sink) — see LaunchReady `lib/reverse-scout/voice-discovery.ts`.
2. **Set the two operator secrets** — `ELEVENLABS_API_KEY`, `VOICE_SESSION_SECRET` (self-serve via
   the Vercel env tooling; sensitive; never asked of the operator interactively).
3. **Provision the agent.** Call the product's provision route/`.provision()`
   (LaunchReady: `POST /api/admin/reverse-scout/voice/provision`). It returns `{ agentId,
   webhookSecret }` and binds the post-call webhook to the public deploy URL
   (`/api/convai/webhooks/*`) via `bindWorkspaceWebhook`.
4. **Set the two extracted env vars** — `<PREFIX>_VOICE_AGENT_ID` + `<PREFIX>_VOICE_POSTCALL_SECRET`
   from the provision output — then **redeploy** (env changes only affect new deploys).
5. **Mount the widget** in the authed flow, gated by the enable flag (LaunchReady:
   `voiceCoachEnabled()` → `<VoiceIngest/>` in the new-asset form). **This is the step most often
   missed — a built-but-unrendered widget is the #1 "voice absent" cause.**
6. **Verify behaviourally** with `/voice-auditor`: the launcher renders, connects (or shows the
   no-mic text fallback — degrade-don't-fake), and the memory loop's "welcome-back" recall actually
   fires. Placement audited across BOTH portals for a dual-auth product (§6 / §8.5).

---

## What lives where (single sources)

- **Rules / behaviour:** `VOICE_MEMORY_STANDARD.md` (the recall→distil→persist loop, HMAC, identity
  server-derived at connect, degrade-don't-fake) + `PRODUCT_STANDARDS.md` §6 (placement gate,
  conversation cap + wrap-up warning, proactive/stage-aware).
- **Capability catalogue:** `SHARED_SERVICES.md` → `@caistech/discovery-agent`,
  `@caistech/elevenlabs-convai`.
- **This doc:** the activation *sequence* + env scheme + the two failure modes.

**Gotcha ledger (append as found):**
- 2026-07-20 (LaunchReady) — widget built (`VoiceIngest`) but the `voiceEnabled` prop was never
  consumed by `UserNewAssetForm`, so nothing rendered; agent also never provisioned. Both fixed
  (widget mounted, gated by `voiceCoachEnabled()`); provisioning still needs `ELEVENLABS_API_KEY`.
- Cookie/webhook: the post-call secret is provision-extracted (`<PREFIX>_VOICE_POSTCALL_SECRET`),
  NOT a hand-created `ELEVENLABS_WEBHOOK_SECRET`; verification is in-package.
