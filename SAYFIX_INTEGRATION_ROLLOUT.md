# SayFix Integration — portfolio rollout runbook

> **Purpose.** The per-repo work to put the SayFix "report a problem" button on every product, and
> the SayFix-side data hygiene to make each product's tickets actually flow. SayFix's own side (the
> portal, intake, discovery, triage, loop) is **built + deployed** — this runbook is the
> *propagation* across the ~36 product repos. Hand to the portfolio session to execute.
>
> **Standard:** `PRODUCT_STANDARDS.md` §192 ("SayFix integration — every product has
> `@caistech/sayfix-embed` wired in"). This is the execution guide for that checklist.
> **Last updated:** 2026-06-08.

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

## 1. Prerequisites (do once, before the per-repo loop)

- [ ] **Republish `@caistech/sayfix-embed`** (label/icon updated 2026-06-08). Bump the version in
  `packages/sayfix-embed/package.json`, build, `npm publish` to GitHub Packages. (The currently
  published version still works — it just shows the old "Report Issue" label.)
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
2. [ ] **Add the widget to the ROOT layout** (so it's on every page — the §192 "every page" rule):
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
- **Voice is one shared SayFix coach** (agent linked to all repos), made product-aware via the
  `{{product}}` dynamic variable — it does **not** need a per-product agent. (Per-product repo-aware
  voice is a later enhancement, not a rollout blocker.)
- **Registry 401 on install** = missing `@caistech` `.npmrc`/token in that repo — the #1 install
  failure; fix before adding the import.
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
