# cais-shared-services — CLAUDE.md

This repo is the **shared substrate** for the whole portfolio: the `@caistech/*` packages, the
canonical property/planning feed contracts, and the portable standards docs
(`BUSINESS_MODEL.md`, `PRODUCT_STANDARDS.md`, `DATA_STANDARD.md`, `SHARED_SERVICES.md`,
`MONETISATION_RULES.md`, `THIN_MVP_RUBRIC.md`). Those docs are auto-imported into every session;
read them. This file adds the rules that fire **specifically when you change something here.**

---

## STANDING REQUIREMENT — Shared-change propagation (the "no orphaned consumers" rule)

**Severity: auth-pattern. A shared change is NOT "done" when the shared code compiles — it is done
when every consuming repo is reconciled.** Because this repo is upstream of ~38 products, a change
made here in isolation silently breaks or half-breaks its consumers. When you change ANY shared
surface — a `@caistech/*` package, the property-services SDK / edge contract, a shared TypeScript
type, a shared Supabase schema fragment, or a shared data shape — you MUST, in the SAME piece of
work, propagate it through all four layers of every affected consumer:

1. **Code (the contract).** Find every consumer that imports the changed thing (grep the portfolio /
   check `package.json` consumers), bump the dependency, and adapt every call site to the new
   contract. Leaving a consumer pinned to the old version/shape is a runtime break waiting to fire
   (the class the `@caistech`-first + fork-check rules already guard — this extends it).
2. **UI.** Any consumer UI that surfaces the changed data or behaviour must be updated too — new
   field rendered, changed label, new state handled, removed field cleaned up. **A backend/SDK
   change that adds or changes data nobody renders is half-done** — the user never sees it.
3. **Supabase tables / migrations.** If the change needs a schema change (new column, table, RLS,
   enum value), write and apply an **idempotent** migration in **every affected database** — and
   remember the **3-DB topology** (cockpit `tfgtfhwvrswjvkyeyvsp`, InvestorPilot
   `azelomanmlywwzbpkksy`, property-services `qppddipgixhinprliyxh`, + others): **verify the linked
   `project-ref` before every `db push`** (a migration can land in the wrong live DB silently).
4. **Verify + catalog.** Typecheck / build each touched consumer and confirm the changed path works
   end-to-end (deploy where it matters). If a capability changed, update **`SHARED_SERVICES.md`** in
   the same change (an unlisted/stale service gets re-forked or mis-consumed).

**The failure mode this prevents:** a shared package bumped alone → consumers on the old contract
(runtime 500s), or the new data invisible (UI never updated), or the DB missing the column (writes
fail). **Worked example (2026-07-10):** the property-services `planning-retrieve` gateway fix +
the SA planning depth change had to move together with F2K-Checkpoint's `planningAssessment.ts`
consumer — fixing only the upstream would have left Checkpoint still showing "queued for Planner
infill." Do not declare a shared change done until its consumers are green.

**Practical checklist before closing a shared change:**
- [ ] Listed every consumer of the changed surface (grep imports / `@caistech` dep in `package.json`).
- [ ] Each consumer's **code** updated + version bumped (no consumer left on the old contract).
- [ ] Each consumer's **UI** updated where it surfaces the change (or explicitly N/A).
- [ ] **Supabase** migration written + applied idempotently to every affected DB (ref verified), or N/A.
- [ ] Each touched consumer **typechecks / builds / deploys** and the path works end-to-end.
- [ ] **`SHARED_SERVICES.md`** updated if a capability changed.

This is a generalisation of the existing `@caistech`-first rule, the fork-check guard, and the
"update the catalog in the same change" maintenance rule — elevated to cover **code + UI + DB**
across every consumer, as a hard standing requirement.

---

## Publishing `@caistech/*` packages
- Registry is GitHub Packages (`.npmrc` has the token). Bump the version, `npm publish`, then run
  the propagation checklist above for every consumer that should adopt it.
- Match the consumer's package manager when you bump its dependency (npm vs pnpm) — a pnpm repo needs
  `pnpm install` to update its lockfile or its Vercel build fails `ERR_PNPM_OUTDATED_LOCKFILE`.
- The registry stays **closed** (the moat); consumers import the compiled `dist/`, never source.
