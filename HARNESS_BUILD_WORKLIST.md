# Methodology Harness — Next-Build Worklist

> Captured 2026-05-27 from the end-to-end flow review. The Pipeline Gate
> enforcement spine + the methodology cockpit are built and live, but four pieces
> of the *methodology* are not yet enforced by the *harness*: the operator still
> **asserts by hand** what the machine should **prove**. This is the worklist to
> close that gap.
>
> **The principle:** the harness should *prove*, not *trust*. Anywhere the operator
> ticks a box or types a verdict that the methodology says should come from
> evidence/tests, that is a gap.
>
> **Build order is dependency-driven:** the scoring engine (#1) is the keystone —
> it unblocks #2 and feeds #3. Locked with Dennis 2026-05-27.

## Build order
1. **Scoring engine** — keystone (unblocks #2, feeds #3) ← **build first**
2. **Derive `mvp_ready` from the score** (Gate 1)
3. **Evidence-proposed triage / decision** (Gate 0 + Gate 2)
4. **Hybrid pool-discovery + auto two-stream** (Gate 1→2) — *compose* `/office-hours` + existing discovery primitives, do not build bespoke
5. **Agent-readiness #42 wiring** (added 2026-06-09, after the original four) — surface the new `public-web` feature tag + the `/agent-ready` producer so the new rubric check is settable + writable

---

## 1 — Scoring engine  [FIRST / keystone]

- **Current:** rubric DATA is seeded but DISPLAY-ONLY. `cais-shared-services/gate-readiness/criteria.json` (45 checks, tiers + weights), `promise-attributes.json` (per-product "X, not Y" bars), `readiness_seed.sql`; cockpit `readiness_criteria` + `promise_attributes` tables. Nothing computes a card's score.
- **Target:** compute + render a **transparent, explainable, re-scorable** Gate-1 readiness score per card.
- **Logic** (THIN_MVP_RUBRIC v2 §6): conditional applicability → HARD gate (all applicable HARD + CONDITIONAL-HARD pass, else *no score computed*) → TOO-MUCH guard (scale-infra pre-GO = flag) → WEIGHTED composite (High/Med/Low → points) → band **GO ≥6.5 / REDESIGN 5.0–6.4 / NO-GO <5.0**. Render per-check status + source + contribution + "to reach GO, fix X, Y." Re-score on demand.
- **Key design note:** NOT a pure DB function. It **aggregates** (a) automatable probes (title / secrets / env hygiene / responsive / link-live), (b) the recorded naive-tester live PASS, (c) promise-attribute verification (NAIVE / JUDGE / VOICE / AUTO per the verification column). The scorer *reads recorded audit results* — it does not re-run audits.
- **Unblocks:** #2; feeds #3.
- **Locked decisions (2026-05-27):** (A) applicability via **feature flags + enriched `criteria.json`**; (B) **build the per-check results store first** (full granularity day one, no Phase 2).
- **Engine policy LOCKED (2026-05-27) — all 8 knobs ratified** (`SCORING_ENGINE_OPEN_QUESTIONS.md`, folded into `THIN_MVP_RUBRIC.md` §6 "Locked engine policy"): features = hybrid (auto-detect + operator confirm); High3/Med2/Low1 ×10 proportional, bands 6.5/5.0 **provisional**; missing evidence = HARD-fail (no score) / WEIGHTED-fail, never N/A; TOO-MUCH = non-blocking flag; #9 = proportional + load-bearing floor (caps at REDESIGN); source precedence live > judge > auto-probe; re-score on-demand + mark-stale; HARD-gate override needs explicit per-check confirm. **Recalibrate the band arithmetic after the first few live deploys** (Dennis: "we can tweak after we go live deploy a few repos").
- **Foundation DONE this session (cais-shared-services):** `gate-readiness/applicability.json` maps the 19 conditional checks → 6 feature tags (`voice` / `auth` / `supabase` / `third-party-content` / `address-or-abn-fields` / `email`); `extract_workbook.py` now merges `applies_when` into `criteria.json` + the seed + ON CONFLICT; `criteria.json` enriched in place (all 19 tagged). Uncommitted.
- **Next — cockpit build (Corporate-AI-Solutions), in order:**
  1. **Migration** — add `applies_when` to `readiness_criteria`; add `features` (text[]) to `methodology_hypothesis_cards`; new **`readiness_results`** table (`product_slug, deployment_id, check_code, status` pass|fail|na, `source` auto|naive-tester|voice-auditor|judge, `evidence, scored_at`). Re-apply the regenerated seed (now carries `applies_when`) AFTER the column lands.
  2. **`src/lib/methodology/score.ts`** — engine: load criteria + `card.features` + `readiness_results` → applicability filter (N/A where the feature is absent) → HARD gate (all applicable HARD + CONDITIONAL-HARD pass, else no score) → TOO-MUCH flag → WEIGHTED composite (start High=3 / Med=2 / Low=1 → normalize 0–10; calibrate on first run) → band GO ≥6.5 / REDESIGN 5.0–6.4 / NO-GO <5.0.
  3. **`POST /api/methodology/cards/[slug]/score`** — compute + persist a score snapshot.
  4. **Detail-page render** — per-check status / source / contribution + "to reach GO, fix X."
  5. **Wire `/naive-tester` + `/voice-auditor`** to WRITE `readiness_results` per check (the per-check store — decision B).
- **Coupling note:** the seed now emits an `applies_when` column, so the cockpit migration adding that column must land *before* a regenerated seed is applied.

## 2 — Derive `mvp_ready` from the score (kill the tickbox)

- **Current:** manual checkbox in `Corporate-AI-Solutions/src/components/methodology/CockpitControls.tsx` (L155–163); the validate route trusts `card.mvp_ready`. Operator self-asserts Gate 1 — can fire real outreach on an unproven MVP.
- **Target:** remove the checkbox. `mvp_ready` = (HARD gate passed) AND (score ≥ GO band) from #1. Harness-proven, not ticked.
- **Depends on:** #1.

## 3 — Evidence-proposed triage + decision

- **Current:** triage state (Gate 0) and terminal decisions (Gate 2) are 100% manual operator judgment (`CockpitControls` stage / `DecisionControls`). No test defines the triage state; the need-vs-demand verdict is gut.
- **Target:** the validation rollup + the #1 score **propose** the triage / go-no-go state; the operator confirms (human-in-the-loop). The verdict comes from evidence, not gut.
- **Depends on:** #1 + the validation rollup (already built).

## 4 — Hybrid pool-discovery + auto two-stream

- **Current:** operator hand-types ICP + questions per stream (`CockpitControls` `KickoffForm`); ICP is NOT pulled from the idea card's `distributor` / `demand_evidence`; InvestorPilot truncates the ICP to a 180-char raw Brave query; the two streams are launched manually one at a time. No "who could the distributors be?" loop, no evidence validation that a pool is real/reachable.
- **Target (the hybrid):** (1) capture pool hypotheses at ingestion — idea card has `distributor`; **add an end-user-pool field**; (2) LLM gathers supporting/contradicting evidence the pools are real + reachable; (3) LLM rejects weak pools, proposes better-fit ones with rationale — a back-and-forth, not one-shot; (4) agreed pools → LLM-derived ICP + search query → **auto-create BOTH IP streams**.
- **COMPOSITION DECISION (Dennis 2026-05-27): compose, don't build bespoke.**
  - **Dialogue half** = reuse **`/office-hours`** six forcing questions (demand reality / status quo / desperate specificity / narrowest wedge / observation / future-fit — already cover distributor + demand). Promote from ad-hoc to a **mandatory ingestion gate** — which also finally wires the long-stubbed `office-hours` slot in the `pipeline_gates` ledger. Port the question framework into the cockpit flow (operator works in the web app, likely voice-clarifier-driven), not a separate CLI run per idea.
  - **Evidence/search half** = reuse existing discovery primitives (`@caistech/brave-search`, `@caistech/hunter-email`; IP already uses `braveWebSearch` + `findContactByDomain`) pointed at "is this pool real/reachable" *pre-validation*. Replace IP's raw 180-char truncation with an LLM-derived query.
  - **New glue only:** pool-hypothesis fields on the card, the office-hours↔evidence↔operator loop, the validated-ICP handoff, auto-dual-stream creation.
- **Depends on:** nothing hard; can run parallel to #1 but lower priority than the keystone.

## 5 — Agent-readiness check #42 wiring  [added 2026-06-09]

- **Context:** rubric check **#42 — Agent-discoverable** (llms.txt + schema.org/JSON-LD + /.well-known agent manifest) added to the catalogue + cockpit DB on 2026-06-09. **CONDITIONAL-WEIGHTED, weight Med, method AUTO, gated on a NEW feature tag `public-web`** (driven by the Google I/O 2026 agent-web shift; see `PRODUCT_STANDARDS.md` §11). Migration `Corporate-AI-Solutions/supabase/migrations/20260609000000_readiness_criteria_agent_discoverable.sql` is **applied** to ref `tfgtfhwvrswjvkyeyvsp`. Source chain unchanged (workbook → `extract_workbook.py` → `criteria.json` + seed). Catalogue is now **46 checks**; **7 feature tags** (`…/email/public-web`).
- **The scoring ENGINE needs NO change** — `src/lib/methodology/score.ts` + `readiness.ts` are dynamic (applicability = `card.features.includes(c.applies_when)`, no hardcoded count); `readiness_results` accepts any `check_code`; the waiver route validates against the DB. **#42 already scores.**
- **Tasks — so `public-web` can be SET on a card + the producer can WRITE:**
  1. **HIGH** — `src/app/api/methodology/cards/[slug]/route.ts:80` — add `'public-web'` to the `z.enum([...])` (PATCH rejects the tag otherwise).
  2. **HIGH** — `src/components/methodology/CockpitControls.tsx:36` — add `'public-web'` to the `FEATURES` array + a `FEATURE_LABEL` entry (~L37–44), e.g. `'public-web': 'Public web (agent-discoverable)'`. The checkbox UI (`:184–204`) is data-driven, so it auto-renders.
  3. **MED** — `src/lib/methodology/enroll-card.ts:21` — add `"public-web"` to `KNOWN_FEATURES`.
  4. **LOW** — stale "45-check" → "46": `src/lib/methodology/score.ts:3` + `src/app/admin/methodology/readiness/page.tsx:8` (the page heading `:130` is already dynamic `{criteria.length}`).
- **New producer:** the `/agent-ready` skill (spec: `AGENT_READY_SKILL_SPEC.md`) calls `upsertReadinessResult({ productSlug, checkCode: '42', status, source: 'auto', evidence })` and may call `addFeatures(supabase, slug, ['public-web'])` on detection. Locked precedence: a live `/agent-ready` pass > static auto-probe.
- **Depends on:** nothing — the engine already handles #42; this is enum/label surfacing + the producer. Lower priority than the (shipped) #1–4. Full context: memory `project_agent_readiness_42_cockpit_followups` (CAS slug) + `project_agent_readiness_rubric`.

---

## Status

> **Updated 2026-05-27** — verified against the live Corporate-AI-Solutions cockpit code
> (the original "all four NOT STARTED" capture is superseded). A later cockpit session the
> same day finished **#4** and built **#3** (route + UI live on `main`, pending a live data
> run). The rubric/data foundation lives here in `gate-readiness/`; the engine *execution*
> landed in the cockpit repo. **All four builds are now done or built-and-live.**

- **#1 Scoring engine — SHIPPED.** Cockpit migration `20260527000000_readiness_scoring.sql`
  (`readiness_results` table + `applies_when` on `readiness_criteria` + `features[]` on cards),
  `src/lib/methodology/score.ts` (HARD gate → TOO-MUCH flag → WEIGHTED composite → bands),
  `GET /api/methodology/cards/[slug]/score`, and per-check render in `CockpitControls.tsx`.
- **#2 Derive `mvp_ready` — SHIPPED.** The manual checkbox is gone; `mvp_ready` is now a
  read-only harness-derived badge ("set by the harness, not by hand"); the validate route
  enforces the Gate-1 HARD gate via `loadCardScore` / `readiness.ts`.
- **Stage-3 relay (Option A) — SHIPPED.** `src/app/api/methodology/sync/route.ts` fires
  `relayInterviewedToInvestorPilot()` (HMAC + `INVESTORPILOT_INTAKE_WEBHOOK_URL`) after sync.
- **#4 Hybrid pool-discovery — DONE** (per the later 2026-05-27 cockpit session). The
  data layer (`pool-discovery.ts`, `POST .../pools/assess`) + `distributor`/`end_user_pool`
  card fields shipped earlier; the remaining **Phase-1 `/office-hours` ingestion dialogue
  half is now wired**, completing the build. See `BUILD4_POOL_DISCOVERY_BRIEF.md`.
- **#3 Evidence-proposed triage / decision — BUILT + LIVE on `main`** (route + UI shipped;
  pending a live data run). A `propose` capability — **Gate-0 desk pass always; Gate-2
  evidence pass when interviews exist** — plus a "Propose decision" button in
  `DecisionControls` that renders the §5 breakdown, highlights the recommended decision, and
  pre-fills the reason; the operator still confirms (human-in-the-loop). Verified: `tsc`
  clean, 52/52 methodology tests pass. **Remaining:** live verification — the Gate-2
  (evidence) proposal only yields real verdicts once a two-stream voice interview completes;
  the Gate-0 (desk-hypothesis) proposal works today.

- **#5 Agent-readiness #42 wiring — NOT STARTED (added 2026-06-09).** The engine already
  auto-scores #42 (dynamic); remaining = surface `public-web` in 3 hardcoded enums (cards API
  `route.ts:80` z.enum · `CockpitControls.tsx:36` FEATURES · `enroll-card.ts:21` KNOWN_FEATURES),
  stale "45-check" → 46, and the `/agent-ready` producer. Low priority; no dependencies.

The spine + cockpit they build on are live — see project memory `pipeline-gate-live`
(SayFix slug) + `methodology-intake-gate-live`.
