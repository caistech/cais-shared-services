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

- [x] `corporate-ai-solutions` — ✅ **TRANSFERRED 2026-06-13 (Phase 3)** cockpit + cost dashboard (PUBLIC); Vercel auto-follow verified
- [x] `platform-trust` — ✅ **TRANSFERRED 2026-06-13 (Phase 3)** trust middleware service
- [x] `property-services` — ✅ **TRANSFERRED 2026-06-13 (Phase 3, careful pass).** Investigation showed the
  feared coupling does NOT exist: `mmcbuild-application` consumes it purely over **runtime HTTP**
  (`NEXT_PUBLIC_PROPERTY_SERVICES_URL` + `_API_KEY` via `X-API-Key`, `src/lib/site-intel/index.ts`) using a
  **vendored internal SDK copy** (`src/lib/services/property-services-sdk/*`, "NOT published packages" per its
  DECISIONS.md) — **no submodule, no git-dep, no package dep** on the repo. The `@caistech/property-services-sdk`
  package is published from the HUB monorepo (already in caistech), unaffected. Prod Vercel domains
  (`property-services-kappa.vercel.app` etc.) are team/project-scoped, NOT owner-scoped → unchanged by transfer.
  **After-check:** Vercel auto-followed (`already connected`), both prod domains return HTTP 307 (alive),
  URL unchanged → **mmcbuild needs NO change.** Supabase edge functions untouched.
- [x] `storefront-mcp` — ✅ **TRANSFERRED 2026-06-13 (Phase 3)** (→ `@caistech/webmcp-kit`; no npm-publish workflow, so no package-publish concern)
- [x] `preflight` — ✅ **TRANSFERRED 2026-06-13** (pilot #2 — see Pilot section for the Vercel-relink proof)
- [x] `sayfix` — ✅ **TRANSFERRED 2026-06-13 (Phase 3)** (ownership confirmed YES OWNED).
  ✅ **STEP 6 DONE 2026-06-13:** SayFix Supabase (`vwvfmsuquohlgxcpzdjo` — a 4th distinct instance) `public.repos`
  has SEPARATE `github_owner` + `github_repo` columns. Flipped `github_owner` `dennissolver`→`caistech` for the
  28 migrated rows via PostgREST PATCH (service-role key), excluding the 5 that stayed under dennissolver
  (`mova`, `lessonslearned`, `smartboard`, `hairstylist-ai`, `mmcbuild`). Verified: 28 now caistech, 5 still
  dennissolver. (The `mmcbuild-ai/mmcbuild-application` row was already non-dennissolver.)
  ✅ **NAME-MISMATCH SUB-ISSUE RESOLVED 2026-06-13:** the 6 `github_repo` names that didn't match the real repo
  were all corrected in the SayFix DB (`singify`→`singify-platform`, `universalinterviews`→`universal-interviews`,
  `ndissda-automate`→`NDISSDAAutomate`, `outreach-ready`→`OutreachReady`, `r-and-d-tax`→`R-and-D-Tax-Eligibility-Work-Recording`,
  `investorpilot`→`investor-pilot`). Per-app widget reconciliation:
  - **4 were DB-only** — the `<SayFixWidget repo>` prop ALREADY had the real name (singify-platform, universal-interviews,
    NDISSDAAutomate) or no widget yet (OutreachReady); fixing the DB repaired the lookup.
  - **2 needed a widget edit (PRs open — MERGE to complete + restore widget-match):** R-and-D-Tax (PR
    caistech/R-and-D-Tax-Eligibility-Work-Recording#5) + investor-pilot (PR caistech/investor-pilot#2). Until merged,
    those 2 apps' widget prop (`r-and-d-tax`/`investorpilot`) no longer matches the new DB name — merge promptly.
  Case-only diffs (lingopureai/tourlingo/etc.) left as-is — GitHub resolves them.

## REGULATED / contracted products (migrate — but move LAST, after pilot proven)

All transferred 2026-06-13 (Phase 4). Before/after verified: only `dennissolver` was a direct
collaborator (no external party loses access); webhooks preserved (1→1 each); branch protection
was unavailable under the personal plan (none to lose, may now be enabled in-org); secrets cleaned;
Vercel auto-followed; git fetch from caistech OK.
- [x] `F2K-Fund-Tokenisation` — ✅ **TRANSFERRED (Phase 4)** regulated
- [x] `NDISSDAAutomate` — ✅ **TRANSFERRED (Phase 4)** regulated
- [x] `R-and-D-Tax-Eligibility-Work-Recording` — ✅ **TRANSFERRED (Phase 4)** regulated (also the target of the shared `/api/github/webhook` the 4 regulated repos post to — webhook preserved on transfer)
- [x] `disaster-support` — ✅ **TRANSFERRED (Phase 4)** regulated
- [x] `f2k-checkpoint` — ✅ **TRANSFERRED (Phase 4, last)** regulated — moved while working in it (tree clean; open work was all in cais-shared-services); local remote re-pointed + fetch verified

## Voice / coaching engine (Engine 1) products

- [x] `singify-platform` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)** lane-1 flagship
- [x] `LingoPureAI` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `UniversalLingo` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `TourLingo` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `ConferenceLingo` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `RehearsalsAI` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `universal-interviews` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `connexions` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)** (also pipeline stage-3 machinery)
- [x] `raiseready-core` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `raiseready-template` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [ ] `raiseready-impact` — ⏸️ PARKED in dennissolver (Phase 0)
- [x] `LaunchReady` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `Kira` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)** (passion-lane keeper)
- [ ] `mova` — ⏸️ PARKED in dennissolver (Phase 0)
- [ ] `StoryVerse` — ⏸️ PARKED in dennissolver (Phase 0)

## Property engine (Engine 2) products

- [x] `deal-findrs` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)** (PUBLIC)
- [x] `f2k-projects` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**

## Outreach / contact-discovery engine (Engine 3) products

- [x] `investor-pilot` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)** (PUBLIC) also pipeline machinery
- [x] `partner-pilot` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `OutreachReady` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `tenderwatch` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**

## BYOK / marketing-tier products

- [x] `easy-claude-code` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)**
- [x] `community-question-responder` — ✅ **TRANSFERRED 2026-06-13 (Phase 2)** (CQR, PUBLIC)

## PHASE 0 TRIAGE — DECIDED 2026-06-13 (kill/keep/migrate calls before any further transfers)

### Client-owned — do NOT migrate (excluded by default)
- [ ] `mmcbuild` — 🚫 client (already migrated CAS→MMC org)
- [ ] `mmcbuild-webapp` — 🚫 client
- [ ] `mmc-market` — 🚫 client
- [ ] `gbta-openclaw` — ⏸️ **MINE, parked in dennissolver** (Dennis 2026-06-13: not client-owned, but
  not migrating — leave under dennissolver for now).
- [ ] `AIFTIS-Demo` — ⏸️ **MINE, parked in dennissolver** (same — yours, not migrating).

### Kill / archive — DONE 2026-06-13 (archived on GitHub; reversible, repos retained read-only)
- [x] `SmartBoard` — 🗑️ **ARCHIVED** (verified isArchived=true)
- [x] `HairStylistAI` — 🗑️ **ARCHIVED**
- [x] `omq-outreach` — 🗑️ **ARCHIVED**
- [x] `proposal-filter-ai` — 🗑️ **ARCHIVED** (stale since Apr 14)
- [x] `factory2key-agentic-qc` — 🗑️ **ARCHIVED** (stale since Apr 14)

### Phase-0 keepers — MIGRATED 2026-06-13 (Phase 2 batch) except sayfix (infra phase)
- [x] `Kira` — ✅ **TRANSFERRED** (passion-lane keeper)
- [x] `PartReady` — ✅ **TRANSFERRED** (active, was unlabeled)
- [x] `prelabzAI` — ✅ **TRANSFERRED**
- [x] `F2K-OffshoreModular` — ✅ **TRANSFERRED** (was on kill list; active + 28MB → kept)
- [x] `pipeline` — ✅ **TRANSFERRED** (pipeline machinery; bridge test-run repo)
- [x] `executorai` — ✅ **TRANSFERRED** (reference auth-migration repo per SHARED_SERVICES)
- [ ] `sayfix` — ✅ MIGRATE (ownership confirmed YES OWNED; **infra phase / Phase 3**)

### Parked under dennissolver — NOT migrated, NOT killed (revisit later)
- [ ] `mova` · `StoryVerse` · `landscape-genius-ai` · `disabilityconnect` · `LessonsLearned`
  (note: pushed yesterday despite memory saying "paused" — reconcile before any kill) ·
  `agentic-os` (29MB, ~7wk stale) · `raiseready-impact` · `Longtail-AI-Venture-Studio`

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
