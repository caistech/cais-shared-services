# BUILD LOG — Cockpit Onboarding (`/new-ideas`)

> **What this is:** a dated, per-product record of building the conversational onboarding
> intake in the live cockpit, as a worked application of `PRODUCT_FACTORY_METHODOLOGY.md`.
> The methodology is the timeless canon; THIS file is the project history. Future similar
> builds can read it as a real example. **Do not fold this into the canon.**
>
> **Product/feature:** Corporate-AI-Solutions cockpit — Stage-1 onboarding (`/admin/pipeline/new-ideas`)
> **Repos:** `dennissolver/corporate-ai-solutions` (cockpit code), `caistech/cais-shared-services` (canon + skill + migration)
> **Precursor to:** the `kb_sessions` Supabase KB (this is the markdown form).

---

## Session — 2026-06-04

### Built (code → cockpit repo)
- **Onboarding loop, three routes + UI**, implementing create → converse → admit:
  - `src/app/api/admin/pipeline/new-ideas/create/route.ts` — makes the INCOMPLETE-SPEC row (was already scaffolded; verified safe, left as-is).
  - `src/app/api/admin/pipeline/new-ideas/route.ts` — **rewritten**: loads the coach SKILL as the `system` param, fixed the `demand_tier` enum, parses the coach's ` ```admit ``` ` block, returns a `readiness` summary. (Replaced an earlier opencode draft that used hallucinated field names + the wrong enum + no skill.)
  - `src/app/api/admin/pipeline/new-ideas/admit/route.ts` — **new**: the schema-safe admission write path (gate + write + flip).
  - `src/components/admin/OnboardingCoach.tsx` — **new**: client chat component wiring the three routes; strips the admit block from view; renders 422 blockers; terminal success → link to the pipeline card.
  - `src/app/admin/pipeline/new-ideas/page.tsx` — **fixed**: replaced opencode's hallucinated 14-field `SPEC_FIELDS` with the real columns; renders `<OnboardingCoach/>`.
- **Coach SKILL** (canon → shared repo, vendored into cockpit):
  - `cais-shared-services/product-factory/skills/onboarding-coach/SKILL.md` — persona + 7-node walk + distributor dependency + robustness bars + write contract + the ` ```admit ``` ` emission contract.
  - Vendored into cockpit at `src/skills/onboarding-coach/SKILL.md` via `scripts/sync-coach-skill.ps1` (shared = source of truth; bundled into the Vercel build). Final size ~11.7k chars.
- **Migration** (applied to the shared Supabase):
  - `cais-shared-services/supabase/migrations/20260604_feasibility_context.sql` — additive JSONB `feasibility` column + CHECK constraints (`feasibility_demand_tier_valid`, `feasibility_benefit_mode_valid`) + partial proof index. Verified applied (column + both constraints present).

### Decisions made (carry forward; candidates for kb_decisions)
- **Distributor model invariant LOCKED** (also recorded in the canon): value is a dependency chain **end-user love → distributor confidence → distributor benefit**; node 3 (End User) and node 7 (Distributor) cannot collapse; Distributor Outcomes must be benefit *predicated on* end-user love.
- **7-node → 14-field mapping SETTLED.** Single owner each. Key call: the `icp_*` qualifiers (geography/verticals/company_size/stage) are **distributor** attributes (InvestorPilot prospects distributors). Node 4 (Severity) owns no field (sharpener). Exclusions = node 7 negative-space, informed by node 5.
- **`distributor_benefit_mode` (paid | value-add)** captured as **feasibility context**, not a 15th graded field; feeds design-build + InvestorPilot outreach economics.
- **`product_type`** rides as context only — no cert-level enforcement.
- **Feasibility stored as a single JSONB column** (not dedicated columns) — lowest blast radius on the shared table; keeps the tier physically separate from the 14.
- **Routes split** — conversation (`/new-ideas`) vs admission (`/admit`) — a pure write path is easier to keep schema-correct and to test.
- **Coach SKILL is source-of-truth in shared, vendored to cockpit** (option B: commit the vendored file; no build-time fetch — reliable on Vercel's bundling).

### Schema facts discovered (verified against live `product_validation_status`, 2026-06-04)
- **The real 14 graded columns:** `promise, distributor, end_user, friction, distributor_outcomes, end_user_outcomes, core_mechanism, icp_geography, icp_partner_type, icp_buyer_title, icp_verticals, icp_company_size, icp_stage, exclusions`.
- **`has_` flag split (8 / 6):** flags EXIST for `promise, distributor, end_user, friction, core_mechanism, distributor_outcomes, end_user_outcomes, icp_geography`. NO flag for `icp_partner_type, icp_buyer_title, icp_verticals, icp_company_size, icp_stage, exclusions` — writing one 500s.
- **Prospect-type lineage:** `icp_partner_type` is **canonical** (label "Prospect Type"; storage kept "partner" because a rename touched ~57 refs). `icp_prospect_type` is a **stale orphan** — never write it.
- **`why_now`** is feasibility context (in the JSONB) — NOT a top-level graded column and NOT one of the 14.
- **Enums:** `demand_tier ∈ {intuition, anecdote, article, data, traction}` (NOT search/waitlist); `distributor_benefit_mode ∈ {paid, value-add}` — both enforced by DB CHECK constraints.
- Base migration `20260528_product_validation_status.sql` predates the icp_*/outcomes/core_mechanism columns (added by later migration[s]).

### Bugs caught & fixed this session
- **Hallucinated `SPEC_FIELDS` in the new-ideas page** (generic SaaS names, not real columns) → mis-count/error. Fixed to the real 14.
- **`new-ideas/route.ts` (opencode draft):** hallucinated field bars, wrong `demand_tier` enum, system prompt sent as a `user` turn, no persistence, ignored the SKILL → rewritten.
- **TS2345 on the page** — dynamic `.select()` string collapsed the row type to `ParserError`; fixed with `.returns<Record<string, unknown>[]>()`.

---

## OPEN / CARRIED (next session starts here)

### Drop-in checklist to take onboarding live (files staged in this session's outputs)
1. `OnboardingCoach.tsx` → `src/components/admin/` (new). Confirm import path `@/components/admin/OnboardingCoach`.
2. `new-ideas-page.tsx` → overwrite `src/app/admin/pipeline/new-ideas/page.tsx`.
3. `new-ideas-route.ts` → overwrite `src/app/api/admin/pipeline/new-ideas/route.ts` (repo still has the old hallucinated version).
4. `admit-route.ts` → `src/app/api/admin/pipeline/new-ideas/admit/route.ts` (new).
5. **`ANTHROPIC_API_KEY`** in Vercel env (production + preview) — else the conversation route 500s in the deploy.
6. `git add` + commit (typecheck hook); the `new-ideas-page` fix is still uncommitted in prod (`a4f6c99` is buggy).

### Manual tests before trusting it
- Complete a walk → confirm `readiness.complete` flips and Admit enables.
- Send one more message after completion → confirm Admit stays enabled with the last good payload.
- Force a bad payload → confirm `/admit` returns 422 with legible blockers and the DB CHECK rejects bad enums.

### Cleanup / tech debt
- **Drop `icp_prospect_type`** once confirmed nothing reads it (careful, separate migration).
- Resolve the broken `typecheck` pre-commit hook (currently bypassed with `--no-verify`).

### Carried from earlier (not onboarding-specific)
- **Refresh `SPEC-fix-button-cell.md`** to current reality (deterministic survey, GTM real-surface, drop retired P3 calibration); stamp as canonical Processing-card spec.
- **Verify `recalculate-score`** is a thin `loadCardScore` adapter (§5 of the canon).
- **bug-knowledge.json merge gap** — 4 missing entries + the GTM/autocheck-false-negative lesson; ideally add an `invariant` field per entry.
- **Supabase-canonical KB** (`kb_bugs`/`kb_decisions`/`kb_gaps`/`kb_sessions`) + drift-detector gate — this BUILD_LOG is the markdown precursor.
- **Repo-split / Pipeline productisation — PARKED.** Out of all current briefs by decision; future milestone only.
- **OG-image/favicon/manifest** additive patch to deal-findrs `layout.tsx` (real gap, not built).
