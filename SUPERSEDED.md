# SUPERSEDED — `compute_readiness` SQL is shelved; `score.ts` is canonical

**Date:** 2026-05-31 · **Status:** the function below remains applied to the live DB but nothing
in the live path calls it. It is retained as history, not as the scoring engine.

## What this is about

`supabase/migrations/20260531_readiness_scoring.sql` defines
`compute_readiness(p_slug TEXT, p_live_deployment TEXT DEFAULT NULL)` — a PL/pgSQL implementation
of the tier-aware, hard-gate-then-weighted readiness score. It was built as a functional
duplicate of the cockpit's TypeScript scorer and was useful as a live-data validation of the
scoring discipline. It is **not** the source of truth.

## The single source of truth

The canonical readiness scorer is **`score.ts` / `loadCardScore`** in
`corporate-ai-solutions/src/lib/methodology/` (pure function, compute-on-read, has a test). The
cockpit card detail page and the `/score` API both read it directly. All scoring should go through
it.

`compute_readiness` (this migration) is a **redundant** second implementation of the same logic.
Do not wire the cockpit to it. The earlier Stage-6 note that said "wire the cockpit to call
`compute_readiness`" was wrong and is corrected by `SCORER_RECONCILIATION_AND_SURVEY_PLAN.md`: the
fix was to retire the legacy `recalculate-score` formula and read `score.ts` everywhere — not to
introduce a third scorer.

## Why the file is kept (do not delete it)

The migration is already applied to the live database. Deleting the file would desync migration
history. So it stays. If the function should also be removed from the DB, that is a separate,
deliberate `DROP FUNCTION compute_readiness(...)` migration — explicitly **not** part of the
scorer-reconciliation work.

## The one thing the SQL had that `score.ts` lacks

Delta-2 **deployment-scoping** — `compute_readiness`'s `p_live_deployment` parameter and its
verified / unbound / stale transition rule. That capability is **not** lost by shelving the SQL: it
belongs in the **gate-record** step, not the scorer. `gate-check.mjs` already binds gates to the
live deployment; deployment-scoping lives there, and `score.ts` stays a pure scorer.

## Docs to correct (per the plan §7)

Any framework doc or deck that implies `compute_readiness` (SQL) is the scoring engine is wrong —
`score.ts` is. Update those status lines.
