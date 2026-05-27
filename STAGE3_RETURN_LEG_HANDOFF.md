# Stage-3 return leg — generalize-for-any-product: handoff

> **Captured 2026-05-27.** The ask was: "the return leg is hardcoded to one pilot
> (`TARGET_SLUG = 'platform-trust-sprint-intake'`) — make it dynamically adjust for the
> product." **Finding: the product-dynamic path already exists.** The hardcoded forwarder is
> legacy pilot code. This doc is the spec + the exact edit, to run in a **Connexions session**
> (it lands in the Connexions repo + its own Supabase/Vercel/tests).

---

## The finding — there are TWO forwarders, and the general one is already live

Connexions has **two** outbound forwarders, fired from different triggers:

| | Legacy (the hardcoded one you flagged) | Methodology (the general one) |
|---|---|---|
| File | `lib/webhooks/intake-completed.ts` | `lib/webhooks/methodology-intake.ts` |
| Fires for | `agents.slug === 'platform-trust-sprint-intake'` **(hardcoded)** | **any** agent with `agent_config.methodology` set |
| Trigger | `/api/interviews/complete` (client-side, **before** transcript exists → empty answers) | `/api/webhooks/elevenlabs` (**after** transcript persists → real signal) |
| Endpoint | fixed `INVESTORPILOT_INTAKE_WEBHOOK_URL` env | per-agent `agent_config.methodology.sync_url` |
| Product identity | none (constant slug) | `cas_card_id` · `cas_product_slug` · `ip_campaign_id` · `campaign_type` (target-user / distributor-candidate) |
| Payload richness | `answers: []` (empty) | per-question signal extracted by Anthropic Sonnet (confirms / contradicts / refines / off-topic / wants-more-info) + summary |

**The general path is fully wired, end to end:**
- `POST /api/methodology/panels` (CAS calls it, `METHODOLOGY_API_KEY` auth) accepts **any** product
  (`cas_product_slug`, `ip_campaign_id`, `campaign_type`, `icp_description`, `questions[]`,
  `sync_url`, `sync_secret`), is **idempotent per `(cas_product_slug, campaign_type)`**, builds a
  per-campaign ElevenLabs agent (audience-aware prompt: end-user vs distributor), binds the
  workspace webhook (correct shape) + allowlist, and stores the `agent_config.methodology` bag.
- `forwardMethodologyIntake` reads that bag, extracts signal, and POSTs to the campaign's own
  `sync_url` — so **every product/stream routes itself.** No hardcoding.

**So "generalize the return leg" is already true** for the methodology path. The `TARGET_SLUG`
forwarder is the pre-methodology pilot, superseded.

---

## The ONE real decision: where does InvestorPilot's partner-update come from?

The two forwarders point at **different receivers**:
- Legacy → **InvestorPilot** `/api/webhooks/connexions-intake` (matches the intake back to an IP
  `partners` row by `ref` — the data the **sales re-engagement, step (k)** needs).
- Methodology → **CAS cockpit** `sync_url` (e.g. `/api/methodology/sync` — the **go/no-go
  evidence**, step (i)/(j)).

So the methodology **evidence** flows per-product already. The only thing still pilot-only is
**IP's partner record getting updated for any product** (so step (k) sales re-engagement works
beyond platform-trust). Pick how that should happen:

- **Option A — Retire the legacy forwarder; CAS relays to IP.** The CAS cockpit, on receiving the
  methodology `sync`, updates the IP campaign/partner itself (CAS already holds `ip_campaign_id`).
  Connexions ends up with **one** forwarder. Cleanest; keeps Connexions out of IP's CRM contract.
- **Option B — Generalize the legacy forwarder.** Drop `TARGET_SLUG`; fire whenever
  `agent_config.methodology` is present; use `methodology.cas_product_slug` as `intake_slug` and
  (optionally) a per-campaign IP URL. Connexions posts to **both** CAS and IP directly. Keeps the
  direct IP partner-match but duplicates routing logic across two forwarders.

**✅ DECIDED 2026-05-27 — Option A.** The methodology path is the system of record for validation;
IP's partner-update is a downstream consequence CAS fans out (it owns `ip_campaign_id`). Connexions
keeps a single, already-general forwarder and is NOT coupled to IP's CRM. Execution brief (paste
into a Connexions session): `CONNEXIONS_SESSION_BRIEF.md`.

> **Sequencing (critical):** retiring the legacy forwarder removes the *only current* IP
> partner-update path for the platform-trust pilot. Ship the CAS-cockpit→IP relay **first** (or
> confirm the pilot no longer needs the direct IP feed), THEN retire legacy — else platform-trust's
> IP CRM linkage breaks during the gap. Also confirm the pilot agent carries an
> `agent_config.methodology` bag; if it does not, `forwardMethodologyIntake` won't cover it and the
> pilot must be migrated to the methodology path before legacy is removed.

---

## Exact edits

### If Option A (recommended) — retire the legacy forwarder
In Connexions:
1. `app/api/interviews/complete/route.ts` — remove the `forwardIntakeCompleted` `waitUntil(...)`
   block (lines ~131–135) and its import (line 9).
2. Delete `lib/webhooks/intake-completed.ts` (+ its test, if any).
3. Leave `INVESTORPILOT_INTAKE_WEBHOOK_URL` env in place until CAS's relay ships, then remove.
In CAS cockpit: on the `/api/methodology/sync` handler, after recording the evidence, relay to IP
to mark the partner interviewed. **Fully specced in `CAS_RELAY_SESSION_BRIEF.md`** (Option A reuses
IP's existing `/api/webhooks/connexions-intake` receiver — match-by-`ref` + dedup already built, so
**zero IP changes**; CAS just becomes a second authorized caller).

### If Option B — generalize the legacy forwarder
In `lib/webhooks/intake-completed.ts`:
- Delete `const TARGET_SLUG = 'platform-trust-sprint-intake'`.
- Replace the agent fetch + `if (agent?.slug !== TARGET_SLUG) return;` (lines ~76–88) with a read
  of `agent_config.methodology`; `return` if absent.
- Set `intake_slug: methodology.cas_product_slug` (was the constant).
- Either keep the single `INVESTORPILOT_INTAKE_WEBHOOK_URL`, or add a per-campaign IP URL to the
  methodology bag and use it as `endpoint`.
- Move the trigger from `/complete` to the post-transcript `/api/webhooks/elevenlabs` path (so
  `answers`/summary aren't empty) — mirror how `forwardMethodologyIntake` is triggered.

---

## Watch-out (either option): possible double-fire on the pilot today
If the platform-trust pilot agent was created via `/api/methodology/panels`, it has **both** a
`platform-trust-sprint-intake` slug **and** an `agent_config.methodology` bag — so **both**
forwarders fire for it right now (legacy → IP empty-answers; methodology → sync_url with signal).
Confirm this in the Connexions session and de-dupe as part of whichever option.

---

## Verify (the proof, run in the Connexions session)
1. Create a panel for a **second** product via `POST /api/methodology/panels` (any non-platform-trust
   `cas_product_slug`), complete a test voice interview.
2. Assert `webhook_deliveries` shows a **succeeded** row to that campaign's `sync_url`.
3. Assert the CAS cockpit (and, per the chosen option, IP) received it for the right product/stream.

## Why a Connexions session (answer to "do now vs Connexions session")
The edit is small, but it lands in the **Connexions repo**, touches its **Supabase/Vercel**, needs
a **real 2nd-product round-trip** to prove, and Option A also needs a **CAS-cockpit** relay change.
That's a deploy+test loop best run with those repos' context. This doc makes it turnkey: pick A/B,
apply the listed edits, run the 3-step verify.
