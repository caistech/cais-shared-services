# BYOK Factory — Business Model (canonical)

> **This is the single source of truth for how the portfolio makes money.** It supersedes the
> business-model fragments scattered across project memory and the home-directory
> `MONETISATION_*` files. **If this doc and any older doc/memory disagree, this doc wins** — see
> §10 "What this supersedes". Read §0 first; the rest expands it in order.
>
> Location is deliberate: this lives in `cais-shared-services` so every agent/teammate, in any
> repo, can read the *current* model instead of reconstructing a partial, out-of-date one.
>
> **Last updated:** 2026-05-24.

---

## 0. TL;DR (read this first)

- **One operator, ~38 products, one shared substrate** (`@caistech/*`). The substrate is the moat; the operator's hours are the scarce resource everything competes for.
- **Four revenue lanes — but only ONE is the primary cash engine: paid distributor SaaS** (Singify-style, multi-tenant). The other three are secondary (studio engagements, contract builds) or non-revenue (free BYOK products = marketing).
- **We sell to DISTRIBUTORS** — operators who already have a book of customers (a singing school, a VC accelerator, an accountancy firm) — and clip a small fee per active end-user. **We never sell to or bill end users.** We are infrastructure, not a service provider.
- **Every product runs a 5-stage validation pipeline** (idea → feasibility → dual-stream demand validation → go/no-go → MVP-tested-by-the-same-audience → ship) before a full build. A scoring rubric decides go/no-go; a distributor must exist or it's a no-go.
- **A set of non-negotiable rails (the 15 rules)** bound cost exposure, operator bandwidth, the moat, and publishing discipline. They are auth-pattern severity.

The rest of this document is that summary, expanded.

---

## 1. The North Star — why all of this exists

The whole system serves one operating loop Dennis has walked toward for ~20 years:

> see a problem → ideate the solution → opine it to a room of clever people who listen → send them to do the market research → they return with a **go/no-go on Dennis's own methodology** → if go, execute.

The product-development pipeline (§4) **is that loop, realised** — the agents are the tireless room, the cockpit is the boardroom, the dual-stream validation is the market research, the rubric is the go/no-go. **What makes it his is the methodology, not the people:** encode the methodology once and the clever enthusiasts become infinite, while Dennis stays the one who *sees the problem and says "go."* Everything that re-chains him to the tireless middle (e.g. an engagement that swallows portfolio bandwidth) works against the dream.

The personal driver behind it (stated 2026-05-24): escape being *"the cleverest and fastest builder in the room and also the poorest."* The model below is a value-**capture** play, not a value-creation one — building was never the bottleneck; owning a compounding, recurring asset is. Bias every call toward the ARR-bearing, founder-independent, ownable shape.

---

## 2. The four lanes — how money comes in

Locked 2026-05-24. Each lane has a *different role*; do not treat them as equal.

| # | Lane | What it is | Who pays | Revenue role |
|---|------|-----------|----------|--------------|
| **1** | **Paid distributor SaaS** (Singify-style) | Multi-tenant, white-label B2B2C platform on a reusable engine. The distributor pays recurring; they decide whether/how to charge their own end users. | The **distributor** (recurring) | **PRIMARY revenue + cash-flow anchor** |
| **2** | **Studio-in-residence** | Embed with a dev shop / accelerator and install the substrate. Capacity-capped (2×3-month or 1×6-month per year). Retainer + ≤3% equity per counterparty. | The host | Networking + *some* revenue (not primary) |
| **3** | **Contract / bespoke build** | Custom build engagements ("clean 4th tier"). | The client | *Some* revenue; partly fed by the BYOK funnel |
| **4** | **BYOK-free products** | Free, bring-your-own-keys, self-hosted open releases (e.g. CQR). | Nobody | **Awareness / marketing only — NOT revenue** |

**The funnel:** BYOK products (lane 4, top of funnel) → hobbyists experience the methodology → convert into **contract builds** (lane 3) and/or **studio-in-residence** (lane 2). Separately and **primarily**, the **paid distributor SaaS** (lane 1) is sold through the validation pipeline and carries the stable recurring revenue.

**Not a lane: infrastructure.** `@caistech/*` shared-services builds sit *beneath* all four lanes as the substrate every product consumes. They bear no revenue directly; their payoff is leverage (each one makes the next product cheaper to ship). See §6.

---

## 3. Who we sell to — the distributor-first rule (Rule 15)

**We sell to operators who already have customers, never to end users.** This is the single most important framing and the most common thing agents get wrong.

- The **distributor** is a named operator-archetype with an existing book: *"singing teachers / academies"* (Singify), *"VC accelerators"* (RaiseReady), *"Australian accountancy firms with 200–800 SME clients"* (R&D tax). "SMBs" is not an answer.
- **Pricing is a clip:** CAS charges **$10–20 per active end-user per month**, paid by the distributor. The distributor prices their own clients however they like (typically 3–10×) and keeps the margin. The clip is low on purpose — the distributor does acquisition, support, and the relationship; CAS provides the infrastructure they monetise.
- **Two deployment paths:** **BYOK** (distributor self-hosts on their own keys → CAS gets ~nothing → lane 4 shape) or **Hosted** (CAS runs it → the clip applies, invoiced in advance → lane 1 shape). Distributor sophistication selects the path (a VC accelerator may self-host; a singing teacher will not).
- **The four gate questions** (answered before any build): (1) Who is the distributor? (2) Why them — what does it let them sell that they can't today? (3) Why this problem, why now? (4) How does it grow *their* business? If any answer is hand-wavy → back to office-hours.

Worked example — **Singify:** distributor = singing teachers/academies; end users = their students; CAS clips $10–20/active student/month; the teacher prices students and keeps the margin.

---

## 4. The product-development pipeline — how an idea becomes a product

Five stages. Fully automated **except the final outbound messages** (human-in-the-loop approval until the flow is polished).

1. **Ideation** — from the always-on research agent (scanning sectors for whitespace, deduped against the existing ~38 products) or from Dennis directly.
2. **Feasibility** — an `/office-hours`-style feasibility + assessment pass.
3. **Dual-stream demand validation** — push the idea into **InvestorPilot** as a research topic; it sources **two contact streams** — (a) **distributor-level** contacts (who would onsell) and (b) **end-user** contacts (who would use) — and outreaches both to a **Connexions** voice-interview agent. Both interview streams feed results back.
4. **Go / No-Go gate** — distributor stream answers "will someone onsell this?"; end-user stream answers "does the end user want it?". **A GO needs both.**
5. **Build MVP → validate with the same audience → ship** — on GO, build the MVP, then re-engage **the same validated contacts** to test value + improvements. Hands a ready audience + ready buyers at ship.

**Build-to-validate (critical sequencing).** Build the *cheapest demonstrable artifact first* — single-tenant, founder-only, Vercel-default URL, no domain, scoped by a PRD — **before** external validation, because building it sharpens the offer and surfaces requirements ideation can't (e.g. Singify's headphone/backing-track issue). The *cheap demo* is encouraged before go/no-go; the *expensive investment* (multi-tenant platform, billing, scaling) still waits for the GO. Domain purchase is gated on the validated GO — no domain spend before, a professional domain the instant it's earned.

**Two operational gates (cockpit, at `/admin/methodology`):**
- **Gate 1 — "is the thin MVP ready?"** Must be YES, because the kick-off outreach *embeds the link to the thin MVP*. No MVP → no link → no send. Releases the *research*.
- **Gate 2 — the demand go/no-go** (validated distributor + end-user signal). Releases the *full build* + the lane assignment.

The contact graph is **built once and engaged twice** (stage 3 validates demand; stage 5 re-uses the same people to validate the product). Every GO gets a **monetisation-lane assignment** (§2); the stage-3 interview captures deployment preference (self-host → lane 4 / pay-to-host → lane 1).

---

## 5. The scoring rubric — how go/no-go is decided (policy, not gut)

Five dimensions, scored **twice** with the *same* rubric: as **hypotheses** (desk research, confidence-flagged) by the ideation agent at stage 1, then as **evidence** from the two interview streams at the stage-4 go/no-go.

- **A. End-user demand:** (1) Pain severity, (2) Market gap strength.
- **B. Distribution leverage:** (3) **Distributor onsell opportunity** — *this is a GATE*.
- **C. Market + factory economics:** (4) Reachable market size (= Σ distributors × book size, not raw category spend), (5) Factory build-fit (can we ship cheap/fast on existing `@caistech` substrate).

**Decision logic (one-time policy, applied uniformly by the machine — not per-product gut calls):**
- **Dimension 3 is a hard gate** with a personal-interest override lane. No credible distributor → default NO-GO. Dennis can manually greenlight passion/strategic bets (the kira/storyverse override lane).
- Remaining four → weighted composite → **GO / REDESIGN-TO-FIT / NO-GO**.
- **Defaults:** gate D3 ≥ 5; weights Pain 30 / Gap 20 / Reach 25 / Build-fit 25; bands GO ≥ 6.5, REDESIGN 5.0–6.4, NO-GO < 5.0. Review the *policy* only if the first real-evidence run is obviously wrong — never by re-grading individual products.

**Backfill:** running every existing product through this pipeline (letting interview evidence produce each go/no-go) *is* the proper rerun of the old heuristic distributor sweep. It's blocked only until the stage-3 voice loop is operational.

---

## 6. The two build types

The system produces two kinds of build, handled differently:

1. **Client-focused product builds** — the lane-1→lane-4 products that serve distributors/end-users. Run the full pipeline; get a lane assignment.
2. **Infrastructure / shared-services builds** — `@caistech/*` packages. **Never client-focused, never lane-assigned, not directly revenue-bearing.** Their payoff is leverage: each raises rubric dimension 5 (build-fit) for every downstream product.

A **shared-service extraction detector** (inward analog of the ideation agent) watches for the same pattern built in product A then product B and surfaces it as a `@caistech` conversion candidate (human approves; 2nd occurrence = trigger). This is what the fork-check guard (`scripts/check-shared-forks.mjs`) enforces at the code level.

---

## 7. The lane-1 product shape — the primary-revenue engine

Lane-1 products are built as a **two-tier** structure so that product #2+ ships in <2 weeks:

- **TIER 1 — the platform (built ONCE, with the first lane-1 product):** `core/` engine (product-agnostic domain primitives — **`core/` never imports from `products/`**), multi-tenant spine (built on the existing `organisations`/members/roles/invite DNA, extended to distributor→end-user two-level tenancy + white-label), billing spine (Stripe per-distributor + per-active-end-user metering via `@caistech/usage-meters`), and the coach/AI layer (prompts-as-markdown + LLM feedback + voice via `@caistech/elevenlabs-convai` — never a parallel voice stack).
- **TIER 2 — the vertical (REPEATABLE, <2 weeks):** `products/<slug>/` config (terminology, baseline test, coach prompts, success metrics) with **zero `core/` changes**, distributor onboarding/dashboard, end-user flow, the dual-stream validation gates, lane-confirm + go-live. **Lane-1 is not "done" until a distributor pays.**

For the *first* lane-1 product (Singify), build the cheap single-tenant founder-only slice first (build-to-validate, §4); build the expensive Tier-1 platform only after validation passes. Building the first `core/` feeds the `@caistech` hub (its modules become extraction candidates), which makes both future lane-1 verticals *and* everything else cheaper.

Lane-1 repos are **private** (the engine is the moat) — the structural inverse of BYOK products, which are public/MIT and "publish-and-walk-away."

---

## 8. Portfolio consolidation — the ~4 engines (architectural hypothesis)

Pointing the engine/vertical thesis at the ~38 products clusters them into ~4 engines + a tail. **This is the architectural hypothesis; per-product GO/NO-GO + lane verdicts come from the evidence-based backfill (§4/§5), not from this map.**

- **Engine 1 — Voice / coaching** (the Singify engine: analysis + polish + AI coach + baseline). The giant — could absorb ~15 products: LingoPure, the lingo family (universallingo/tourlingo/etc.), RaiseReady (pitch), Connexions + universal-interviews, rehearsals-ai, possibly kira/launchready/mova/storyverse. Singify is its first vertical.
- **Engine 2 — Property intelligence** (`property-services` is already the substrate): dealfindrs, f2k-projects, LGA planning DB. (mmcbuild EXCLUDED — paying client.)
- **Engine 3 — Outreach / contact-discovery** (the InvestorPilot research engine — *also the pipeline's own stage-3 machinery*): partner-pilot, investor-pilot, leadspark, outreachready, tenderwatch.
- **Engine 4 — Compliance / regulated** (may resist multi-tenant SaaS): ndis-sda-automate, rnd-tax-tracker, f2k-checkpoint, f2k-fund-tokenisation, disaster-support, aiftis.
- **Tail:** standalone BYOK (easy-claude-code, storefront-mcp, CQR, preflight); likely-kill (smartboard, hairstylist-ai, omq-outreach, f2k-offshore-modular); infrastructure (platform-trust, coordination-hub, property-services substrate, `@caistech/*`).

Consequence: the backfill validates **engine-level** demand once and verticals inherit — not 38 independent runs.

---

## 9. The rails — non-negotiable rules (auth-pattern severity)

Full expanded text: `MONETISATION_RULES.md` (in this repo, next to this file). Summary, grouped by what they protect:

**Operator bandwidth (the load-bearing risk):**
- **R1 — Bandwidth tripwire is hard.** Portfolio time must not drop below ~25 hrs/wk for 4 consecutive weeks; if it does, engagement intake pauses. *The factory funds the engagements, never the reverse.*
- **R2 — Weekly time-log precedes engagement intake.** Can't sign engagement N without 4 prior weeks of logged hours (so R1 is enforceable).
- **R8 — Portfolio rot trumps engagement growth.** Any REGULATED-tier incident pauses engagement work that week.

**The moat + brand:**
- **R9 — `@caistech` registry stays closed.** Products show *consumption* (in `package.json`), never source. Per-product repos may be MIT; the hub stays private.
- **R3 — NDA + sanitisation check before any public artifact referencing a client.** Default-deny.
- **R4 — Case-study consent clause mandatory in every engagement contract.**
- **R5 — First public artifact ships before any sales outreach.**
- **R6 — Anti-fork on shared monetisation artifacts** (one contract template, one case-study spec, etc.) — same discipline as `@caistech`.
- **R7 — Equity ceiling: ≤3% per counterparty.**

**Cost discipline (makes the hosted/lane-1 tier safe):**
- **R10 — Every key is user-provided in every BYOK product.** Zero CAS exposure to per-user vendor cost. Release-blocking.
- **R12 — No uncovered cost exposure.** Every cost CAS incurs for a customer is pre-covered (prepaid / paid-in-advance). R13 + R14 are *implementations* of this.
- **R13 — Single-tenant is always a customer choice** (forced on for REGULATED tier).
- **R14 — Usage cap is hard-cut, not soft-warn.** 80% warn → 100% disable until top-up/upgrade. Cap = cost ceiling = revenue ceiling.

**Operating posture:**
- **R11 — The operator does not wait.** Vendor slow? Draft the workaround from public surfaces in minutes; don't default to wait/defer/risk-flag.
- **R15 — Distributor-first product gate** (see §3). Sell to distributors, not end users; the four gate questions; the clip.

---

## 10. What this supersedes — the "vintage" table

The single biggest source of confusion: **two generations of the model coexist in old docs.** This is the reconciliation. The right column is current.

| Older framing (pre-2026-05-24) | Current (this doc) |
|---|---|
| "Three pillars: content / studio / BYOK products" | **Four lanes** (§2). Pillars map onto lanes but the framing is lanes now. |
| **"Studio-in-residence is THE paid wedge"** | **Demoted to lane 2.** Paid distributor SaaS (lane 1) is the wedge + primary revenue. |
| **"No paid SaaS sidecar" / "no multi-tenant" / "single-tenant by design" / "no Pro tier"** | **Scoped to the BYOK Factory product tier ONLY.** Lane-1 products *are* paid + multi-tenant by design. (CQR stays free/single-tenant; Singify is paid/multi-tenant.) |
| "Line A (engagements) vs Line B (products)" two-line model | The **four-lane** model (§2) with lane 1 primary. The A/B framing is obsolete. |
| Distributor-first was a heuristic sweep | Distributor-first is now a **measured gate** in the pipeline (§4/§5); the old 16-GO/9-POSTPONE/3-NO-GO sweep is superseded by the evidence backfill. |

Memory files reflecting the older framing: `project_methodology_monetisation.md` (note: it now carries a "reframed to four lanes" banner at the top). The current spine: `project_monetisation_lanes.md`, `project_product_development_pipeline.md`, `project_lane1_product_release_pattern.md`.

---

## 11. Open questions — unresolved, Dennis's call

These are genuine strategy gaps the model hasn't closed (surfaced by multiple reviewers). A reader should know they're open, not infer an answer.

1. **Does the product/lane-1 line need its own bandwidth gate?** R1's tripwire stops *engagements* from starving the portfolio — it is one-directional. Nothing explicitly stops product/distributor/hosted-infra ops from starving the engagement cash-line. The rails were written before lane 1 existed as the primary revenue lane; the product-revenue line may need its own bandwidth guard.
2. **Does lane-1 / distributor sales need its own funnel?** Lane A content (Factory Floor essays) feeds dev-shop owners (the engagement audience), not distributors. Either lane 1 needs its own distributor-lead funnel, or it rides on engagements on the thesis that *in-residence dev shops are themselves distributors* (R15 hints at this but doesn't decide it).

---

## 12. Where the detail lives (canonical sources)

- **This doc** — the model, top to bottom. The entry point.
- **`MONETISATION_RULES.md`** — full expanded text of the 15 rails. Lives in **this repo**, next to this file (moved from `C:\Users\denni\` on 2026-05-24 so it travels with the repo + loads from any clone). A redirect stub remains at the old home path pointing here.
- **Project memory** (`~/.claude/projects/C--Users-denni/memory/`): `project_monetisation_lanes`, `project_product_development_pipeline`, `project_lane1_product_release_pattern`, `project_portfolio_consolidation_map`, `project_singify`, `user_twenty_year_dream`, `feedback_capture_over_build`. ⚠️ *These are scoped to the home-dir slug — an agent working inside a product repo does NOT load them.* This doc exists precisely to be the portable replacement.
- **Positioning/voice** (not the economics): `cais-shared-services/foundation/_portfolio/market-positioning.md` + `creator-style.md`.
- **`MONETISATION_STATE.md`** (home dir) — what's true this week. **`MONETISATION_EXECUTION_PLAN.md`** (home dir) — milestone sequence.
</content>
