# caistech Org Migration — repo selection checklist

> **Goal:** consolidate the portfolio under the **`caistech`** GitHub org (already exists; today
> holds only `cais-shared-services`) so org-level Actions secrets give true "define-once,
> all-repos-inherit". Until a repo moves, `scripts/sync-qa-secrets.mjs` is the bridge.
>
> **How to use:** tick `[x]` the repos you want to move into `caistech`. Leave unticked anything
> that should stay under `dennissolver`, is client-owned, or is a kill candidate. The
> **Suggested** column is my recommendation — override freely. Once selected, we pilot on the two
> infra throwaways first, prove the Vercel re-link procedure, then batch the rest; **REGULATED
> repos move LAST.**
>
> **The real cost per repo is Vercel, not GitHub.** GitHub transfer auto-redirects old URLs and
> keeps issues/PRs/stars. But each repo's **Vercel project is Git-connected to `dennissolver/<repo>`**
> and must be re-pointed to `caistech/<repo>` after transfer. That re-link is the bulk of the work.
>
> Snapshot: **56 repos under dennissolver, 1 under caistech.** Captured 2026-06-13.

Legend — Suggested: ✅ migrate · ⏸️ keep in dennissolver · 🚫 client-owned (do NOT migrate) · 🗑️ kill candidate (decide before migrating) · ❓ your call

---

## Pilot — do these FIRST to prove the procedure (infra throwaways, low blast radius)

- [ ] `cais-smoketest` — ✅ test repo; ideal first transfer + Vercel re-link dry-run
- [ ] `cais-starter` — ✅ scaffold template; second pilot

## Infrastructure & hub (migrate — these are the substrate/cockpit)

- [ ] `corporate-ai-solutions` — ✅ the methodology cockpit + cost dashboard (PUBLIC)
- [ ] `platform-trust` — ✅ trust middleware service
- [ ] `property-services` — ✅ property-engine substrate SDK backend
- [ ] `storefront-mcp` — ✅ becomes `@caistech/webmcp-kit`
- [ ] `preflight` — ✅ preflight tooling
- [ ] `sayfix` — ❓ SayFix bug-reporting service (GBTA-controlled layer) — confirm ownership before moving

## REGULATED / contracted products (migrate — but move LAST, after pilot proven)

- [ ] `f2k-checkpoint` — ✅ (last) regulated
- [ ] `F2K-Fund-Tokenisation` — ✅ (last) regulated
- [ ] `NDISSDAAutomate` — ✅ (last) regulated
- [ ] `R-and-D-Tax-Eligibility-Work-Recording` — ✅ (last) regulated
- [ ] `disaster-support` — ✅ (last) regulated

## Voice / coaching engine (Engine 1) products

- [ ] `singify-platform` — ✅ lane-1 flagship
- [ ] `LingoPureAI` — ✅
- [ ] `UniversalLingo` — ✅
- [ ] `TourLingo` — ✅
- [ ] `ConferenceLingo` — ✅
- [ ] `RehearsalsAI` — ✅
- [ ] `universal-interviews` — ✅
- [ ] `connexions` — ✅ (also pipeline stage-3 machinery)
- [ ] `raiseready-core` — ✅
- [ ] `raiseready-template` — ✅
- [ ] `raiseready-impact` — ❓ variant — confirm still live
- [ ] `LaunchReady` — ✅
- [ ] `Kira` — ❓ passion/override lane — your call
- [ ] `mova` — ❓ confirm still live
- [ ] `StoryVerse` — ❓ passion/experimental — your call

## Property engine (Engine 2) products

- [ ] `deal-findrs` — ✅ (PUBLIC)
- [ ] `f2k-projects` — ✅

## Outreach / contact-discovery engine (Engine 3) products

- [ ] `investor-pilot` — ✅ (PUBLIC) also pipeline machinery
- [ ] `partner-pilot` — ✅
- [ ] `OutreachReady` — ✅
- [ ] `tenderwatch` — ✅

## BYOK / marketing-tier products

- [ ] `easy-claude-code` — ✅
- [ ] `community-question-responder` — ✅ (CQR, PUBLIC)

## Client-owned — do NOT migrate (excluded by default)

- [ ] `mmcbuild` — 🚫 client (already migrated CAS→MMC org)
- [ ] `mmcbuild-webapp` — 🚫 client
- [ ] `mmc-market` — 🚫 client
- [ ] `gbta-openclaw` — 🚫 GBTA client — confirm
- [ ] `AIFTIS-Demo` — ❓ demo/client — confirm ownership

## Kill candidates — decide kill vs migrate (per BUSINESS_MODEL §8 consolidation map)

- [ ] `SmartBoard` — 🗑️ likely-kill
- [ ] `HairStylistAI` — 🗑️ likely-kill
- [ ] `omq-outreach` — 🗑️ likely-kill
- [ ] `F2K-OffshoreModular` — 🗑️ likely-kill

## Uncertain / experimental — your call

- [ ] `pipeline` — ❓ confirm what this is
- [ ] `executorai` — ❓ (reference auth-migration repo per SHARED_SERVICES)
- [ ] `LessonsLearned` — ❓ paused per project memory — kill or archive?
- [ ] `PartReady` — ❓
- [ ] `prelabzAI` — ❓ experimental
- [ ] `agentic-os` — ❓ infra or experiment?
- [ ] `proposal-filter-ai` — ❓ experimental
- [ ] `factory2key-agentic-qc` — ❓ F2K experiment
- [ ] `landscape-genius-ai` — ❓ experimental
- [ ] `Longtail-AI-Venture-Studio` — ❓ experimental
- [ ] `disabilityconnect` — ❓ experimental

---

## Per-repo transfer runbook (apply to each ticked repo)

1. **GitHub:** Settings → Transfer ownership → `caistech`. (Redirects old URL; keeps issues/PRs/stars.)
2. **Local remote:** `git remote set-url origin git@github.com:caistech/<repo>.git` (or https form).
3. **Vercel:** project → Settings → Git → disconnect, reconnect to `caistech/<repo>`. Verify the production branch + deploy hook still fire. *(This is the step that actually takes time.)*
4. **Secrets:** confirm the repo now inherits the caistech **org** QA secrets; delete the per-repo
   `QA_TEST_*` / `QA_ADMIN_*` copies the bridge script set, and remove the repo from the
   `sync-qa-secrets.mjs` target list.
5. **Webhooks / deploy keys / branch protection / collaborators:** re-check (transfers usually keep
   these, but verify on REGULATED repos).
6. **Other Git connections:** SayFix repo registration, any `repo:` references in manifests/configs
   that hard-code `dennissolver/<repo>`.

## Notes
- Migration count after you tick: ____ of 56.
- Order: pilot (cais-smoketest, cais-starter) → infra → engine products → REGULATED last.
