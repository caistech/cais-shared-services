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
> **~~The real cost per repo is Vercel, not GitHub.~~ DISPROVEN by pilot #2 (preflight, 2026-06-13):
> the Vercel re-link is ZERO-TOUCH.** GitHub transfer auto-redirects old URLs and keeps
> issues/PRs/stars, AND preserves the repo's numeric ID. Vercel stores its git connection by
> `repoId` (not `owner/name`), so the connection auto-follows the transfer — no re-point needed.
> The ONE prerequisite: the **Vercel GitHub App must have access on the `caistech` org** — it's
> installed there with `repo_selection: all` already, so every transferred repo is covered. Just
> `git remote set-url origin` the local clone and you're done. Verify the App stays `all`-access
> before batch transfers.
>
> Snapshot: **56 repos under dennissolver, 1 under caistech.** Captured 2026-06-13.

Legend — Suggested: ✅ migrate · ⏸️ keep in dennissolver · 🚫 client-owned (do NOT migrate) · 🗑️ kill candidate (decide before migrating) · ❓ your call

---

## Pilot — do these FIRST to prove the procedure (infra throwaways, low blast radius)

- [x] `cais-smoketest` — ✅ **TRANSFERRED 2026-06-13.** GitHub-only (no Vercel project). Proved:
  transfer via `gh api -X POST repos/dennissolver/cais-smoketest/transfer -f new_owner=caistech`;
  old URL redirects; **repo-level secrets RETAINED on transfer** (not wiped as feared) AND org
  secrets (visibility=ALL) apply; deleted the redundant repo-level copies → repo now runs purely
  on inherited org secrets. **Org-level QA secrets are LIVE on caistech (visibility=ALL).**
- [x] `preflight` — ✅ **TRANSFERRED 2026-06-13 (pilot #2 — the Vercel-relink proof).** Has a live
  Vercel project (`prj_09p4jLZy9LouVOWIOmyKYNNKmg63`, Next.js, prod READY). **Key finding: the
  Vercel re-link is ZERO-TOUCH, not the bulk of the work we feared.** Why:
  1. **GitHub transfer preserves the repo's numeric ID**, and **Vercel stores its git connection by
     `repoId`, not by `owner/name`** — so the connection auto-followed the repo across the org move.
     `vercel git connect` reported *"caistech/preflight is already connected to your project"* with
     no change needed (after `git remote set-url origin https://github.com/caistech/preflight.git`).
  2. **The Vercel GitHub App is installed on the `caistech` org with `repo_selection: all`**
     (`gh api orgs/caistech/installations`) → it already has access to every transferred repo, so
     push-to-deploy webhooks keep firing. This is the ONE prerequisite, and it's a one-time org
     setup that is already done.
  3. `git fetch` from the new `caistech` remote succeeds → git auth/access end-to-end OK.
  **Revised cost model: per-repo Vercel re-link ≈ 0 work as long as the caistech Vercel GitHub App
  keeps `all`-repo access.** Verify the install stays `all` (or add each repo) before batch transfers.
  *Note: Vercel CLI on Windows throws a post-op `spawn UNKNOWN` telemetry error AFTER the connect
  succeeds — cosmetic, ignore it.*
  4. **GOLD-STANDARD TEST PASSED:** empty-commit push to `caistech/preflight main` (sha `0409d9d`)
     auto-triggered a Vercel production deploy (`dpl_CN8pCdywxAG9n4Zjn61y1oXmujks`, `githubOrg:
     caistech`, `githubRepoOwnerType: Organization`). The full webhook→build chain works from the
     new org with zero reconfiguration. **Vercel re-link is conclusively zero-touch.**
- [x] `cais-starter` — ✅ **TRANSFERRED 2026-06-13 (Phase 1).** GitHub-only (no Vercel project).
  Local remote re-pointed; `git fetch` from caistech OK; redundant repo-level QA secrets deleted →
  inherits org secrets. **Runbook step 7 DONE in the same change:** `scripts/new-product.mjs`
  `githubOwner` default + template flipped `dennissolver` → `caistech` (lines 77–78 + 2 doc-comment
  lines; no operational `dennissolver` reference remains) → every NEW scaffolded product is now born
  in the org.

## Infrastructure & hub (migrate — these are the substrate/cockpit)

- [ ] `corporate-ai-solutions` — ✅ the methodology cockpit + cost dashboard (PUBLIC)
- [ ] `platform-trust` — ✅ trust middleware service
- [ ] `property-services` — ✅ property-engine substrate SDK backend
- [ ] `storefront-mcp` — ✅ becomes `@caistech/webmcp-kit`
- [x] `preflight` — ✅ **TRANSFERRED 2026-06-13** (pilot #2 — see Pilot section for the Vercel-relink proof)
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
7. **Flip cais-shared-services references** (so all sessions resolve the new `caistech/<repo>` path):
   for the moved repo, update any `dennissolver/<repo>` occurrence in the hub. **Inventory (2026-06-13):**
   the ONLY operational hardcode was `scripts/new-product.mjs` (`githubOwner` default `dennissolver` +
   template `dennissolver/cais-starter`). ✅ **DONE 2026-06-13 (Phase 1):** flipped to `caistech` +
   `caistech/cais-starter` (lines 77–78 + 2 doc-comment lines) — every NEW repo is now born in the org.
   The other 26 `dennissolver/...` hits are historical docs/`.bak`/`.fix` files — leave them. The
   `portfolio-manifest.yaml` keys projects by **slug** (owner-agnostic) → no change needed.

## Cross-org consumer dependencies (re-point AFTER the source repo moves)
- **`property-services`** currently serves **app.mmcbuild.com.au** (https://app.mmcbuild.com.au/) via the
  client repo **`mmcbuildai/mmcbuild-application`**. When property-services transfers to `caistech`,
  re-point whatever `mmcbuild-application` consumes from it — git submodule / `@caistech/property-services-sdk`
  install source / Vercel build dep — to the new `caistech/property-services` path, and re-verify the
  app.mmcbuild deploy still builds. This is a CLIENT-facing production surface — treat as REGULATED-tier
  care (verify before + after).

## Notes
- Migration count after you tick: ____ of 56.
- Order: pilot (cais-smoketest, cais-starter) → infra → engine products → REGULATED last.
- **QA-secret bridge applied (2026-06-13):** 37 approved repos synced with the 4 `QA_TEST_*` secrets
  (`pipeline` test run + 36 from `scripts/qa-secret-sync-approval.md`). As each repo lands in the org,
  do runbook step 4 (drop it from the bridge; it inherits org secrets).
