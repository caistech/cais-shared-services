# Connexions session brief — retire the legacy return-leg forwarder (Option A)

> Paste the block below into a fresh Claude Code session opened in the **Connexions** repo
> (`C:\Users\denni\PycharmProjects\Connexions`). Decision context: `STAGE3_RETURN_LEG_HANDOFF.md`
> (cais-shared-services). Locked 2026-05-27.

---

You are working in the **Connexions** repo (`C:\Users\denni\PycharmProjects\Connexions`). This is a scoped change to the methodology research-loop "return leg." Read each file fully before editing; this repo has an auth flow and its own Supabase + Vercel.

**Context — there are two outbound forwarders that fire when an interview completes:**
- `lib/webhooks/methodology-intake.ts` → `forwardMethodologyIntake` — the **GENERAL** path. Fires for any agent whose `agent_config.methodology` bag is set; extracts per-question signal via Anthropic Sonnet; POSTs to that agent's own `sync_url`. Triggered **post-transcript** from `app/api/webhooks/elevenlabs/route.ts`. Panels are created by `POST /api/methodology/panels` (which writes the `methodology` bag).
- `lib/webhooks/intake-completed.ts` → `forwardIntakeCompleted` — **LEGACY pilot.** Hardcoded `const TARGET_SLUG = 'platform-trust-sprint-intake'`; posts an empty-`answers` payload to a fixed `INVESTORPILOT_INTAKE_WEBHOOK_URL`. Triggered from `app/api/interviews/complete/route.ts` (client-side, *before* the transcript exists).

**Decision (locked — Option A):** retire the legacy `forwardIntakeCompleted`. The methodology path is the system of record; InvestorPilot's partner-update will be relayed by the CAS cockpit (which owns `ip_campaign_id`). Connexions keeps ONE general forwarder and is not coupled to IP's CRM.

**Do this, in order:**

**0. Safety checks BEFORE removing anything — report results, do not skip:**
   a. Grep all references to `forwardIntakeCompleted` and `INVESTORPILOT_INTAKE_WEBHOOK_URL`. Confirm the only caller is `app/api/interviews/complete/route.ts`.
   b. **Confirm the platform-trust pilot is covered by the general path.** Query `agents` for the `platform-trust-sprint-intake` agent — does its `agent_config` contain a `methodology` bag?
      - **YES** → `forwardMethodologyIntake` already handles it (legacy is a redundant double-fire today); safe to retire.
      - **NO** → retiring legacy leaves the pilot with NO forward. **STOP and report.** The pilot must first be migrated to the methodology path (give its agent a `methodology` bag with the CAS `sync_url`) or legacy kept until that's done. Never silently drop the pilot's feed.
   c. **Confirm the CAS→IP relay is live or sequenced.** Option A moves IP's partner-update to the CAS cockpit. If that relay isn't live, retiring legacy creates a gap in the pilot's IP CRM linkage. Confirm it ships in the same window, or note the gap explicitly for Dennis.

**1. Retire the forwarder (only once step 0 passes):**
   - `app/api/interviews/complete/route.ts`: remove the `forwardIntakeCompleted` `waitUntil(...)` block (~L131–135) and its import (~L9).
   - Delete `lib/webhooks/intake-completed.ts` and its test (if any under `test/`).
   - Keep `lib/webhooks/sign.ts` (shared by the methodology forwarder).
   - Leave `INVESTORPILOT_INTAKE_WEBHOOK_URL` in Vercel until the CAS relay is confirmed, then remove it from Dev/Preview/Prod.

**2. Verify the general path is intact:** run the repo's test suite + typecheck; confirm `forwardMethodologyIntake` still triggers from `app/api/webhooks/elevenlabs/route.ts`.

**3. Prove it end-to-end:** create a panel for a SECOND product via `POST /api/methodology/panels` (any non-platform-trust `cas_product_slug`), complete a test voice interview, then assert `webhook_deliveries` shows a **succeeded** row to that campaign's `sync_url` and the CAS cockpit received it for the right product + `campaign_type`.

**4. Deploy** to Connexions Vercel; confirm the prod build is green.

**Guardrails:** surgical edits only; don't touch unrelated code; if you save a memory at the end, run the auth smoke-test (this repo has auth) per the global rule. Report what changed, the step-0 results (esp. 0b/0c), and the 2nd-product round-trip evidence.

**Separate task (Corporate-AI-Solutions repo — NOT this session):** the CAS cockpit `/api/methodology/sync` handler relays the partner-update to InvestorPilot (the replacement for the legacy direct feed). **Now specced: `CAS_RELAY_SESSION_BRIEF.md`** (Option A — reuses IP's existing `/api/webhooks/connexions-intake` receiver, zero IP changes). That relay must be **LIVE before** you retire the legacy forwarder here (step 0c) — confirm it shipped, or report the gap.
