# BUILD BRIEF — Onboarding `/new-ideas` (ideation-chain intake)

**For:** opencode (later build). Build after the front-of-house scaffolding (FRONT_OF_HOUSE_BUILD_BRIEF).
**Repo:** `dennissolver/corporate-ai-solutions` (live cockpit).
**Canonical reference:** `PRODUCT_FACTORY_METHODOLOGY.md` §0 + Stage 1 + the **Distributor model invariant (LOCKED)**.
**Page:** `src/app/admin/pipeline/new-ideas/page.tsx` (shell from the scaffolding pass; this brief fills it).

---

## What this is

An **LLM-conducted, conversational, coaching office-hours intake** that walks a new idea through the **7-node ideation chain (LOCKED)**, derives the 14 spec fields from the chain, captures a feasibility layer, and — on passing — seeds the idea into the pipeline. **New build** (no ideator-facing office-hours exists; `cais-interview-agent` is prospect-facing — borrow its conversational *pattern*, not its substance).

**Tone:** facilitative coach. Discovery → reflect back → Socratic pushback where rationale is thin ("what makes you confident? what would have to be true?") → converge on the strongest *honest* answer. Draws the best out of the ideator; never coercive, leading, or shaming. The gate is on **substance**, not tone.

---

## The 7-node ideation chain (the backbone — LOCKED structure)

The coach walks these **in order**. The 14 fields are *derived* from the nodes; the chain is the structure, the coach is the how.

```
1 Problem → 2 Origin → 3 Affected(END USER) → 4 Severity → 5 Coping → 6 Solution → 7 Channel(DISTRIBUTOR)
```

- Hardest pushback at **nodes 1, 2, 4** (is the problem real / what's your evidence / how severe).
- Node 7 is the **motion selector** (distributor-sell is the locked default model here; other motions parked).
- Rule: **every node needs a stated rationale — no empty beliefs.** Evidence-*weighting* (scoring) is deferred.

### The distributor dependency the coach enforces (from the LOCKED invariant)

Value is a chain, not two audiences: **end-user love → distributor confidence → distributor benefit.** The coach enforces this when walking nodes 3 → 7:

- **Order gate:** do not accept any node-7 distributor-benefit answer until nodes 3–4 (end-user identity + that they'd love it + severity) clear their bar. End-user love is established first.
- **Dual elicitation at node 7:** refuse a one-legged answer — draw out **(a) confidence** ("why would [named distributor] believe their cohort wants this?" → ties back to node-2 evidence) AND **(b) benefit** ("how does giving this to their cohort benefit *them*?" → resolves to `distributor_benefit_mode`).
- **Tie-back rejection:** a distributor value prop that doesn't rest on end-user love gets pushed back ("margin on what their clients actually want — what's your basis the end users want it?").
- **Collapse rejection:** if distributor and end user are described as the same party or two parallel buyers, surface the dependency and re-elicit them as distinct nodes.

---

## Two-tier field model (do not blur)

| Tier | Fields | Role | Seen by |
|---|---|---|---|
| **Graded spec (the 14)** | the 14 validation fields — unchanged | the spec the build evidences | survey / certify / score / InvestorPilot |
| **Feasibility context** | proof-of-demand (+ `demand_tier`), why-now, status-quo, product-type, `distributor_benefit_mode` | build context + outreach economics; admission gate | design-build prompt + InvestorPilot — **never** survey/certify/score |

The 14 are not modified (set, survey denominator, marker contract, IP datapackage all unchanged). The feasibility layer is stored separately.

---

## Node → field derivation (SETTLED)

Every one of the 14 graded fields has a single owning node; the feasibility fields too. **Key call:** the `icp_*` qualifiers (#4, #7, #8, #9) are **distributor attributes** — InvestorPilot prospects *distributors*, so the ICP profile is the distributor you're reaching. End-user geography/vertical, if it differs, lives inside End-User ICP (#13) prose.

| Node | Graded fields (owner) | Feasibility / notes |
|---|---|---|
| 1 · Problem | Friction/Pain Point (#2) | — |
| 2 · Origin (awareness source) | — | **proof-of-demand**, `demand_tier`, why-now — evidence the *end users* will love it |
| 3 · Affected (END USER) **[LOCKED]** | End-User ICP (#13), End-User Outcomes (#14) | — |
| 4 · Severity | *(sharpener — owns no field)* sets the magnitude of End-User Outcomes (#14) & Product Promise (#1); strengthens proof-of-demand | — |
| 5 · Coping (status quo) | *(contributes to Exclusions #10)* | status-quo |
| 6 · Solution | Product Promise (#1), Core Mechanism (#3) | product-type |
| 7 · Channel (DISTRIBUTOR) **[LOCKED + qualifiers]** | Prospect Type (#5), Buyer Title (#6), Distributor ICP (#11), Distributor Outcomes (#12); + Geography (#4), Verticals (#7), Company Size (#8), Stage (#9), Exclusions (#10, with node 5) | `distributor_benefit_mode` |

**Full coverage:** #1→N6, #2→N1, #3→N6, #4→N7, #5→N7, #6→N7, #7→N7, #8→N7, #9→N7, #10→N7(+N5), #11→N7, #12→N7, #13→N3, #14→N3. (#5, #6, #11, #12, #13, #14 locked; the rest settled.)

**Distributor Outcomes (#12) is special:** it must express **monetary and/or relationship benefit predicated on end-user love** (paid service / margin / rev-share, OR value-add that deepens the cohort relationship) — not generic outcomes. `distributor_benefit_mode` (paid | value-add) is captured alongside.

---

## Per-field robustness bars (the substance of the challenge)

Bars mirror `SURVEY_MARKER_CONTRACT.md` value classes so intake elicits answers that will **pass the deterministic survey** (NAMED/ENUM/presence) — instead of planting a generic value and discovering it at TEARDOWN (the `card-named-field-holds-generic-not-archetype` lesson, caught at intake). **Do not redefine the enum/banlist here — reference the contract.**

| # | Field | Class | Robustness bar |
|---|---|---|---|
| 1 | Product Promise | prose | one specific, falsifiable outcome — not a category |
| 2 | Friction / Pain | prose | a concrete situation a real person hits, not "it's hard" |
| 3 | Core Mechanism | prose | *how* it works in one line — mechanism, not benefit |
| 4 | Target Geography | enum/prose | a named market, not "global" |
| 5 | Prospect Type (`icp_partner_type`) | **NAMED** | specific named distributor archetype — reject banlisted/generic ("reseller", "users") |
| 6 | Primary Buyer Title | **NAMED** | a real decision-maker title, not "the team" |
| 7 | ICP Verticals | prose | named verticals, not "any industry" |
| 8 | ICP Company Size | enum/prose | a band, not "all sizes" |
| 9 | ICP Stage | **ENUM** | on the allowed enum (reject off-enum/plural that slugs wrong) |
| 10 | Exclusions | prose | who this is explicitly NOT for — non-empty |
| 11 | Distributor ICP | **NAMED** | a single coherent distributor archetype, not a multi-audience list |
| 12 | Distributor Outcomes | prose | monetary/relationship benefit **predicated on end-user love** |
| 13 | End-User ICP | **NAMED** | a single named end-user, not a category |
| 14 | End-User Outcomes | prose | the concrete outcome / the love |

The 8 "Generate" fields may be LLM-drafted from the conversation, but the ideator confirms/refines each to its bar — generated ≠ accepted. No field accepted at "(not set)" or generic.

---

## Admission criterion (idea → pipeline)

A row is admitted (flips INCOMPLETE-SPEC → in-pipeline) only when **all** hold:
1. **Proof of demand present** — node 2, hard gate, any `demand_tier`.
2. **All 14 fields at their robustness bar.**
3. **Distributor relationship coherent** — end-user love established (nodes 3–4) AND distributor confidence + benefit established (node 7, both legs) AND `distributor_benefit_mode` set.

Otherwise the idea stays in `/new-ideas` as INCOMPLETE-SPEC with a legible blocker ("no proof of demand" / "fields below bar: X, Y" / "distributor benefit not grounded in end-user value"). Hard, but legible.

---

## `demand_tier` (capture now; scoring deferred)

`intuition` < `anecdote` < `article/problem-evidence` < `search/competitor-data` < `waitlist/traction`. The coach gently tests the claimed tier ("you mentioned data — which source?") and records the honest tier. Captured now so later scoring grades without re-interviewing. Today: pass on any; only *absence* blocks.

---

## Write path

On admission:
1. Create/update the `product_validation_status` row, seeding the **14 fields** (this makes it "in pipeline").
2. Store the **feasibility context** (`proof_of_demand`, `demand_tier`, `why_now`, `status_quo`, `product_type`, `distributor_benefit_mode`) — JSONB `feasibility` column or a small dedicated set. **Not** in the 14, **not** in the survey denominator.
3. Optionally store the node rationales / chain transcript to the product KB (node-2 Origin explicitly).
4. Record the idea→pipeline transition for audit.

Pre-admission, partial answers persist so an interrupted session resumes (idea lives as INCOMPLETE-SPEC throughout).

## Downstream wiring (additive; flagged, not built here)
- **Design-build dispatch** gains a **feasibility-context block** (the layer above) — the only place machinery consumes the feasibility tier; grounds the build in demand evidence.
- **InvestorPilot** reads `distributor_benefit_mode` to select outreach economics (paid/margin/rev-share vs deepen-the-relationship) — on reply, not cold first-touch.
- **Survey is unaffected** — onboarding owns relationship *coherence*; the deterministic survey owns marker *presence*.

---

## Decisions locked
- Conversational facilitative coach (not a form, not coercive).
- 7-node chain is the backbone; node 3→End-User, node 7→Distributor locked; distributor dependency invariant enforced by the coach.
- `product_type` rides as context only (no cert enforcement).
- `distributor_benefit_mode` (paid | value-add) captured as feasibility context; feeds design-build + InvestorPilot.
- Proof-of-demand = node 2; hard gate (none→block, any→pass); `demand_tier` captured for later scoring.

## Still open (not blocking; tune in the skill prompt)
- The coach's exact opening prompt / persona — refine in the skill, not the page.

## Out of scope
Scoring/hardening of proof or node rationales; surfacing feasibility context as a read-only Stage-1 panel on the Processing card (§6 card build); any change to the 14, the survey, certification, the scorer, or the IP datapackage; the repo-split/productisation (parked TODO).