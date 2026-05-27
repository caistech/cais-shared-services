# THIN MVP RUBRIC v2 — the "I want that" test

> Canonical rule for deciding **what goes in a thin validation MVP** and **how to stage
> a new product's build**. Companion to `BUSINESS_MODEL.md` (§4 build-to-validate, §7
> lane-1 product shape). Auth-pattern severity: getting the slice wrong returns a **false
> NO-GO** and kills a good product, or over-builds before validation and burns the operator
> hours the factory runs on. Imported into the global `CLAUDE.md`.
>
> **§0–5 are the conceptual model (unchanged).** **§6–8 are v2** — the ratified Gate-1
> readiness policy folded in from the signed-off `GATE_READINESS_REVIEW_V4` workbook
> (2026-05-26): the tiered 45-check classification, the per-product promise bars, and where
> the machine-readable source lives. The model now decides the slice (§0–5) *and* scores its
> readiness (§6–8) as policy rather than per-product judgement — the `BUSINESS_MODEL.md` §5
> rubric discipline, extended to readiness.
>
> **Last updated:** 2026-05-26 (v2 fold-in).

---

## 0. The bar is the reaction, not the size

A thin MVP's literal job in the pipeline (`BUSINESS_MODEL.md` §4, **Gate 1**): the link is
embedded in the kick-off outreach to the validation audience — the distributor stream and
the end-user stream. So the bar was never *"does it run."* It is:

> A **distributor** watches a 2-minute demo and thinks *"I'd give this to my clients."*
> An **end user** thinks *"I want to make one of these right now."*

That reaction **is the validation signal.** A slice that can't produce it returns a false
NO-GO — you'd kill a good product because you showed a dead version of it. That is the
expensive failure. Over-building is the *other* failure (it burns operator hours pre-GO).
This rubric sits between them.

## 1. Two independent axes (the core idea)

The single most common mistake is collapsing two different axes into one — letting
*"thin / cheap"* slide into *"minimal / fewer features."* They are orthogonal:

| Axis | What it is | Where the thin MVP sits |
|---|---|---|
| **Experience** | what a viewer *feels* — the product's promise | **MAX — the whole promise** |
| **Scale / ops infrastructure** | only matters once there are *many real users or money* | **ZERO** |

- **Too thin** = cutting **experience**. → false NO-GO. The expensive failure.
- **Too much** = adding **scale infrastructure** before the GO — multi-tenant, auth/ToS,
  billing/metering, dashboards, white-label, sharing/storage infra, search backends, etc.
- **Just right** = **the full experience, single-user / founder-hardcoded / faked** wherever
  the infrastructure would only matter at scale. Not minimalist — the complete product
  minus only the plumbing that does nothing for a viewer in a demo.

This reconciles with build-to-validate: the *"cheapest demonstrable artifact"* means cheap
on the **infrastructure** axis (no platform, no domain, single-tenant) — **never** cheap on
the experience axis.

## 2. The one discriminator question

For any feature, ask:

> **"Does its absence change what a viewer feels in a 3-minute demo?"**
> Yes → **in**. No → **out**.

## 3. Three refinements that catch the common errors

1. **The quality bar lives inside the attributes that are in.** An attribute that is
   *present but weak* fails the test as surely as a missing one. (Singify's polish "worked"
   but sounded *subtle* — a subtle transformation produces no "I want that.") "Just right"
   includes the quality bar on each in-scope attribute, not just a checklist of boxes.
2. **The floor is what a prototype already proved.** Never ship a slice *below* what a quick
   build already demonstrated. If a day's prototype did the full loop, the slice inherits
   that loop — it does not re-derive a smaller version. Regressing the experience to "ship
   something" is the same false economy as cutting it in the first place.
3. **Portfolio DNA is experience, not infrastructure — it is always IN.** The baseline
   product elements every project ships by CLAUDE.md / cais rule — a **persistent nav
   chrome + Settings page**, the **chrome-level voice agent** (the in-context guide/clarifier,
   per the VOICE AI rule), a **landing page that sells the concept**, **responsive** layout,
   **explanatory headers**, and the **auth-page pattern** where there's auth — are what a
   viewer *feels*, so they belong in even the thinnest slice. "Zero scale-infrastructure"
   means no multi-tenant / billing / dashboards / auth-backend; it does **not** mean a dull,
   navigation-less, voice-less, un-sold shell. A singing app that looks like a tax form has
   cut experience, not infrastructure. Stripping DNA "to save a few minutes of dev time" is
   the same false economy as cutting a headline feature (locked after the Singify slice
   shipped dull on 2026-05-25).

## 4. How to apply it

### A. Judging an existing repo's slice ("is this a real thin MVP?")
Walk every attribute through the discriminator (§2). Flag each **experience** cut as
*too thin* (fix before showing); flag each **scale-infrastructure** inclusion as *too much*
(defer to post-GO). Check the §3 refinements: are in-scope attributes at demo-quality, and
is the slice at least at the prototype floor?

### B. Planning build stages for a NEW repo
- **Stage 0 — name the promise.** State the product as its verbs + adjective (what it *is*).
  Every Stage-1 attribute must be load-bearing for that sentence.
- **Stage 1 — the thin MVP (pre-GO).** Full **experience**, **zero** scale infrastructure:
  single-user, founder-hardcoded, faked-where-only-scale-cares, Vercel-default URL, no
  domain. This is the artifact whose link is embedded in validation outreach (Gate 1).
- **Gate 2 — the validated GO** (distributor + end-user demand). **Only then** build the
  Tier-1 scale layer (multi-tenant, auth, billing, dashboards, white-label) per
  `BUSINESS_MODEL.md` §7, and buy the domain (domain spend is Gate-2-gated).

## 5. Worked example — Singify (canonical reference)

**Promise:** *karaoke* (sing along to a real song, see yourself) + *polish* (hear yourself
transformed) + *coach — that knows your voice*.

| In the thin slice (experience) | Out until the GO (scale infra) |
|---|---|
| In-browser **video** recording | Multi-tenant / distributor→end-user tenancy |
| **Sing along** to a real backing in headphones | Auth / ToS / accounts |
| **Voice-agent coach** (not text tips) | Teacher dashboard, invites, white-label |
| **Vocal baseline** ("knows your voice") + auto-transpose | Stripe / per-seat metering |
| **Dramatic** polish (quality bar, not subtle) | Signed-URL sharing backend, search backends |

Drop any left-column item and the viewer sees a lesser, different product (too thin). Add
any right-column item pre-GO and you've spent operator hours on plumbing that changes
nothing a viewer feels (too much).

---

## 6. The Gate-1 readiness classification (v2 — ratified policy)

§0–5 decide *what's in the slice*. §6 decides *whether the slice is ready to send* — the
Gate-1 question ("is the thin MVP ready for the validation outreach link?"). It is now
**machine-applied policy**: the 45 checks below were each assigned a tier by Dennis in the
`GATE_READINESS_REVIEW_V4` workbook (every check `Confirm=Y`, zero overrides). The full
catalogue with per-check source/method/notes lives in
`gate-readiness/criteria.json` and the cockpit `readiness_criteria` table.

**Five tiers (ratified tally — 45 checks):**

| Tier | Count | Role at Gate 1 |
|---|---|---|
| **HARD** | 7 | **Blocks the Launch button.** No waiver. (P1 live link · P2 named distributor · P3 four gate questions · #2 responsive · #7 real `<title>` · #39 no committed secrets · #40 Vercel env hygiene.) |
| **CONDITIONAL-HARD** | 14 | HARD **only when that feature exists** — auth (#22–25), voice (#10–11,13–14,16–19), IP/3rd-party content (#33), Supabase (#38). If the feature is present and the check fails → blocks. |
| **WEIGHTED** | 13 | **Feeds the GO / REDESIGN / NO-GO score** (waivable). Carries a High/Med/Low weight. #9 (promise attributes at quality bar) is the central one. |
| **CONDITIONAL-WEIGHTED** | 5 | Weighted **only when that feature exists** (#15 memory pattern, #20 cross-session memory, #29 Sign Out, #34 Mapbox/ABN, #35 email sender). |
| **TOO-MUCH** | 1 | **Inverse guard** (P4): scale-infra *present* pre-GO is itself a flag (team admin / billing / settings = over-build). |
| **DEFER** | 5 | Scale-infra, **not scored at Gate 1** (#8 OG image · #21 memory GDPR surface · #27 full settings · #28 profiles table · #30 team admin). These re-enter at Gate 2 / Tier-1 per `BUSINESS_MODEL.md` §7. |

**How the gate runs (the decision logic):**
1. **Conditional applicability first.** For each `CONDITIONAL-*` check, decide whether the
   feature is in scope for *this* slice. If not, the check is N/A (not a fail, not a score).
2. **HARD gate.** Every applicable `HARD` + `CONDITIONAL-HARD` check must pass. Any failure →
   **the slice is not Gate-1-ready**; the cockpit Launch button stays blocked. No weighted
   score is even computed. (Mirrors `BUSINESS_MODEL.md` §5 dimension-3 hard gate.)
3. **TOO-MUCH guard.** P4 trips if scale-infra is present pre-GO — surfaced as an over-build
   flag (the inverse failure the rubric exists to prevent), not a hard block.
4. **WEIGHTED score.** With the HARD gate passed, the applicable `WEIGHTED` +
   `CONDITIONAL-WEIGHTED` checks form a weighted composite (High/Med/Low). Bands follow the
   §5 rubric shape — **GO ≥ 6.5 · REDESIGN 5.0–6.4 · NO-GO < 5.0** — and the High/Med/Low →
   point mapping + exact bands are **calibrated on the first real run** (per the workbook
   sign-off: "adjust after first real run as agreed"). The *tiers* are firm; the band
   arithmetic is the tunable knob.

### Locked engine policy (signed off 2026-05-27 — recalibrate after the first live deploys)

The 8 implementation knobs §6 left open are now ratified (full context + rationale:
`SCORING_ENGINE_OPEN_QUESTIONS.md`). The tiers/weights stay firm; these fix *how the engine
behaves*. Explicitly tunable after the first few repos go live.

1. **Feature set (applicability source)** — **hybrid**: auto-detect the card's features from a
   repo/deploy scan, operator confirms/overrides. Stored on `methodology_hypothesis_cards.features`.
2. **Weight → points + normalization** — start **High=3 / Med=2 / Low=1**, score =
   (Σ earned ÷ Σ applicable) × 10, bands **GO ≥6.5 / REDESIGN 5.0–6.4 / NO-GO <5.0**.
   Provisional — flag the first 3 real scores for a calibration review.
3. **Missing evidence** — **never silently N/A**: a missing **HARD** result fails the HARD gate
   (no score computed); a missing **WEIGHTED** result counts as **fail**. Prove, don't assume.
4. **TOO-MUCH guard (P4)** — **non-blocking flag** on the card (over-build wastes hours but does
   not invalidate the validation signal); never blocks Launch.
5. **#9 promise-attribute rollup** — **proportional** (fraction of attribute bars met) **with a
   load-bearing floor**: any flagged load-bearing attribute below bar caps #9 at REDESIGN.
6. **Source precedence on disagreement** — **live pass (naive-tester / voice-auditor) > judge
   (LLM) > auto-probe**. Record all, score the top. (Also resolves the SDK-vs-CDN voice
   false-negative class — the live voice-auditor PASS outranks the wrong-signature auto-probe.)
7. **Re-score trigger** — **on-demand + mark stale**: a newer deployment or audit result marks
   the snapshot stale (visible "re-score"), never silently recomputes.
8. **NO-GO override** — reuse the reasoned-+-logged override ledger; a weighted-band override
   needs a logged reason; **overriding a HARD-gate failure needs an explicit per-check confirm**
   ("I understand <check> failed").

## 7. The promise layer — the "X, not Y" quality bars (check #9)

Check #9 ("promise attributes present **and at quality bar**") is the central WEIGHTED check
and the literal THIN-MVP test (§3 refinement 1: present-but-weak fails as surely as missing).
It is scored against a **per-product promise definition**: the Stage-0 promise broken into
its load-bearing attributes, each with a **quality bar in "X, not Y" form**.

- **20 products have ratified bars** (Dennis `Approve=Y`): Singify, Connexions, Kira,
  RaiseReady, LingoPure, DealFindrs, InvestorPilot, PartnerPilot, NDIS SDA, R&D Tax, CQR,
  rehearsals-ai, LaunchReady, UniversalLingo, TourLingo, OutreachReady, TenderWatch,
  F2K Checkpoint, Disaster Support, Easy Claude Code (89 attribute bars in total).
- **The rest set their bar as they near Gate 1** — the bar *is* the judgement, set per
  product when it becomes a Gate-1 candidate (infra/engine/kill-lane products may never get
  one).
- The bars live in `gate-readiness/promise-attributes.json` and the cockpit
  `promise_attributes` table (keyed by `product_slug`), surfaced on each card in
  `/admin/methodology`.

Singify stays the worked example (§5): *karaoke = real backing in-ear, not speaker bleed ·
polish = "wow" on first playback, not "sounds better" · coach = a voice agent that initiates,
not text tips · knows-your-voice = a baseline the agent pulls and references a prior session,
not "welcome back" · see-yourself = in-browser video, not audio-only.*

## 8. Where the ratified data lives (canonical sources)

- **`gate-readiness/criteria.json`** — the 45-check catalogue (ratified tiers + weights). The
  single source the cockpit table and this doc both reflect.
- **`gate-readiness/promise-attributes.json`** — the per-product "X, not Y" bars.
- **`gate-readiness/extract_workbook.py`** — regenerates both JSONs + the SQL seed from the
  signed-off workbook. Re-run it if the workbook changes; never hand-edit the JSON.
- **Cockpit tables** `readiness_criteria` + `promise_attributes` (Corporate-AI-Solutions,
  migration `20260526000000_readiness_criteria.sql`) — the runtime copy the cockpit reads.
- **`GATE_READINESS_CRITERIA.md`** (this repo) — the source prose each check derives from;
  **`GATE_READINESS_REVIEW_GUIDE.md`** — the workbook guide (what each cell means).
- **`SCORING_ENGINE_OPEN_QUESTIONS.md`** (this repo) — the 8 engine-policy decisions (LOCKED
  2026-05-27), folded into §6's "Locked engine policy" block above. The build-side spec.

---

**Summary in one line:** *the thin MVP is the smallest build that makes the validation
audience feel the whole promise — full experience, zero scale-infrastructure — and §6's
tiered gate decides, as policy, whether that slice is ready to send.*
