# Session Summary — 2026-06-02/03

## Headline
Drove **deal-findrs** from **TEARDOWN (11/14)** to a green **RENOVATION** gate, unlocking the
downstream validation pipeline (Steps 4–7) on the cockpit card. The product itself was rebuilt to a
coherent distributor model (Sonnet design-build, PR #8); the final gate advance was a **logged,
reasoned manual override** (P3 is a known survey miscalibration for distributor GTM, see Track B).

Along the way we found and fixed **the highest-value bug of the project so far**: the cockpit card
never reflected new verdicts because the API route's server-side Supabase reads were being served
from Next.js's fetch cache. This was the root cause of the "card won't update after a survey"
symptom seen repeatedly across multiple sessions.

---

## What shipped (deal-findrs)
- **PR #8 (Sonnet)** rebuilt the product to the distributor/reseller model: a dedicated `/partners`
  page (named distributor archetype, channel economics, three-actor model), a real
  `/api/partners/contact` route, `007_partner_inquiries.sql` migration, and a rewritten landing.
- Build broke once on a **lucide `Handshake` icon** absent in 0.383.0 → swapped to `Users` → green.
- Merged to main via a **clean `git reset --hard origin/main` + `git merge --squash`** (after a
  drift-induced conflict on the first attempt). Prod deployed (`65ef8e3`).
- Survey #13 scored the new site at **13/14** (up from 11) with **P2 now passing** — the distributor
  model is evidenced. Only P3 / prospect-type still flagged (the calibration issue).
- **Gate advanced via manual override** row in `pipeline_gates` (is_override=true,
  recorded_by='dennis-manual', reason starts "RENOVATION", result.verdict='RENOVATION',
  preHard.passed=true). Honest audit trail: the card shows both the real 13/14 verdict AND the
  override rationale.

## The bug that ate the day (now FIXED + pushed)
**Symptom:** card stuck on an old verdict; raw API returned a stale `survey_gate` even with hard
refresh and `?t=` cache-buster.
**Eliminated:** two-Supabase-project mismatch (URL + service-role key both confirmed
`tfgtfhwvrswjvkyeyvsp`); stale deployed code (deployed commit confirmed current, `574b8fd`); response
caching (`?t=` didn't help). Runtime logs proved the route's OWN query returned the stale row, while
the identical query in the SQL editor returned the newest row — same DB, two answers.
**Root cause:** Next.js App Router caches server-side fetches (Supabase uses fetch); the
`pipeline_gates` query result was frozen in the data cache. `Cache-Control: no-store` on the response
does NOT opt internal fetch reads out of the data cache.
**Fix (pushed, verified):** added to `src/app/api/admin/pipeline/[productId]/route.ts`:
```
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
```
After deploy, the route read fresh and the card flipped to RENOVATION. **`fetchCache =
'force-no-store'` is the decisive line.**

---

## State at end of session
- deal-findrs: **RENOVATION** (via override). Downstream Steps 4–7 unlocked. Currently exploring the
  validation stage (compliance + validation test cells) as reconnaissance for the orchestrator.
- deal-findrs **spec fields are partially stale** — Distributor ICP / Distributor Outcomes still say
  the old "...for their teams" text; Prospect Type / Geography also lag the rebuilt product. Fine for
  deal-findrs (overridden), but they should be synced before a clean re-survey, and the underlying
  sync gap matters for the next product.

## TO COMMIT (staged in /mnt/user-data/outputs)
1. **route.ts cache fix** — ALREADY PUSHED to corporate-ai-solutions main (verified live). No action;
   `route.ts.prior-session` kept only for diff reference.
2. **design-build.yml** → commit to **cais-shared-services** main. Carries all session hard-rules:
   Supabase `as never` typing, distinct-distributor-surface, the new **lucide-icon-must-exist** rule,
   teardown-brief extraction, model split (DESIGN_BUILD_MODEL=Sonnet, survey=cheap).
3. **bug-knowledge-2026-06-03-entries.json** → append to cais-shared-services bug-knowledge
   (3 entries: the fetch-cache bug [headline], lucide-icon, hand-merge drift).
4. Prior-session staged files still pending commit if not already done: AGENT_IN_CI_PATTERN.md,
   bug-knowledge-new-entries.json, the design-build kickoff/result routes, pipeline-gates.ts,
   eslint template files (FIX2-eslint-template-setup.md + template-eslintrc.json).

## CARRYOVER / PENDING
- **Rotate exposed `sk-ant-` + OpenCode Zen API keys** (long-standing).
- **Survey calibration fix** (Track B, high priority) — P3/prospect-type must accept a legitimate
  two-audience landing for distributor products. Affects every future distributor product.
- **lucide-react bump** in cais-build-template-v2 to a recent 0.x (NOT 1.x).
- **eslint into template** (FIX2 files staged).
- Close cosmetic stale PRs #4/#5/#6/#8 on deal-findrs (hand-merge didn't auto-close).
- Spec-field sync mechanism (the card spec should track the built product / the chain that derives it).
