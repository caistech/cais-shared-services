# PRODUCT FACTORY — CANONICAL METHODOLOGY

**Status:** Source of truth. This document **supersedes `TARGET_STATE.md` and `AS_BUILT.md`** and reconciles them into one.
**Drives:** the UI pipeline cards. The cards mirror the operational gate order and recertify loops defined here, top to bottom. If this doc and the cards disagree, this doc is right and the cards are a bug.
**Honesty rule:** this is a work in progress. Every stage is marked **HAVE** (in code, live now) and **NEED** (gap to build). Do not read an unmarked feature as built.

---

## 0. Front-of-house — navigation & information architecture

This is the operator's path *into* the factory, and the routes the UI implements. The methodology (§1–§7) is what happens *inside* a product; this section is how an operator gets to it.

### Route map

```
/admin                         Dashboard — cards, one per control surface
   ├─ Methodology   /admin/methodology       renders THIS document (live source of truth)
   ├─ Pipeline      /admin/pipeline          PORTFOLIO: every product by state
   │     ├─ [+ New Product] → /admin/pipeline/new-ideas    ONBOARDING (Stage 1 office-hours intake)
   │     └─ click a product → /admin/pipeline/[slug]       PROCESSING (per-product card, Stages 1→6)
   ├─ Ops           /admin/ops               Stage 7 surface (future)
   ├─ Reviews       /admin/reviews
   └─ Settings      /admin/settings
```

### The state model — "new idea" and "pipeline product" are ONE row at two states

There is no separate idea store. A new idea **is** a product in the existing `product_validation_status` table, sitting at the survey's own **INCOMPLETE-SPEC** state (fewer than 14 fields populated). Onboarding writes the 14 fields; the same row then flips to "in pipeline." Nothing is duplicated.

| State | Meaning | Where it shows | Verdict/gate |
|---|---|---|---|
| **Idea / not-started** | row exists, <14 fields | `/new-ideas` (filtered view) | INCOMPLETE-SPEC |
| **In-progress** | spec complete, walking the gates | `/pipeline` + its `/[slug]` card | survey/certify/score in flight |
| **Completed** | GO issued, handed to outreach | `/pipeline` | `pipeline_gates` PASS |

So `/new-ideas` is a **filtered view** (state = idea) of the same table the pipeline reads, and the onboarding intake **seeds** `/[slug]` — the 14 fields it produces are exactly the Spec at the top of the Processing card. Idea → product is a state transition on one record, driven by the INCOMPLETE-SPEC → (spec complete) gate.

### Onboarding = Stage 1, made concrete

The office-hours intake (`/new-ideas`) is the **feasibility gate + spec capture** that §4 Stage 1 marks NEED. "What is the idea? why? why now? who?" — an idea repository that, on passing the interrogation, populates the 14 validation fields and admits the product to the pipeline. This resolves the Stage-1/2 split: **ideation lives off-card on the onboarding page; the Processing card starts at the seeded Spec, not a blank ideate step.**

### Naming & route rules (locked)

- **`/admin/pipeline/[slug]` is the product's permanent home.** Title the *page* "Processing" (literal to what it does — the product is being processed across all stages). **Do not rename the URL to `/processing`.** Bookmarks, the InvestorPilot login link, and recorded gate refs key off the slug path — stable external IDs matter (same class as the webhook-UUID lesson).
- **Fold `/admin/pipeline/factory` into `/admin/pipeline`.** Today `/factory` is a mishmash whose primary job — "where is every product in the process" — is the portfolio view. One portfolio surface, not two.
- **`/admin/methodology` renders this document.** It is currently a "Phase 3+ not implemented" stub; wiring it to this doc puts the canonical source of truth live, next to the pipeline it governs, so it stops being a file that drifts.

### Scaffolding order

Build the front-of-house shell first, then move into the §1–§7 process: **Dashboard → New Ideas (onboarding) → Pipeline (portfolio, factory folded in) → Processing (`/[slug]`, page titled, URL unchanged).** Once that scaffolding is in place, the per-product card is built out to mirror §6.

---

## 1. The model — a product is built like a house

A product idea is dropped in at the top; the factory walks it through a 7-stage house-building lifecycle and **refuses to let it out the gate until the standards are actually met** — and when it refuses, it says in plain language *what* is wrong, *who* fixes it, and *where* the fix stands. **Hard, but legible.**

The 7-stage conceptual spine (kept from the original design):

| Stage | House analogy | What it is |
|---|---|---|
| 1 · Pre-development | vision → soil test → permit | ideate, feasibility, the spec |
| 2 · Design & Planning | architect's plans | architectural decisions, product-type classification |
| 3 · Compliance & Standards | NCC / assessors | the rules a build must meet |
| 4 · Construction | builder builds | implementation |
| 5 · Certification & Sign-off | certifier inspects | trade certificates → Certificate of Occupancy |
| 6 · Handover & Launch | settlement day | deploy + hand over + market-test |
| 7 · Operations & Maintenance | post-occupancy | support, monitoring, feedback loop |

### Distributor model — core relationship invariant (LOCKED)

A product reaches its end users *through* a distributor who already holds a cohort of them. Value flows as a **dependency chain, not two parallel audiences:**

**end-user love → distributor confidence → distributor benefit.**

1. The **end user must love it as a user** (intrinsic value). Nothing downstream is valid without this.
2. The **distributor** adopts/distributes it only when both hold: **(a) confidence** — they believe their cohort loves it / will; and **(b) benefit** — delivering it benefits *them*, either **monetary** (offered to the cohort as a paid service / margin / rev-share) or **relationship** (a value-add / complementary service that deepens the cohort relationship). This mode is captured as `distributor_benefit_mode` (paid | value-add) in the feasibility layer.

**Consequences (these bind onboarding, the survey, design-build, and outreach):**
- Distributor benefit is **contingent on and downstream of** end-user love — a distributor value prop cannot be asserted without a real end-user one first.
- Node 3 (End User) and node 7 (Distributor) are therefore **distinct, non-collapsible nodes** → the two-audience bug is impossible by construction.
- **Distributor Outcomes (#12)** must express monetary and/or relationship benefit *predicated on* end-user love — not generic outcomes.
- Node-2 **proof-of-demand** is specifically *evidence the end users will love it* — which is what earns the distributor's confidence.
- The mechanical survey can grep that a NAMED distributor marker and a NAMED end-user marker are both **present**, but cannot verify the **relationship logic** between them — so that coherence is enforced **upstream at onboarding** (the coach interrogates the dependency), and the survey downstream confirms presence. Onboarding owns coherence; survey owns presence. (This is where the retired LLM-survey P3 prospect-type *calibration* moves — to the coach, where a human is in the loop.)

*Recorded as a locked `kb_decisions` entry: decision = the dependency chain; rationale = kills the two-audience bug by construction + drives outreach economics; supersedes = the "two-audience landing" framing and the retired P3 calibration.*

---

## 2. Operational gate order — what the cards mirror

The conceptual spine above is *not* the order a product is actually processed in. The spine was authored before the survey gate existed and lists Compliance (3) before Construction (4). In practice every gate that inspects a build can only run **after** a build exists. The real, operational order — and therefore the **top-to-bottom card order** — is:

```
        ┌──────────────────────────── recertify loop #1 ────────────────────────────┐
        │                                                                            │
  SPEC ───► BUILD ───► SURVEY ──(TEARDOWN / INCOMPLETE-SPEC)──► back to BUILD/SPEC ──┘
   (S1-2)   (S4)      (S3 gate, post-build)
                         │
                  (RENOVATION)
                         ▼
                      CERTIFY ───────► SCORE / CoO ───────► HANDOVER ───────► OPERATE
                      (S5 gate)        (S5–6 gate, GO)       (S6)              (S7)
                         │
                         └─── rectify (by lane) ──► re-inspect ──┐  recertify loop #2
                         ▲                                       │
                         └───────────────────────────────────────┘
```

**Two recertify loops are first-class and named (they appear on the card as visible loops, not in-place mutations):**

- **Loop #1 — Survey → Re-survey.** A TEARDOWN (or INCOMPLETE-SPEC) sends the product back to Build (or Spec), then **re-survey**. "Run survey" and "Re-run survey" are distinct buttons; history stays legible.
- **Loop #2 — Certify → Rectify → Re-inspect.** A failed certification check routes by lane to a fix, then the certifier **re-runs**. A check closes only on re-inspection — **never a button**. A product-substance finding closes only on a recorded founder decision.

**Continuous standards** (the other half of Stage 3) run *during* Build, not as a discrete gate: the portfolio-gate CI rules (R1/R4/R10/R13) fire on every build. They are a property of Construction, not a stop in the operational order.

---

## 3. The three gates — what each one proves (legibility)

The cards must make the relationship between these explicit, because they are **sequential and independent** — a product can clear an earlier gate and sit at zero on a later one. That is correct, not a bug.

| Gate | Stage | Proves | Verdict / output |
|---|---|---|---|
| **Survey** | 3 (post-build) | the live build **evidences the 14-field spec** | RENOVATION / TEARDOWN / INCOMPLETE-SPEC |
| **Certification** | 5 | the nine quality checks pass; **HARD gates verified on the live deploy** | per-check pass/fail/na + hard_gates_passed/total |
| **Score / Certificate of Occupancy** | 5–6 | weighted readiness **≥ 80% AND no blockers** | GO / no-go → `pipeline_gates` PASS |

The card's job (handoff task #2): show that **RENOVATION ≠ ready-for-outreach**. The legible chain is: *"build evidences spec ✓ (survey) → checks pass on live deploy ✓ (certify) → ≥80%, no blockers ✓ (score) → GO to handover."*

---

## 4. Stage by stage — HAVE / NEED

### Stage 1 · Ideate & Spec  *(house: vision + architect plans)*
**Purpose:** "Should we build this, and what exactly is it?" Produces the 14-field spec. The INCOMPLETE-SPEC survey verdict routes back here. Captured via the conversational onboarding (`/new-ideas`, §0) — a facilitative-coach LLM that uses discovery + Socratic pushback to draw out the most robust rationale, never coercive.

**Field model — two tiers (architectural decision):** a product carries two distinct field sets, and they must not be blurred.

| Tier | Fields | Role | Seen by |
|---|---|---|---|
| **Graded spec (the 14)** | the 14 validation fields | the spec the build evidences | survey / certify / score / InvestorPilot |
| **Feasibility context** | proof-of-demand (+ `demand_tier`), why-now, status-quo, product-type, `distributor_benefit_mode` (paid \| value-add) | context for the build + outreach economics; admission gate | design-build prompt + InvestorPilot outreach — **never** survey/certify/score |

The 14 are fixed (set, survey denominator, marker contract, IP datapackage all unchanged). The feasibility layer is stored separately (e.g. a JSONB `feasibility` field on the product), is the **Stage-1 admission gate**, and rides forward only as context. **Proof-of-demand is a HARD admission gate:** none → block (legible "no proof of demand"); any tier → pass. Scoring/hardening of the tier is deferred.

- **HAVE:** the 14-field spec + card editor (`ValidationFieldsEditor`).
- **NEED:** the **onboarding `/new-ideas` page** (conversational two-layer Q&A — feasibility discovery + spec elicitation to the per-field robustness bars; seeds the row, stores feasibility, flips INCOMPLETE-SPEC→in-pipeline). No ideator-facing office-hours exists today (`cais-interview-agent` is prospect-facing). **Cost estimation** still concept-only. `product_type` rides as context — no cert-level enforcement yet.

### Stage 2 · Construct  *(house: builder)*
**Purpose:** build the product to the spec; plant the survey markers from the card so marker value and visible copy are two renderings of one source.
- **HAVE:** the design-build workflow (`design-build.yml`, opencode → PR → merge → redeploy); `surveyMarkers.ts` `markerProps()` planting + manifest emission; continuous standards via portfolio-gate CI (R1/R4/R10/R13) during build.
- **NEED:** the **on-card Merge button (Track B)** — today the merge is a manual terminal loop (slow, error-prone). A destructive rebuild can regress non-spec features (e.g. OG image, share UI) — design-build prompt must preserve existing good copy, marker-pass only. **Add a feasibility-context block to the design-build dispatch** (proof-of-demand, why-now, status-quo, product-type, `distributor_benefit_mode`) — the one place the feasibility tier is consumed by machinery, grounding the build in the demand evidence. (`distributor_benefit_mode` also rides to InvestorPilot at Stage 6 to select the outreach economics — paid/margin/rev-share vs deepen-the-client-relationship — consistent with "economics on reply, not cold first-touch.")

### Stage 3 · Survey gate  *(house: compliance check vs spec — post-build)*
**Purpose:** does the live build evidence the spec? Deterministic, no model. **Loop #1 lives here.**
- **HAVE:** deterministic DOM-marker survey (`survey.ts`, `survey-markers.ts`, `survey/route.ts`), in-app synchronous kickoff (`survey/kickoff/route.ts`), card verdict + per-field grep trace + `toReach`. `SURVEY_MARKER_CONTRACT.md` is the shared spec. Proven deterministic (same input ⇒ same verdict).
- **NEED:** optional PR-time presence lint (`lint-survey-markers.mjs`) so a missing marker fails at PR, not post-deploy. Survey must be added to this methodology's stage list permanently (it was absent from the prior docs).

### Stage 4 · Certify gate  *(house: certifier inspects → trade certificates)*
**Purpose:** the nine quality checks. **Loop #2 (rectify → re-inspect) lives here.** Lanes: code-fix → opencode; substance → founder; feature → backlog.
- **HAVE:** nine checks — 5 compliance-HARD (auth, branding, metadata, security, privacy) + validation (qa, naive, **gtm**) — via `run-test/route.ts` autochecks; persist + hydrate + rollup via `validation-test/route.ts` (`hard_gates_passed/total`, `validation_test_status`). GTM autocheck now verifies the real distribution-loop surface (`/api/share|referral|invite`), not a homepage string-grep.
- **NEED:** **coverage** — several HARD checks have never been *run* on real products (they correctly block as "not inspected"); every applicable HARD check needs a recorded pass/fail/na. Wire the certifier emit-spec (`certifier-emit-spec.md`) into `naive-tester/SKILL.md` + `qa/SKILL.md`. Metadata check exposes a real gap on some products (OG image / favicon / manifest genuinely absent).

### Stage 5 · Score & Sign-off  *(house: Certificate of Occupancy)*
**Purpose:** aggregate to a single GO/no-go. ≥80% weighted AND no blockers.
- **HAVE:** **`score.ts` / `loadCardScore` is the live canonical scorer** (45-check, tier-aware, compute-on-read, tested). `pipeline_gates` PASS is the GO record. `gate-check.mjs` binds a PASS to the live deployment (a stale build does not pass).
- **NEED:** **finish scorer reconciliation** — confirm `recalculate-score` is a pure `loadCardScore` adapter and **shelve the SQL `compute_readiness`** (validated-but-redundant duplicate; the old `AS_BUILT` wrongly called it canonical). Build the **Certificate of Occupancy** artifact (`certificate-of-occupancy.json`) with the **30-day auto-reset** (`valid_until` / `user_feedback_flag`) — currently GO is only a gate row, the CoO is designed but not emitted.

### Stage 6 · Handover & Market-test  *(house: settlement day)*
**Purpose:** deploy, hand over, and run the distributor market-test.
- **HAVE:** submit-for-outreach → InvestorPilot webhook → fully-onboarded distributor product (Path 2, zero manual finishing) → outreach → GO/KILL. Distributor-only model enforced.
- **NEED:** the **handover package** (credentials / TESTING.md / runbooks / launch-checklist / signed CoO bundle) is scoped, not built.

### Stage 7 · Operate & Maintain  *(house: post-occupancy)*
**Purpose:** keep it running; feed lessons back to Stage 1.
- **HAVE:** SayFix exists standalone.
- **NEED:** `@caistech/support` embedded in every product's admin portal; **Smart Sensors** (Phase 1: health/security/cost — all planned, not built); the **feedback loop** (ops patterns → update `PRODUCT_STANDARDS.md` → inform new builds) is manual/aspirational.

---

## 5. The scorer — single source of truth (correcting the old docs)

There were three scorers; the canon is now one read-path:
- **CANONICAL:** `score.ts` / `loadCardScore` — tier-aware, 45-check, compute-on-read. The cockpit UI and the gate read this.
- **ADAPTER (verify):** `recalculate-score/route.ts` — should be a thin pass-through to `loadCardScore`; retire any residual hardcoded formula.
- **SHELVED:** the SQL `compute_readiness` function + 63-row `readiness_criteria` — a validated but redundant duplicate. **Not the live path.** (`AS_BUILT.md` previously documented this as canonical — that was the drift.)

Single writer each: `weighted_score_percent` ← `score.ts` via recalculate-score (Score step); `hard_gates_passed/total` + `validation_test_status` ← `validation-test` (the card persist effect).

---

## 6. The card mirror (definition of done for the UI)

The card renders these in this exact order, top to bottom, one human working down the line; reruns are separate named buttons; every action shows live progress; every dead-end states the exit; everything needed is on the card (zero-leave).

1. **Spec** — the 14 fields (edit). INCOMPLETE-SPEC returns here.
2. **Build** — design-build (kick off → progress → PR link → **merge button**). [merge = the one human gate kept even in auto mode]
3. **Survey** — Run survey / **Re-run survey**; verdict + per-field grep + `toReach`. *Loop #1.*
4. **Certify** — the nine checks; each failed check shows lane + fix + **re-inspect**. *Loop #2.*
5. **Score** — weighted % + blocker list (what/why/who/status); GO when ≥80% & no blockers → CoO.
6. **Handover** — submit-for-outreach → InvestorPilot; deploy status.
7. **Operate** — (future) sensors + support surfaced here.

**Three-gate legibility banner:** survey verdict, certify status, and score must be shown with their relationship explicit, so RENOVATION-at-top + 0%-at-bottom reads as "spec evidenced → now certify & score," not as a contradiction.

**Manual → auto:** manual-first (every stage a button). When a stage proves out 10/10, it may auto-advance — but **the merge always waits for a human click.**

---

## 7. Rollup — canonical but not yet built (the NEED backlog, in pipeline order)

| Order | Item | Stage |
|---|---|---|
| 0a | Front-of-house scaffolding: Dashboard cards, fold `/factory`→`/pipeline`, wire `/methodology` to render this doc | §0 |
| 0b | Onboarding page `/new-ideas` (office-hours intake = feasibility + spec capture; seeds the 14 fields; INCOMPLETE-SPEC→in-pipeline) | §0 / 1 |
| 1 | Cost estimation (the other half of the Stage-1 feasibility gate) | 1 |
| 2 | On-card Merge button (Track B) | 2 |
| 3 | PR-time marker presence lint (optional) | 3 |
| 4 | Certification HARD-check coverage runs + wire certifier emit-spec into skills | 4 |
| 5 | Finish scorer reconciliation (adapter + shelve `compute_readiness`) | 5 |
| 6 | Certificate of Occupancy artifact + 30-day auto-reset | 5 |
| 7 | Handover package | 6 |
| 8 | `@caistech/support` embed; Smart Sensors P1; ops→standards feedback loop | 7 |
| 9 | Card UX build-out mirroring §6 | cross-cutting |
| 10 | Supabase-canonical KB (kb_bugs / kb_decisions / kb_gaps / kb_sessions) + end-of-session sync gate | cross-cutting |

---

*Supersedes: `product-factory/TARGET_STATE.md`, `product-factory/AS_BUILT.md`. Those should be marked superseded (or deleted) once this is committed, with their unique detail (Certificate of Occupancy schema, Smart Sensors phasing, cost-management system, SayFix dual model) folded in or referenced — none of it is lost, it is captured under the stage it belongs to.*