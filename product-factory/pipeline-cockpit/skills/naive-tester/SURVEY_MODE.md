---
name: naive-tester · SURVEY MODE
version: 1.0.0
mode-of: naive-tester
description: |
  Evidence-reader mode. Instead of a persona walkthrough, drive a subagent through a BUILT
  product's live URL (via /browse) AND its repo working copy, and answer one question per field:
  does THIS build evidence it, with a citation? Emits survey.json — the input the survey gate
  (survey.ts / loadCardSurvey) scores into RENOVATION / TEARDOWN / INCOMPLETE-SPEC.
triggers:
  - survey mode
  - survey this build
  - evidence audit
  - run the survey gate
---

# Survey Mode — the build's evidence reader

## What this mode does (and how it differs from a naive walkthrough)

The persona walkthrough asks *"what would a human feel using this?"* — and is deliberately
naive (rule #2: do **not** read the product-under-test's repo/docs). **Survey mode is the
opposite job:** it is an **evidence audit**. For each of the 14 synched fields it asks one
narrow question — *does the live site and/or the repo actually evidence this, in this product's
own words?* — and returns a citation or nothing.

So survey mode **may read the product's repo** (it has to, to cite `path:line` for structural
fields). What it may **never** do is fill a field from the world. The line is:

- ✅ Evidence from **this site's DOM** (exact visible text) → `evidenced: true`.
- ✅ Evidence from **this product's repo** (exact `path:line`) → `evidenced: true`.
- ❌ Filling a field from **what products like this usually do**, the card you already wrote,
  your own inference, or "it's obviously a CRM so the buyer is a sales VP" → `evidenced: false`.

**No citation ⇒ false. Always. A plausible guess scores zero.**

This mode does **not** fill the `product_validation_status` columns and does **not** judge
spec-completeness — the gate reads the 14 columns straight from the DB for *presence*. Survey
mode supplies only the other half: per-field *evidence* + the PRE-HARD checks. (If the columns
are empty the gate returns INCOMPLETE-SPEC before your evidence even matters — that's expected.)

## The worked failure — DealFindrs (read this first)

DealFindrs is the calibration failure for the world-knowledge ban. Its hero sells to
*"buyers' agents & property firms"*; the actual product (esp. `/reports`) is a sell-side
development-feasibility tool for *developers/promoters* — QS reports, IRR/peak-debt, IMs. A lazy
survey reads "buyers' agents" off the hero and marks `icp_partner_type: evidenced` — **wrong.**
The page contradicts itself (hero says buyers' agents, body says "Built by developers, for
developers"), so what is *actually evidenced* is incoherent. The correct call: cite the exact
conflicting DOM strings and mark the field **`evidenced: false`** (no single, coherent,
product-stated archetype), not a tidy guess. Evidence means the build *says it, clearly, itself*
— not that you can reconstruct what it probably meant.

## The 14 fields — what counts as evidence for each

Return one entry per field. `field` MUST be the exact column code (left column below).

| `field` code           | Evidence bar — what a `true` requires (cite DOM text or repo `path:line`) |
|------------------------|---------------------------------------------------------------------------|
| `promise`              | A single, product-stated value claim a visitor sees (hero / value prop). Not your paraphrase. |
| `friction`             | The pain/old-way the product names it removes — stated on the site or in onboarding copy. |
| `core_mechanism`       | How it actually works, evidenced by a working surface or a repo route/component, not a tagline. |
| `icp_geography`        | A named target geography stated by the product (e.g. "for Australian SDA providers"). |
| `icp_partner_type`     | The **Prospect Type** — a single coherent named archetype the product states (see DealFindrs: conflicting audiences ⇒ false). Column is **not** renamed; this is its display alias only. |
| `icp_buyer_title`      | A named buyer role the copy/IA targets (e.g. "for Heads of Compliance"), not inferred from category. |
| `icp_verticals`        | Named vertical(s) the product calls out, not "any industry". |
| `icp_company_size`     | A stated size/segment ("teams of 10–50", "enterprise"), product's words. |
| `icp_stage`            | A stated business stage the product targets (seed / growth / scale / enterprise). |
| `exclusions`           | A stated "not for X" / out-of-scope boundary, or a clearly bounded scope the product declares. |
| `distributor`          | The named distributor archetype the product is sold THROUGH (Rule 15), evidenced in distributor-benefit-framed copy — see the distributor rule below. |
| `distributor_outcomes` | What the distributor can now sell/earn — stated in distributor-benefit terms ("let your brokers close X"). |
| `end_user`             | The named end-user the distributor serves, evidenced in end-user-framed in-product copy. |
| `end_user_outcomes`    | The end-user's outcome, stated in the product (not the distributor's outcome restated). |

### The distributor rule (the high bar — reuse P2's standard)

`distributor` / `distributor_outcomes` / `end_user` / `end_user_outcomes` only score `true` when
**both** framings are present and distinct:

1. **Distributor-benefit-framed marketing** — copy that sells the distributor on what they can
   now offer/earn (a *named archetype*, never "SMBs" / "businesses" / "users" — the same bar as
   PRE-HARD **P2**), AND
2. **End-user-framed in-product copy** — the product, in use, speaks to the end-user the
   distributor serves.

If the product only ever addresses one undifferentiated "user", the distributor model is **not
evidenced** — mark the distributor fields `false` and let it fall to TEARDOWN. "SMBs" or
"businesses" as the distributor is an automatic `false` (it is itself the P2 failure).

## The PRE-HARD checks — emit P1–P4

These come from the ratified gate-readiness catalogue (`gate-readiness/criteria.json`). Emit a
`status` (`pass` | `fail` | `unknown`) + a one-line `evidence` for each. **P1/P2/P3 gate the
verdict** (any non-`pass` → TEARDOWN); **P4 is informational** (recorded + surfaced, never gates —
it is the TOO-MUCH guard, mirroring score.ts).

- **P1 — MVP link live (HTTP 200).** `AUTO`. The build's URL must answer 200. (The loader also
  checks this live; report what you observed so the two agree.) No live link ⇒ `fail`.
- **P2 — Named distributor archetype on the card, not "SMBs".** `JUDGE` · Rule 15. Same bar as the
  distributor rule above. "SMBs"/"businesses" ⇒ `fail`.
- **P3 — The four gate questions answered non-hand-wavily.** `JUDGE` · BizModel §3. The product/
  card must answer, concretely: **(1)** Who is the distributor? **(2)** Why them — what does it let
  them sell that they can't today? **(3)** Why this problem, why now? **(4)** How does it grow
  *their* business? Any hand-wavy answer ⇒ `fail`.
- **P4 — "Too much" guard: scale-infra ABSENT pre-GO.** `TOO-MUCH` (informational). `pass` =
  scale-infra correctly absent (good). `fail` = over-built before validation (a flag, not a block).

## Output — survey.json (exact shape the gate consumes)

Write `survey.json` and POST it to the survey route. The shape is consumed verbatim by
`src/app/api/admin/pipeline/[productId]/survey/route.ts` → `loadCardSurvey` → `survey.ts`:

```json
{
  "fields": [
    { "field": "promise",              "evidenced": true,  "evidence": "Hero: \"Score every NDIS SDA deal in 60 seconds\" (DOM, h1.hero-title)" },
    { "field": "friction",             "evidenced": true,  "evidence": "Subhead: \"Stop rebuilding the same feasibility spreadsheet\" (DOM)" },
    { "field": "core_mechanism",       "evidenced": true,  "evidence": "src/app/reports/page.tsx:31 — RAG→QS→Valuation pipeline" },
    { "field": "icp_geography",        "evidenced": false, "evidence": null },
    { "field": "icp_partner_type",     "evidenced": false, "evidence": null },
    { "field": "icp_buyer_title",      "evidenced": false, "evidence": null },
    { "field": "icp_verticals",        "evidenced": true,  "evidence": "Footer: \"For property developers & promoters\" (DOM)" },
    { "field": "icp_company_size",     "evidenced": false, "evidence": null },
    { "field": "icp_stage",            "evidenced": false, "evidence": null },
    { "field": "exclusions",           "evidenced": false, "evidence": null },
    { "field": "distributor",          "evidenced": false, "evidence": null },
    { "field": "distributor_outcomes", "evidenced": false, "evidence": null },
    { "field": "end_user",             "evidenced": false, "evidence": null },
    { "field": "end_user_outcomes",    "evidenced": false, "evidence": null }
  ],
  "pre_hard": {
    "P1": { "status": "pass", "evidence": "GET https://deal-findrs.vercel.app → 200" },
    "P2": { "status": "fail", "evidence": "No named distributor archetype; hero conflicts (buyers' agents vs developers)" },
    "P3": { "status": "fail", "evidence": "Q1 distributor unanswered; product addresses one undifferentiated user" },
    "P4": { "status": "pass", "evidence": "No scale-infra surfaced pre-GO" }
  }
}
```

Rules for the emit:
- Exactly the 14 `field` codes above, each once. A field you couldn't evidence is
  `{"evidenced": false, "evidence": null}` — never omit it, never invent it.
- `evidence` for a `true` is the **exact** DOM string (quote it) or repo `path:line`. No paraphrase.
- `pre_hard` keys are `P1`–`P4`; each `{ "status": ..., "evidence": ... }`. A check you genuinely
  couldn't run is `"unknown"` (which, for P1/P2/P3, blocks just like a fail).

### Recording (deployment-bound)

The verdict is computed once by the cockpit route (it runs survey.ts). To bind the record to the
exact build you surveyed, resolve the live deployment first, then POST it alongside the evidence:

```bash
# 1. live prod deployment id for this slug (existing gate-check.mjs verb — no new verb needed)
DEP=$(node scripts/gate-check.mjs prod-deployment <product-slug> | sed -n 's/.*deployment[: ]*\([a-zA-Z0-9_]*\).*/\1/p')

# 2. POST survey.json + the deployment id → the route scores + records the gate, bound to DEP
curl -sS -X POST "$COCKPIT_BASE/api/admin/pipeline/<product-slug>/survey" \
  -H 'Content-Type: application/json' \
  -d "$(jq --arg d "$DEP" '. + {deployment_id:$d}' survey.json)"
```

```
POST {COCKPIT_BASE}/api/admin/pipeline/{product-slug}/survey
Content-Type: application/json
{ ...survey.json, "deployment_id": "<live prod deployment id>" }
```

The route supplies spec-presence (the 14 DB columns) + the live P1 URL check itself, runs the
scorer, and records the verdict to `pipeline_gates` as `gate: 'survey'` (PASS only on RENOVATION),
**bound** to `deployment_id`. Omit `deployment_id` (e.g. an ad-hoc cockpit run) and it records
unbound/provisional. The CLI does **not** record the survey itself — survey.ts is the single
scorer and lives in the cockpit, so recording flows through the route (plan §3 edit #2, Option 1).

## Calibration — iterate before you trust the number

Run survey mode against two known fixtures and confirm the verdict matches before trusting it on a
new product:

1. **DealFindrs (today) → INCOMPLETE-SPEC.** All 14 columns are null on the card, so the gate
   short-circuits to INCOMPLETE-SPEC regardless of evidence. Confirm your emit doesn't fabricate
   coherence the site doesn't have (the hero/body ICP conflict ⇒ `icp_partner_type: false`, P2/P3
   `fail`). This is the world-knowledge-ban regression test.
2. **A known-good product → RENOVATION.** Pick a build whose card is fully filled and whose site
   plainly evidences ≥ 12/14 with P1/P2/P3 passing; confirm RENOVATION. If a clearly-good build
   scores TEARDOWN, your evidence bar is too strict (or you're demanding DOM where a repo cite is
   the honest evidence) — tune, then re-run #1 to make sure you didn't loosen the world-knowledge
   ban in the process.

## Hard rules — what makes a bad survey run

- ❌ Marking a field `true` from inference, the existing card, or category knowledge (the
  DealFindrs trap). No citation ⇒ false.
- ❌ Paraphrasing the evidence instead of quoting the exact DOM string / `path:line`.
- ❌ Resolving a self-contradicting site into one tidy archetype (cite the conflict, mark false).
- ❌ Scoring the distributor fields on one undifferentiated "user", or accepting "SMBs".
- ❌ Omitting a field, inventing a 15th, or renaming `icp_partner_type` (display alias only).
- ❌ Emitting a shape the route can't parse — keep `fields[]` + `pre_hard{}` exactly as above.
