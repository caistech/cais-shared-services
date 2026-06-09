# SayFix Integration — portfolio rollout runbook

> **Purpose.** The per-repo work to put the SayFix "report a problem" button on every
> **visitor-facing** product (see §0.5 — infra/BYOK/dev tools are skipped), and the SayFix-side data
> hygiene to make each product's tickets actually flow. SayFix's own side (the portal, intake,
> discovery, triage, loop) is **built + deployed** — this runbook is the *propagation* across the
> in-scope product repos. Hand to the portfolio session to execute.
>
> **Standard:** `PRODUCT_STANDARDS.md` §9 codicil — "SayFix integration" (every product has
> `@caistech/sayfix-embed` wired in). This is the execution guide for that checklist.
> **Last updated:** 2026-06-09.

---

## 0. The model (what the button does)

```
[product page] --(SayFixWidget floating button)--> https://sayfix.vercel.app/welcome?product=<repo>
   --> warm plain-language gate (name + email) --> product-scoped intake (voice + text discovery)
   --> ticket created in SayFix, scoped to <repo> --> triage --> (loop: fix → PR → preview → approve)
```

The button is just a **link** to `…/welcome?product=<github_repo>`. The `product` value **must equal
the `github_repo`** in SayFix's `repos` table — that's how SayFix knows which product (and which
codebase) the ticket belongs to. Everything downstream keys off it.

---

## 0.5 Scope — which products get the button (DECIDED 2026-06-09)

**Not "every product" — only products that have real END-USERS / VISITORS** (consumer- or
operator-facing surfaces someone would report a problem *on*). The SayFix button is a service to a
website's visitors; a product with no visitors has no one to press it.

- **INCLUDE** — visitor/operator-facing apps: deal-findrs, f2k-projects, singify, kira, connexions,
  partner-pilot, tenderwatch, raiseready-template, disaster-support, investor-pilot, property-services,
  the lingo family (lingopureai, universallingo, tourlingo, universalinterviews), rehearsalsai,
  platform-trust, f2k-checkpoint, ndis-sda-automate, r-and-d-tax, corporate-ai-solutions (the operator
  cockpit), mmcbuild (client). Default IN for anything with a visitor-facing UI.
- **SKIP** — infrastructure, BYOK self-host tools, and dev tools with no end-user to report a bug:
  storefront-mcp / `@caistech/webmcp-kit`, easy-claude-code, community-question-responder (CQR),
  preflight, cais-shared-services, and other pure-substrate/CLI packages.
- The portfolio session makes the final per-product call using `portfolio-manifest.yaml`
  (`ownership` / product type). When unsure: has a human visitor who could hit a bug? → IN.

## 0.6 Current live state (snapshot 2026-06-09)

A scan of the deployed product sites found the embed is **essentially un-rolled-out**:
- ✅ **Only `f2k-projects`** currently shows the button — and on the **OLD `/new` pattern**, which
  bounced anonymous visitors to the login wall. (SayFix middleware now redirects unauth `/new` →
  `/welcome` as a safety net, but the button itself should be updated to point at `/welcome`.)
- — Live with **no button**: deal-findrs, singify, investor-pilot, platform-trust, kira,
  disaster-support, easy-claude-code, corporate-ai-solutions, raiseready-template, mmcbuild.
- · Not resolved at `<repo>.vercel.app` (custom domain — recheck): property-services, connexions,
  partner-pilot, tenderwatch, f2k-checkpoint, storefront-mcp.

**Correction for the rollout:** use the current `@caistech/sayfix-embed` `SayFixWidget` (it links to
`/welcome?product=<repo>`). Do **not** wire the old `/new` link, and **update f2k-projects' existing
button** from `/new` → `/welcome`. Voice coach: ~26 per-product agents were provisioned 2026-06-09,
so most INCLUDE products already render the coach on `/welcome`; any without a `voice_agent_id` get
text-only intake (fine).

---

## 1. Prerequisites (do once, before the per-repo loop)

- [x] **Package build shape — RESOLVED (`@caistech/sayfix-embed@0.3.0`, 2026-06-09).** The package
  now ships a real compiled `dist/` (`main`/`types`/`exports` → `dist`, `react/jsx-runtime` output,
  `files: ["dist/"]`, `prepublishOnly`) and has **ZERO runtime deps** (the 4 icons are inlined SVGs;
  `react` is the only peer). So consumers on **≥0.3.0 need NO `transpilePackages`** and no
  lucide-react to reconcile — `pnpm add @caistech/sayfix-embed` and import. (Pre-0.3.0 shipped raw
  `src/index.ts` JSX, which forced `transpilePackages` or broke the build — that was the blocker.)
- [ ] **Still: prove ONE install end-to-end before fanning out.** Wire the widget into ONE in-scope
  repo and confirm it builds + the button renders on a real Vercel deploy before touching the rest —
  cheap insurance against a registry-auth or layout-placement surprise repeated ~20×.
- [ ] **SayFix Vercel env** (one-time, NOT per product): `GITHUB_TOKEN` with `repo` scope (so the
  fixer can read/PR the product repos) + the runner secrets per `sayfix/docs/RUNNER_SETUP.md`.
- [ ] **Confirm the registry auth pattern** each repo already uses for `@caistech/*` (almost all do):
  `.npmrc` with `@caistech:registry=https://npm.pkg.github.com` + `_authToken=${GITHUB_PACKAGES_TOKEN}`,
  and that token in the repo's Vercel env. If a product installs *any* other `@caistech/*` package in
  prod, its auth is already fine.

---

## 2. Per-repo steps (run for every product)

For each product repo (`<repo>` = its GitHub repo name, e.g. `deal-findrs`):

1. [ ] **Install the package:** `pnpm add @caistech/sayfix-embed` (or npm/yarn to match the repo).
   If it 401s on the registry, the `@caistech` `.npmrc` + `GITHUB_PACKAGES_TOKEN` isn't set — fix that
   first (see Prereqs).
2. [ ] **Add the widget to the ROOT layout** (so it's on every page — the §9 SayFix-codicil "every page" rule):
   in `src/app/layout.tsx` (App Router) inside `<body>`:
   ```tsx
   import { SayFixWidget } from "@caistech/sayfix-embed";
   // …
   <body>
     {children}
     <SayFixWidget repo="<repo>" />   {/* repo MUST match the github_repo in SayFix's repos table */}
   </body>
   ```
   Widget API: `repo` (required), `label?` (default *"Report a problem — get it SayFixed"*),
   `position?` (`'bottom-right'` | `'bottom-left'`), `showIcon?`. It's a fixed floating button
   (`z-50`), framework-agnostic React — no provider needed.
3. [ ] **Confirm the repo is registered in SayFix** (the receiving side). It must exist in SayFix's
   `repos` table with `github_owner`, `github_repo`, and — for the fix/verify loop —
   `vercel_project_id`, `protected_paths`, `risk_tier`. See §3 (most rows exist but are incomplete).
4. [ ] **Deploy** the product (the widget is client-side; it renders once deployed).
5. [ ] **Verify** (see §4).

---

## 3. SayFix-side data hygiene (do alongside the rollout — it's not optional)

A query of SayFix's `repos` table (2026-06-08) found **36 rows** with real problems that will break
the loop if left:

- **Duplicates** — `f2k-projects`, `mmcbuild`, and `sayfix` each appear **twice**. Dedup (a ticket
  could attach to the wrong row). Keep one canonical row per product.
- **`vercel_project_id` is NULL on EVERY row.** The verify cron's preview-poll + the build workflow's
  preview discovery filter on it — without it, the fix loop can't bind a verdict to a deployment.
  Populate each repo's Vercel project id.
- **`protected_paths` + `risk_tier`** — set per repo. REGULATED-tier products (mmcbuild,
  platform-trust, ndissda-automate, f2k-checkpoint, r-and-d-tax, disaster-support) must be
  `risk_tier = regulated` (auto-merge-ineligible, §12 D11), and their auth/payments/schema paths in
  `protected_paths` so the fixer escalates instead of touching them.
- **Owner mismatches** — rows span `dennissolver/*`, `cais/*`, `mmcbuild-ai/*`. The fixer's `GH_PAT`
  must have access to whichever owner each repo lives under, or that product's fixes can't open a PR.

So per repo, the SayFix-side row should end up: one canonical row · correct `github_owner/github_repo`
· `vercel_project_id` set · `risk_tier` + `protected_paths` set.

---

## 4. Verification (per repo)

- [ ] The floating button renders on **every** page of the deployed product (it's in the root layout).
- [ ] Clicking it opens `…/welcome?product=<repo>` and the page says it's about **that** product.
- [ ] Name/email → lands in the intake; the discovery agent (text, and voice if wired) knows the
  product and doesn't ask "which app are you on?".
- [ ] A submitted test report appears in SayFix's `/console` queue, scoped to `<repo>`.
- [ ] No dev jargon shown to the visitor anywhere in the flow (§7 vocab firewall).

---

## 5. Gotchas (learned, so the rollout skips them)

- **`product` ≠ a display name — it's the `github_repo`.** A mismatch means the ticket has no usable
  repo, and the fixer can't act. Keep the widget's `repo` prop and the `repos.github_repo` identical.
- **The widget opens SayFix in a new tab** (`target="_blank"`) — intended; the user stays on the
  product. Don't "fix" it to navigate away.
- **Voice coach is now per-product (provisioned 2026-06-09), not one shared agent.** ~26 per-product
  agents were provisioned this session, so most INCLUDE products render their own coach on `/welcome`;
  any product **without** a `voice_agent_id` falls back to **text-only intake** (fine — not a rollout
  blocker). (Supersedes the earlier "one shared `{{product}}`-aware coach" model — reconciled with §0.6
  on 2026-06-09; do not re-provision a shared agent.)
- **Registry 401 on install** = missing `@caistech` `.npmrc`/token in that repo — the #1 install
  failure; fix before adding the import.
- **Build/blank-render on a CLEAN install — FIXED in `@caistech/sayfix-embed@0.3.0`.** Pin **≥0.3.0**;
  it ships a compiled `dist/` with zero runtime deps, so no `transpilePackages` and no lucide-react are
  needed. (Historical: ≤0.2.0 shipped raw `src/index.ts` JSX — a consumer whose bundler didn't transpile
  `node_modules` failed the build or rendered nothing. If a repo somehow pins ≤0.2.0, bump it to ≥0.3.0
  rather than adding `transpilePackages`.)
- **REGULATED repos**: wire the button (visitors should always have a voice), but make sure the
  SayFix row is `risk_tier = regulated` so auto-merge stays off and the fixer escalates protected-path
  changes to a human.

---

## 6. Rollout scope (the 36 rows, 2026-06-08 — dedup first)

`community-question-responder · connexions · corporate-ai-solutions · deal-findrs · disaster-support ·
easy-claude-code · f2k-checkpoint · f2k-fund-tokenisation · f2k-projects (×2) · hairstylist-ai ·
investorpilot · kira · lessonslearned · lingopureai · mmcbuild (×2) · mmcbuild-application · mova ·
ndissda-automate · outreach-ready · partner-pilot · platform-trust · property-services · r-and-d-tax ·
raiseready-template · rehearsalsai · sayfix (×2) · smartboard · storefront-mcp · tenderwatch ·
tourlingo · universalinterviews · universallingo`

Query the live table for the current set before starting (`select github_owner, github_repo,
vercel_project_id from repos order by github_repo`) — it's the source of truth.

> ⚠️ **The names in §0.5 / §0.6 / this list are INDICATIVE, not authoritative — and they drift**
> (e.g. `investor-pilot` vs `investorpilot`, `ndis-sda-automate` vs `ndissda-automate`). Because the
> widget's `repo` prop must equal `repos.github_repo` **exactly**, take every name from the live
> `repos` query above, never from this prose.
>
> ⚠️ **`singify` is IN scope (§0.5, and §0.6 lists it as "no button") but is ABSENT from this 36-row
> list — it has no `repos` row yet.** Create its canonical row (`github_owner` = `dennissolver`,
> `github_repo` = `singify`, + `vercel_project_id`) as a §3 step before wiring its button, or its
> tickets have nowhere to scope. Re-check the live table for any other in-scope product with no row.
