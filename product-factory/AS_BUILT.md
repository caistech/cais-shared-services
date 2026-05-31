# Product Factory — Stage 6 Gate: As-Built

**Date:** 2026-05-31
**Scope:** the certification → punch-list → re-inspection → gate loop that decides whether
a product reaches InvestorPilot. This document is the shared context: what exists, how it
works, what is done, and what remains.

---

## 1. The idea, in one line

Drop a product idea in at the top; the factory walks it through the 7-stage house-building
lifecycle and **refuses to let it out the gate until the standards are actually met** — and
when it refuses, it says in plain language what's wrong, who fixes it, and where the fix
stands. Hard, but legible.

## 2. The house-building model (and where each stage lives)

| Stage | House analogy | In the repo |
|---|---|---|
| 1 Pre-development | vision / problem-solution | `product-factory/1-pre-development` |
| 2 Design-planning | architect | `product-factory/2-design-planning` |
| 3 Compliance | check vs known standards | `product-factory/3-compliance-standards` |
| 4 Construction | builder builds | `product-factory/4-construction` |
| 5 Certification | certifiers inspect the build | `5-certification` + the skills (naive-tester, qa, voice-auditor, gtm-auditor) |
| **6 Punch list** | **defects schedule + rectify + RE-INSPECT** | **this work — readiness_results + compute_readiness + gate-check.mjs** |
| 7 Handover / ops | occupancy cert → market | `6-handover-launch`, `7-operations`, InvestorPilot webhook |

The gap this work closed: Stage 6 existed in the vision but not the code. Certifier reports
were written as prose and never consumed; the cockpit's "mark passed" button wiped findings;
the gate scored self-attested booleans. A product could reach InvestorPilot at 80% with the
findings unread. Now the certifier verdicts are tracked, scored by a real rubric, and the
gate refuses on unmet/unverified standards with an explained blocker list.

## 3. The moving parts

### Catalogue — `readiness_criteria` (63 rows)
The rubric. One row per check: `code`, `check_label`, `tier`, `weight`, `source`,
`applies_when`. **Tier defines how a check gates:**
- `HARD` — binary gate. Fail (or unverified) blocks GO regardless of score.
- `CONDITIONAL-HARD` — gate, only when it applies (`na` = doesn't apply).
- `WEIGHTED` — scored; contributes to the % by `weight` (High=3, Med=2, Low=1).
- `CONDITIONAL-WEIGHTED` — scored, only when it applies.
- `TOO-MUCH` — inverted guard; fail = product OVER-built before GO (e.g. scale-infra too early).
- `DEFER` — known-but-not-now; excluded from gate and %.

### Punch list — `readiness_results`
One **append-only** row per certifier verdict: `product_slug`, `check_code`, `status`
(`pass|fail|na`), `source`, `evidence`, `deployment_id`, `scored_at`, plus the Stage-6
columns `payload` (routing lane), `confidence`, `blocks_gate` (manual override), `closed_at`,
`closed_by`. History-preserving: the scorer takes the **latest row per code**.

### Ledger — `pipeline_gates`
Append-only verdict ledger, one row per (product, gate) decision: `status` (`pass|fail`),
`deployment_id`, `commit_sha`, `artifact_ref` (path to the report), `is_override`,
`recorded_by`. The execution-path consumers (URL-share hook, new-product) read this to
refuse unaudited products.

### Audit — `validation_events`
Append-only trail: `event_type`, `field_name`, `old_value`, `new_value`, `actor_*`,
`reason`, `context_data`. This is the "Phase 4 audit trail" the cockpit referenced.

### Writer — `scripts/gate-check.mjs`
The single, dependency-free accessor. Key exports:
- `recordReadiness({slug, source, checks, deploymentId})` — append verdicts to readiness_results.
- `recordGate(...)` — append a verdict to pipeline_gates.
- `getLiveProductionDeployment(slug)` — what Vercel production is serving NOW.
- `hasGatePassed`, `url-share-allowed` — Delta-2 enforcement: a PASS only counts if bound
  to the live deployment. A stale build or env-only regression does not pass.

### Scorer — `compute_readiness(p_slug, p_live_deployment)` (DB function)
Reads latest-per-code from readiness_results, scopes by deployment, scores by tier, returns:
```
{ weighted_pct, gate_open, blockers:[{code,label,tier,why_blocking,lane,status,binding,evidence}],
  provisional:[...], live_deployment, computed_at }
```
- **Deployment binding:** verdict bound to the live deploy = `verified`; null-bound =
  `unbound` (counts, flagged provisional — transition state for pre-binding history);
  bound to a replaced deploy = `stale` (does NOT count; re-audit needed).
- **gate_open** = no blockers AND weighted_pct >= 80.
- **blockers** is the legible output: what / why / who (lane) / status, hardest tier first.

### Cockpit score source — `src/lib/readiness.ts`
`recomputeAndStore()` calls the RPC and writes `weighted_score_percent` so the cockpit UI
shows the same number the gate enforces (replaces the old five-boolean math in the routes).

## 4. The end-to-end flow

```
idea
  -> build (opencode)
  -> certifier walks the LIVE url (naive-tester / qa / voice-auditor)
  -> writes: the letter (human, full voice)  +  verdicts.json (machine, per-code pass/fail/na + evidence)
  -> gate-check.mjs record-readiness  (binds verdicts to the live deployment)
  -> compute_readiness scores: tier-aware, deployment-scoped, emits blocker list
  -> blockers route by lane:  code-fix -> opencode | content/substance -> founder | build-feature -> backlog
  -> fixes deploy
  -> certifier RE-RUNS  -> passing checks flip stale/unbound -> verified ; fails that are gone close on re-inspection
  -> at GO (no blockers, >=80%, hard gates verified on the live build) -> pipeline_gates PASS -> InvestorPilot
```

The close happens because the certifier re-ran and verified — never a button. A
`product-substance` finding (e.g. code 9, "does it substantiate its promise") is never
auto-closed by a re-run; only a recorded founder decision closes it.

## 5. What is DONE

- `supabase/migrations/20260531_readiness_results_findings.sql` — Stage-6 columns (captures the
  hand-run ALTER idempotently) + latest-per-code index. **Applied to the live DB.**
- `supabase/migrations/20260531_readiness_scoring.sql` — `compute_readiness` + `product_gate_status`
  view. **Applied and validated live** (singify returned gate_open=false at 88% with an explained
  blocker list — proving a high score can't buy past unverified hard gates).
- `submit-validation-results.mjs` — corrected: faithful pass/fail/na, warning/unknown skipped
  (no more `na`->`pass` collapse), passes deployment binding through.
- `src/lib/readiness.ts` — cockpit helper so stored score = RPC score.
- `certifier-emit-spec.md` — verdicts.json shape + prose->code mapping + the real
  record-readiness CLI transport.
- Duplicate `product-factory/migrations/` folder removed; `supabase/migrations/` is canonical.

## 6. What REMAINS (the wiring, all small)

1. **Commit the two migrations + helper + script** to the repo (they're authored; the DB
   already has the SQL applied, so `db push` will see them as current — idempotent).
2. **Point the cockpit routes at the helper.** In `validation/route.ts`, `phase/route.ts`,
   and the scoring tail of `run-test/route.ts`, replace the inline `SCORE_WEIGHTS` block with:
   `import { recomputeAndStore } from '@/lib/readiness'` then `await recomputeAndStore(supabase, productSlug)`.
   Remove the old boolean math. (phase/route.ts should also stop accepting `{status:'passed'}`
   from the UI — status is derived now.)
3. **Wire the skills to emit.** Drop emit-spec sections 1-3 into `naive-tester/SKILL.md`
   (replacing the stale "Recording readiness verdicts" section) and section 4 into `qa/SKILL.md`.
   Point them at the `readiness_criteria` table catalogue, not `gate-readiness/criteria.json`.
4. **Coverage runs.** The live singify result showed HARD checks P2/P3/39/40 as "not yet
   inspected" — they block correctly, but the action is to RUN those checks, not fix a bug.
   Every product needs a verdict (pass/fail/na) recorded for each applicable HARD check.
5. **Decide the promise-substantiation check.** Code 9 currently stretches to cover "does the
   product deliver its promise" (the DealFindrs $99-vs-$29 killer). If too broad, author a
   dedicated `readiness_criteria` row (THIN-sourced, HARD or WEIGHTED-High).

## 7. Known gotchas / decisions on record

- **Append-only, not upsert.** readiness_results gets a new row per verdict; the scorer
  dedupes to latest. Do NOT add a UNIQUE(product_slug, check_code) constraint — it breaks
  the writer's second write.
- **`na` must be emitted, not omitted.** An omitted HARD check = "never inspected" = blocks.
  Faithful `na` is how a not-applicable check stays out of the denominator.
- **Day-one strictness is real and correct.** With deployment-scoping live, products show
  more blockers than the old boolean score did — because the gate now distinguishes
  "verified on the live build" from "passed once, somewhere." That's the design, not a regression.
  The transition rule (unbound = provisional, not failed) stops it being a cliff for
  pre-binding history (pipeline + singify have null-bound verdicts; sayfix is fully bound).
- **Legible-or-overridden.** A hard gate is only sustainable if every block says how to clear
  it. The blocker list (what/why/who/status) is what keeps people fixing instead of reaching
  for `is_override`.
- **Billing:** the cockpit's Supabase project (`tfgtfhwvrswjvkyeyvsp`) showed an outstanding-
  invoice warning. A suspension takes the whole gate offline. Clear it.

## 8. How to operate it (quick reference)

```bash
# what is production serving for a product?
node scripts/gate-check.mjs prod-deployment <slug>

# record certifier verdicts (binds to live deployment automatically)
node scripts/gate-check.mjs record-readiness <slug> --source naive-tester --file verdicts.json --by <name>

# is the URL-share / outreach gate open? (Delta-2: PASS must be bound to live deploy)
node scripts/gate-check.mjs url-share-allowed <slug>
```
```sql
-- the gate truth, with the explained blocker list:
select compute_readiness('<slug>', '<live deployment id>');
-- at-a-glance across all products (latest-wins fallback):
select * from product_gate_status order by gate_open;
```
