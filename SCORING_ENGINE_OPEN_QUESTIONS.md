# Scoring Engine — Open Decisions for Sign-off

> Companion to `HARNESS_BUILD_WORKLIST.md` build #1 (the keystone). The **tiers are
> firm** (`gate-readiness/criteria.json` — 45 checks, ratified in GATE_READINESS_REVIEW_V4)
> and the **decision logic shape is locked** (THIN_MVP_RUBRIC v2 §6). What remains are the
> **policy + calibration knobs** that need your call before — or at — the first real run.
> Answer the 8 questions below and the engine is fully specified; implementation (cockpit
> `score.ts` + `/score` route + render) follows mechanically.
>
> **Captured:** 2026-05-27. **STATUS: ✅ ALL 8 LOCKED 2026-05-27** — Dennis signed off every
> recommendation as written ("agree with all your recommendations… we can tweak after we go
> live deploy a few repos"). Each **Decision:** line below = the **Rec:** above it, adopted.
> The band arithmetic (Q2) is the deliberately-tunable knob; recalibrate after the first few
> repos go live. Folded into `THIN_MVP_RUBRIC.md` §6 "Locked engine policy".

---

## Already locked (do not re-litigate — here for context)

- **Applicability** = feature flags + enriched `criteria.json` (the 19 conditional checks →
  6 feature tags in `gate-readiness/applicability.json`). A conditional check is **N/A**
  (not pass, not fail, not scored) when the card lacks the tag.
- **Per-check results store first** — full granularity day one (`readiness_results`:
  `product_slug, deployment_id, check_code, status, source, evidence, scored_at`).
- **HARD gate semantics** — every applicable HARD + CONDITIONAL-HARD check must pass, else
  **no weighted score is computed at all** (mirrors the §5 dimension-3 hard gate).
- **Band *shape*** — GO ≥ 6.5 / REDESIGN 5.0–6.4 / NO-GO < 5.0. The tier structure is firm;
  only the *arithmetic that lands a card on that scale* is tunable (see Q2).
- **The scorer reads recorded audit results — it does not re-run audits.** It aggregates
  (a) automatable probes, (b) the recorded naive-tester live PASS, (c) promise-attribute
  verifications. Re-running audits is the job of the skills, not the scorer.

---

## The 8 open decisions

### Q1 — Where does a card's `features` set come from?
Applicability (and therefore the whole HARD gate) depends on knowing whether a slice *has*
auth / voice / supabase / third-party-content / address-or-abn / email. If the feature set
is wrong, conditional-HARD checks get wrongly skipped (false GO) or wrongly applied (false
NO-GO).

- **Options:** (a) **auto-detected** from a repo/deploy scan (grep for `@caistech/elevenlabs-convai`,
  an auth route, `supabase/`, etc.); (b) **operator-declared** at ingestion on the card;
  (c) **hybrid** — auto-detect proposes, operator confirms/overrides.
- **Rec:** (c) hybrid — auto-detect is cheap and catches drift, operator confirmation stops a
  missed import silently disabling a HARD check. Store the final set on
  `methodology_hypothesis_cards.features` (text[]).
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

### Q2 — High/Med/Low weight → points, and the 0–10 normalization
The workbook deferred the exact arithmetic to "calibrate after the first real run." Need a
**starting** mapping so the engine produces a number on day one.

- **Options / starting point:** High=3 / Med=2 / Low=1 per the worklist; score =
  (Σ earned weight ÷ Σ applicable weight) × 10. Recalibrate the High/Med/Low ratio and the
  band cut-points after the first real card runs.
- **Open sub-question:** do REDESIGN/NO-GO bands stay 6.5 / 5.0 after calibration, or do you
  want to set them only once you've seen one real distribution?
- **Rec:** ship High=3/Med=2/Low=1 + proportional×10 + the 6.5/5.0 bands as the **provisional**
  default; flag the first 3 real scores for a calibration review before trusting the band.
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

### Q3 — Missing-evidence policy (a check whose audit hasn't run yet)
A WEIGHTED check (e.g. naive-tester live PASS) with **no recorded result** — is it a fail, an
N/A, or does it **block scoring** until the audit runs? This is the single biggest behavioural
choice: it decides whether an un-tested slice can score GO.

- **Options:** (a) **block** — no score until every applicable check has a recorded result
  ("the harness proves, it doesn't assume"); (b) treat missing as **fail** (counts against);
  (c) treat missing as **N/A** (silently drops from the denominator — dangerous: an untested
  slice could score GO on a handful of auto-probes).
- **Rec:** (a) **block for HARD checks** (no naive-tester PASS recorded ⇒ HARD gate cannot
  pass ⇒ no score), and **fail for WEIGHTED checks** (missing evidence counts against, never
  silently drops). Never (c). This is the whole point of "prove, don't trust."
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

### Q4 — TOO-MUCH guard (P4): consequence?
Scale-infra present pre-GO (team admin / billing / full settings) is the inverse failure. The
worklist calls it a "flag."

- **Options:** (a) **surface as a non-blocking flag** on the card; (b) **dock** the weighted
  score; (c) **hard block** the Launch button.
- **Rec:** (a) non-blocking flag — over-build wastes operator hours but doesn't invalidate the
  *validation signal*, so it shouldn't block the outreach. Surface it loudly on the card so it
  gets trimmed, not as a gate.
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

### Q5 — Promise-attribute (#9) rollup
Check #9 is one WEIGHTED line, but each product has **multiple** "X not Y" bars
(`promise-attributes.json`, ~89 across 20 products). How do the per-attribute verdicts combine
into #9's single contribution?

- **Options:** (a) **all-or-nothing** (#9 passes only if every attribute hits its bar);
  (b) **proportional** (#9 earns the fraction of attributes that pass); (c) **weighted**
  (attributes carry their own High/Med/Low).
- **Rec:** (b) proportional, with a **floor** — if any *load-bearing* attribute (you mark which)
  is below bar, #9 caps at REDESIGN regardless. Pure all-or-nothing is too brittle for a slice
  with 5 bars; pure proportional lets a dead headline feature slide.
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

### Q6 — Source precedence when multiple audits cover one check
`readiness_results.source` ∈ {auto, naive-tester, voice-auditor, judge}. Some checks are
reachable by more than one (e.g. voice presence: auto-probe *and* voice-auditor). Which wins
if they disagree?

- **Rec:** **most-authoritative-wins**, ordered: a live human/agent pass (naive-tester /
  voice-auditor live) > judge (LLM) > auto-probe. Record all, score the top one, surface the
  disagreement as evidence. (This also resolves the SDK-vs-CDN voice false-negative class —
  the live voice-auditor PASS outranks the auto-probe that checked the wrong signature.)
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

### Q7 — Re-score trigger
On-demand only, or auto-invalidate?

- **Options:** (a) **on-demand** (operator hits "Re-score"); (b) **auto-invalidate** the
  snapshot when a new `deployment_id` appears or a new `readiness_results` row lands, then
  recompute; (c) both.
- **Rec:** (c) — compute on demand *and* mark a snapshot **stale** (don't auto-recompute
  silently) when a newer deployment or audit result exists, so the card visibly says "score is
  for an older deploy — re-score." Cheap, and stops a stale GO firing outreach.
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

### Q8 — NO-GO override authority + logging
Gate 1 can block the Launch button. Per Rule 16 / the personal-interest override lane, you can
greenlight anyway.

- **Question:** is the Gate-1 (MVP-ready) override the **same** reasoned-+-logged override
  mechanism as the Gate-0 intake override, and does an override on a HARD-gate failure require
  a stronger reason / a second confirm than overriding a weighted-band miss?
- **Rec:** reuse the existing reasoned-override ledger; **allow** override of a weighted-band
  NO-GO with a logged reason, but **require an explicit "I understand this HARD check failed:
  <check>" confirm** to override a HARD-gate failure (responsive / real title / secrets / env
  hygiene — the things that make a demo embarrassing or leak a key). HARD failures are exactly
  the ones you don't want one-click-waived.
- **Decision:** ✅ LOCKED 2026-05-27 — recommendation adopted.

---

## Once these are answered

The engine is fully specified and build #1 proceeds in the cockpit (Corporate-AI-Solutions),
in the order already in `HARNESS_BUILD_WORKLIST.md` #1: migration (`applies_when` column +
`features` + `readiness_results`) → `score.ts` → `POST /score` → detail render → wire
`/naive-tester` + `/voice-auditor` to write per-check results. Then build #2 (kill the
`mvp_ready` tickbox — derive it from the HARD gate + GO band) falls out for free.
