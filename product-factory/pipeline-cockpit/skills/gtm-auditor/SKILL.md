---
name: gtm-auditor
version: 0.1.0
description: |
  GTM distribution-loop auditor — the marketability analog of naive-tester and
  voice-auditor. Audits a product against the structural-distribution framework
  (Cursor/Replit/Lovable/Anthropic): does the product's output create the next
  user? Scores three dimensions — output visibility, trust artifact, loop
  completeness — through a lane-aware "whose brand travels" gate so white-label
  distributor products are never told to stamp CAS branding. Produces a GTM gap
  report whose headline contribution is EVIDENCE into the §5 methodology rubric's
  distribution-leverage dimension (D3), plus the GTM assets each fix unlocks.
  Two phases: a repo scan (static) + an optional live /browse pass. NON-BLOCKING
  by design (v0.1) — recommendations go to a review inbox, not a sign-off gate.
  Use when asked to "gtm audit", "distribution audit", "marketability review",
  "does the output create the next user", or "audit distribution loops".
allowed-tools:
  - Skill
  - Bash
  - Read
  - Glob
  - Grep
  - Write
  - Agent
  - AskUserQuestion
  - WebFetch
triggers:
  - gtm audit
  - distribution audit
  - marketability review
  - audit distribution loops
  - does the output create the next user
---

# GTM Auditor — distribution-loop auditor

## What this skill does

The marketability analog of `/naive-tester` (human UAT) and `/voice-auditor`
(voice placement). Where those audit quality and voice, the GTM auditor audits
**one thing only: does this product's output create the next user?** It maps each
product's distribution loop, scores three dimensions, and for every gap emits a
specific, buildable change *plus the GTM asset that fix unlocks* (a proof
artifact, a partner-facing output, a LinkedIn hook). It is the only eval agent
that produces distribution value just by running.

It does **not** evaluate product quality, UI, test coverage, or voice — those are
the siblings' jobs. It does **not** evaluate scaling/infra readiness (multi-tenant,
cost-ceiling, lane-1 two-tier shape) — that is deliberately out of scope for v0.1.

**Status (v0.1): NON-BLOCKING.** This runs to *generate* output we review. It is
NOT a sign-off gate, NOT a blocker on any build or ship, and its recommendations
do NOT auto-inject into the build backlog — they land in the report for human
triage. Do not gate anything on it until we've reviewed real outputs and decided.

Read these once at the start (the canonical GTM context):
- **`~/PycharmProjects/cais-shared-services/BUSINESS_MODEL.md`** §2 (the four lanes), §3 (distributor-first / Rule 15), §5 (the scoring rubric — **your output feeds dimension D3**). This is the rubric your loop score contributes to.
- `~/PycharmProjects/cais-shared-services/portfolio-manifest.yaml` — the *current* product list, display names, lanes (from entry comments), and per-product status fields. **Derive the portfolio from here, not from any hardcoded table.**
- `~/.claude/CLAUDE.md` → "@caistech SHARED-SERVICES FIRST", the white-label pivot note, and the MMC client-no-branding rule.
- memory `project_monetisation_lanes`, `project_white_label_byok_pivot`, `project_mmcbuild_no_branding`, `project_paused_2026_05_16`.

## Step 0 — the lane-aware "whose brand travels" gate (RUN FIRST)

The structural-distribution framework assumes "output carries *product* attribution
= good." That is **wrong for white-label distributor products** and **forbidden for
client products**. Before scoring, classify the product into one brand-mode and
audit the loop *relative to the correct brand*:

| Brand-mode | Applies to | Audit the loop for… | Never recommend |
|---|---|---|---|
| **cas-attribution** | Lane-4 BYOK-free products + CAS's own funnel tools (e.g. InvestorPilot, Easy Claude Code, CQR, Platform Trust) | CAS attribution that drives inbound to CAS ("Built with / Powered by", public proof artifacts, badges) | — |
| **distributor-attribution** | Lane-1 white-label distributor SaaS (e.g. Singify, RaiseReady-template verticals) | the **distributor's** brand travelling + creating *their* next user (Rule 15 "grows *their* business") | CAS branding on the distributor's deployment |
| **client-owned / out-of-scope** | Paying-client builds (MMC Build + any contracted build) | nothing — flag out of scope; the loop belongs to the client | any CAS branding, any public artifact (R3 sanitise) |

Determine the mode from: the manifest entry's lane comment → BUSINESS_MODEL §2 →
the memory files above. **If the lane is ambiguous, do NOT guess CAS branding** —
mark the product `lane-unconfirmed`, default to the conservative read, and surface
the ambiguity in the report (or `AskUserQuestion` if running interactively).

A "2" on output visibility requires the output to carry the **brand-mode-appropriate**
attribution — not just "any attribution." Distributor product with CAS branding
stamped on it is a *defect*, not a 2.

## The framework (evaluation standard)

Four companies hit scale via compounding distribution loops, not marketing:
Cursor (visible performance gain → word of mouth), Replit (shared project = built-in
demo), Lovable ("Built with Lovable" ships with every app), Anthropic (research
artifact → trust → champion before the ask). Three leaks to detect:

- **Non-travelling output** — the output stays inside the tool → Output Visibility = 0.
- **Missing trust layer** — no shareable proof before the ask → Trust Artifact = 0.
- **Premature ask** — outreach happens before proof is visible → Loop Completeness = 0.

## Scoring rubric (three dimensions, 0–2 each, total /6)

**1. Output visibility** — does the output leave the tool, with brand-appropriate attribution (per Step 0)?
- 2 = leaves the tool AND carries the correct (CAS / distributor) attribution.
- 1 = leaves the tool but attribution absent/optional/wrong-brand.
- 0 = output stays inside the tool.

**2. Trust artifact** — does a shareable proof asset exist *before* the ask?
- 2 = exists, shareable, positioned before the ask.
- 1 = exists but locked inside the product or post-ask.
- 0 = none; the ask happens cold.

**3. Loop completeness** — closed path from user action to next user?
- 2 = full loop: user action → output → external person sees it → path back in exists.
- 1 = partial — breaks at visibility or re-entry.
- 0 = no loop; output has no path to a non-user.

Total ≤ 3 → flag **HIGH PRIORITY**. Be conservative — a 2 requires the behaviour
present and working in production, not planned.

## Phase 1 — repo scan (always)

Static pass over the repo. No live URL needed.

1. **Load context** (Step 0 docs + the repo's `README.md` / `project.md` / `.context/` / any `products/<slug>` config).
2. **Find every external output.** Grep for: PDF generation (`pdf`, `puppeteer`, `jsPDF`, `react-pdf`, `@react-pdf`, `report-generator`), email sends (`resend`, `nodemailer`, `Resend`), exports (`download`, `export`, `generate`, `toBlob`, CSV/XLSX), shared/public routes (`app/share/**`, `app/(public)/**`, signed URLs, OG routes).
3. **Map the loop explicitly** (user action → output → external recipient → path back in) and **flag which step breaks.**
4. **Identify the recipient class** (sets the reach multiplier): certifier/council/financier (3×) · client/subcontractor/partner (2×) · end-user only (1×).
5. **Run the landing-story check** (below) — it's the trust-artifact's front door.
6. **Score** each dimension through the Step-0 brand gate.
7. Emit the **GTM gap report** (schema below).

### Landing-story sufficiency (the cold-visitor test)

The product's landing/marketing page is the trust artifact a cold visitor — and a
prospective **distributor** — meets first. The test, applied to the page copy
*alone* (title, meta, hero, headings — read what's actually rendered, not the repo
docs or your own prior knowledge of the product):

> **Can a cold visitor state, from this page alone: (a) the objective — what it is /
> does, (b) the end-user value, and (c) the distributor value — who would onsell it
> and how it grows *their* business?**

This is gate-criteria **#5 ("landing page sells the concept")** + **#6 (emotional
register)** made concrete, and it is load-bearing here: *if you can't understand the
product from its page, neither can a visitor.* Score each of the three sub-questions
✅ / ⚠️ / ❌ and roll the result into **Trust Artifact** (a page that doesn't tell
the story is a broken trust artifact, capped at 1) and **Output Visibility**.

**The distributor line is the most-missed piece** (Rule 15: you sell to
distributors). A page that nails objective + end-user but never names the
white-label/distributor angle scores ⚠️ on (c) — flag it with the fix: add a hero
line naming the distributor, on the pattern of the portfolio's exemplars
(Connexions "white-label generator", RaiseReady, DisasterSupport "for recovery
agencies", rehearsals-ai "for professional associations").

**Failure modes to flag explicitly** (each is a finding, not a nicety):
- **Blank / "Loading…" shell** — client-rendered page with no SSR story. ❌ all three.
- **Buzzword-vague** — can't tell what it actually *does*. ❌ objective.
- **Self-disowning demo** — "this is not the real service, visit the real one." ❌ — split identity.
- **Single-client instance on a public tile** — branded to one operator (no generic product story). The fix is usually **marketplace routing** (point the tile at a product page), not a copy rewrite.
- **"Not for distribution" sketch on a public marketplace** — the fix is **delist**, not rewrite.

## Phase 2 — live pass (optional; run when a live/preview URL is given)

Spawn a `general-purpose` Agent that uses `/browse` to validate the loop against
the rendered product: does the output *actually* leave the tool to an external
person, and does that person *actually* have a path back in? Screenshot the output
artifact and any "share"/"send"/"export" surface. Static code can show a PDF route
exists; only the live pass confirms the artifact travels and the re-entry path is
real (a "Powered by" link that 404s breaks the loop). Output: a "live validation
delta" appended to the report.

## Output — the GTM gap report

Write to `./gtm-audit/{YYYY-MM-DD-HHMM}/{repo-slug}.md`:

```markdown
# GTM Gap Report — {Product} ({repo})
**Run date:** YYYY-MM-DD · **Brand-mode:** {cas-attribution | distributor-attribution | client-owned/out-of-scope | lane-unconfirmed}
**Priority:** HIGH / MEDIUM / LOW · **Total score:** N/6 · **Reach multiplier:** 1× / 2× / 3×

## Scores
| Dimension | Score | Status |
|---|---|---|
| Output Visibility | N/2 | ✅ / ⚠️ / ❌ |
| Trust Artifact | N/2 | ✅ / ⚠️ / ❌ |
| Loop Completeness | N/2 | ✅ / ⚠️ / ❌ |

## Landing-story (cold-visitor test)
- **Objective clear?** ✅/⚠️/❌ · **End-user value clear?** ✅/⚠️/❌ · **Distributor value named?** ✅/⚠️/❌
- **Verdict:** {tells the story / partial / fails} — {one line; if fails, which failure mode}
- **Fix:** {copy rewrite / add distributor hero line / marketplace re-route / delist}

## Loop map
- **User action:** …
- **Output created:** …
- **Seen by (recipient class):** …
- **Path to next user:** … [or: BREAKS HERE — {step}]

## Gaps
### Gap 1 — {dimension}
**Description:** … **Recommended change:** {specific + buildable} **Effort:** S / M / L
**GTM asset generated:** {proof artifact / partner-facing output / LinkedIn hook}

## GTM assets unlocked by fixing all gaps
- …

## §5 methodology-rubric feed (D3 — distribution leverage)
**D3 evidence:** {one line the methodology rubric can ingest — e.g. "distributor-attribution
loop partial: product gives the distributor a shareable Fit Report to onsell with → positive
onsell signal, but no re-entry path → D3 evidence = moderate."}
**Suggested D3 contribution:** {weak / moderate / strong} signal toward the §5 distribution-leverage gate.

## Recommended gtm_loop_status: {strong | partial | absent | out-of-scope | unaudited}
```

For a multi-repo sweep, after all reports also emit `summary.md`:

```markdown
# Portfolio Priority Stack
| Rank | Product | Score | Brand-mode | Top gap | Effort | Reach× | Ranked by (6−score)×reach |
|---|---|---|---|---|---|---|---|

## Highest-ROI fix
{single highest-impact, lowest-effort change across the portfolio}

## Compounding sequence
{order of fixes where one enables/amplifies the next}

## §5 D3 feed summary
{per-product D3 evidence line, ready to drop into the methodology rubric}
```

Portfolio rank = `(6 − score) × reach_multiplier`. Then propose a `gtm_loop_status`
value per product for `portfolio-manifest.yaml` (apply only if asked — this is a
status field, additive, mirroring `voice_agent_status`).

## When it runs (v0.1 — generate, don't gate)

- **Ad hoc across a handful of products** to see what it generates (current mode).
- Later, if it earns its keep: on a new product, on a major output change, monthly across Tier-1, and before a partner-outreach campaign — and only *then* consider wiring it as a gate or a scheduled runner. Not before we've reviewed outputs.

## Hard rules

- **Brand gate first, always.** Never recommend CAS attribution on a distributor (lane-1 white-label) product; never recommend any public artifact for a client product (MMC) — flag out-of-scope.
- **Derive the portfolio from the manifest**, not from any hardcoded table — the brief's table is stale (MMC split + own team + client-no-branding; PartnerPilot/TenderWatch et al. paused).
- Every gap gets a **specific buildable change + an effort estimate + the GTM asset it unlocks** — never a generic suggestion.
- **Conservative scoring** — a 2 requires the behaviour live in production, not planned.
- **Don't over-call loops.** A product whose value genuinely doesn't travel (a private internal tool) is correctly a low score with `out-of-scope` recommendations, not a forced loop.
- **NON-BLOCKING.** Do not gate any build/ship on this skill's output in v0.1. Do not auto-inject recommendations into the backlog.

## Output location

```
./gtm-audit/{YYYY-MM-DD-HHMM}/
  ├── {repo-slug}.md
  ├── summary.md       ← multi-repo sweep only (Portfolio Priority Stack)
  └── screenshots/     ← Phase 2 only
```

Default to the current working directory. Multi-repo sweep → `~/gtm-audit/{timestamp}/`.
