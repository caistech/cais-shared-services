# CAS cockpit session brief — methodology-sync → InvestorPilot partner relay (Option A)

> Paste the block below into a fresh Claude Code session opened in the **Corporate-AI-Solutions**
> repo (`C:\Users\denni\PycharmProjects\Corporate-AI-Solutions`). This is the relay that replaces
> the legacy Connexions→IP direct feed (Option A). **It must ship BEFORE the Connexions session
> retires the legacy forwarder** (`CONNEXIONS_SESSION_BRIEF.md`) — else the platform-trust pilot's
> IP partner-update has a gap. Decision context: `STAGE3_RETURN_LEG_HANDOFF.md`. Locked 2026-05-27.

---

You are working in the **Corporate-AI-Solutions** cockpit repo (`src/app`). Add a relay so that
after the methodology-sync handler records an interview's evidence, it marks the corresponding
InvestorPilot partner as interviewed — the relay that replaces the now-retired legacy
Connexions→IP direct feed. Read each file fully before editing.

**The key fact (verified 2026-05-27): InvestorPilot needs ZERO changes.** IP's existing receiver
`src/app/api/webhooks/connexions-intake/route.ts` already does the whole "mark interviewed" job:
HMAC-auth (`CONNEXIONS_INTAKE_WEBHOOK_SECRET`), resolve `ref` (partner UUID) → `partners` row
(email fallback), insert `intake_responses`, backfill `partners.contact_linkedin`, write an
`audit_events` row, and **dedup on `external_intake_id` (UNIQUE)**. The relay simply makes CAS a
second authorized caller of that endpoint — same contract, new origin.

**Where:** `src/app/api/methodology/sync/route.ts`. Today it records evidence end-to-end
(campaign lookup → `methodology_responses` insert → classify → `rollupHypothesisRows` → card
status) and **never touches IP**. Add the relay at the tail, on the **`isConnexions` branch only**
(the mock path has no `ref`/interview to relay).

**Do this:**

1. **After the rollup + card-status update, before returning the 201**, fire a relay to IP. Map the
   parsed Connexions methodology payload → IP's `IntakePayload` shape:
   - `intake_id` ← `parsed.data.intake_id`  *(the dedup key — keep identical so cutover double-fires can't double-count)*
   - `ref` ← `parsed.data.ref`  *(the IP partner UUID — the whole point; pass it through)*
   - `src` ← `parsed.data.src`
   - `intake_slug` ← `parsed.data.cas_product_slug`
   - `completed_at` ← `parsed.data.completed_at`
   - `prospect` ← `{ name, email, company, linkedin_url }` from `parsed.data.prospect`
   - `summary` ← `parsed.data.extraction?.summary`
   - `answers` ← `[]`  *(v1 — IP's post-interview view lives on CAS/Connexions; matches legacy)*
   - `duration_seconds` ← `parsed.data.duration_seconds`
2. **Sign + POST:** HMAC-SHA256 the JSON body with `CONNEXIONS_INTAKE_WEBHOOK_SECRET`, header
   `X-Connexions-Signature: sha256=<hex>`, POST to `INVESTORPILOT_INTAKE_WEBHOOK_URL`. (Mirror the
   sign/headers IP's receiver expects — see its `verifySignature`.)
3. **Non-blocking + safe:** wrap in try/catch; do NOT fail the sync 201 if the relay fails (the
   methodology evidence is the priority). Use `waitUntil` (`@vercel/functions`) if available so the
   relay runs after the response; otherwise an awaited try/catch with a logged failure is fine.
   Log success/failure; an IP 401 = secret mismatch, an IP 200 `deduplicated:true` = already had it.
4. **Skip the relay** if `INVESTORPILOT_INTAKE_WEBHOOK_URL` / `CONNEXIONS_INTAKE_WEBHOOK_SECRET`
   are unset (log "relay skipped: env missing"), so dev/test still works — mirror how IP's own
   forwarders degrade.

**Env to add on the CAS cockpit Vercel (sensitive, production+preview):**
- `INVESTORPILOT_INTAKE_WEBHOOK_URL` = IP's receiver, `https://<ip-prod>/api/webhooks/connexions-intake`
- `CONNEXIONS_INTAKE_WEBHOOK_SECRET` = the SAME shared secret IP's receiver verifies (copy the
  value from Connexions' Vercel / `.env`; do not invent a new one — it must match IP).
  *(`CAS_METHODOLOGY_WEBHOOK_SECRET` — the inbound-from-Connexions secret — is separate and already set.)*

**No schema changes** on either side. **No IP changes.**

**Cutover safety:** during the window where both the legacy Connexions forwarder and this relay
exist, both POST to IP for the same interview — IP dedups on `external_intake_id = intake_id`, so
no double-count. (The earlier legacy *empty-answers* row wins the dedup and shadows the richer relay
summary, so retire the legacy forwarder promptly per the Connexions brief.)

**Verify end-to-end:** run a methodology interview for a 2nd product (panel created via Connexions'
`POST /api/methodology/panels`) → confirm CAS sync records the evidence (`methodology_responses` +
card rollup) AND IP shows a new `intake_responses` row matched to the right partner by `ref`, plus
an IP `audit_events` `intake.received`. Then signal the Connexions session it's safe to retire legacy.

**Guardrails:** surgical edit to the one handler; read it fully first; this repo has auth, so if you
save a memory, run the auth smoke-test per the global rule. Report the diff, the env you set, and the
2nd-product round-trip evidence.
