---
Load this file when the skill: produces / reviews / scaffolds / migrates / ships any product in the Corporate AI Solutions portfolio.
Do NOT load this file when the skill: is doing pure content work (audience, voice, positioning) — those rules live in /foundation/_portfolio/.
---

# Corporate AI Solutions — Portfolio Standard

**Version:** 1.0  
**Last revised:** 2026-05-19  
**Status:** Authoritative — supersedes scattered NON-NEGOTIABLE rule blocks in `~/.claude/CLAUDE.md`. Where this doc and CLAUDE.md disagree, this doc wins.

---

## Why this exists

Across 30+ products the portfolio accumulated rules in CLAUDE.md (text) that depended on Claude — or Dennis — remembering them. The naive-tester sweep on 2026-05-19 found **17 of 28 products violated the auth pattern rule alone, despite it being NON-NEGOTIABLE in global memory.** Writing the rule down didn't enforce it.

This doc is the consolidation. Every rule below maps to its **enforcement mechanism** — the executable thing that catches a violation before it ships. If a rule lives here without enforcement, it's a wish, not a rule.

The cure for the gap isn't more discipline. It's:

1. **Standards consolidated** (this doc).
2. **Shared components that bake the rules in** (`@caistech/corporate-components`, `@caistech/portfolio-gate`).
3. **Scaffold template that bootstraps to standard** (`cais-build-template-v2`).
4. **CI gates that fail the deploy** when standards aren't met.
5. **Migration tool to backfill existing products** (`@caistech/portfolio-migrator`).
6. **Auto-PR pipeline that keeps everything current** (Renovate, patch auto-merge / minor-major human review).

This doc defines the rules. The packages above implement the enforcement.

---

## How to use this

### For NEW products
Start from `cais-build-template-v2` (when shipped). The template has every rule pre-wired — you inherit standard by default. Your product's CLAUDE.md adds `@cais-shared-services/foundation/PORTFOLIO_STANDARD.md` at the top to reference this doc; you do not re-state the rules locally.

### For EXISTING products being migrated
Run `npx @caistech/portfolio-migrator` (when shipped) from the repo root. It will:
- Inspect what's missing
- Propose a PR with the standard components installed
- Surface blockers requiring manual review

### For ANY skill / agent working on a product
Read this file (loaded automatically via the foundation header). Where a product's local CLAUDE.md adds context (paying-client rules, regulatory tier nuance), that's additive, not contradictory. Conflicts default to this doc.

---

## Tier framework

Every product sits in one of three tiers. Rules apply differently by tier.

| Tier | Definition | Examples | Posture |
|------|------------|----------|---------|
| **REGULATED** | Carries regulatory exposure (financial, health, children's data, identity, immigration) OR is under client contract with a paying customer | MMC Build, F2K-Checkpoint, F2K-Fund-Tokenisation, NDISSDA-Automate, R&D Tax, Platform Trust, Story-Verse (children's data), AIFTIS-Demo (credential infrastructure) | Zero tolerance for convention drift. Every rule applies, no exceptions. Audit log mandatory. Counterparty names verifiable. |
| **REVENUE / CASE STUDY** | Live commercial product OR a public case-study build | InvestorPilot, DealFindrs, EasyClaudeCode, StorefrontMCP, LaunchReady, MMC Build webapp (revenue side), TenderWatch | Same rules, fewer carve-outs. Flag any drift as a bug, not a polish item. |
| **STANDARD** | Demo, internal tool, exploration, marketing site | Most others | Same rules apply but enforcement priority is lower. Don't accumulate drift; just don't break the build. |

When in doubt → REGULATED. Cost of false-positive is small; cost of false-negative is loss of customer or regulator action.

---

## The rules

Each rule has the same structure:
- **Rule** — one sentence
- **Enforcement** — the executable thing that catches a violation
- **Repo-local fix** — what a violating product does to come into compliance
- **Added** — when this rule entered the standard

### R1 — Auth pages must implement all four legs

**Rule.** Every authentication page (login, signup, password reset, change password, any page with a password input) must include: (a) working forgot-password link → reset flow, (b) password visibility toggle on every password field, (c) working magic-link button, (d) email verification flow where applicable.

**Enforcement.**
- Use `<AuthForm mode="…">` from `@caistech/corporate-components` (when shipped). It bakes in all four legs by default.
- CI gate `auth-smoke-test.yml` (in `@caistech/portfolio-gate`) hits sign-up + login + forgot + magic-link on the preview deploy and fails the deploy on any 4xx/5xx in the four flows.
- Local pre-commit hook (`@caistech/portfolio-gate`) lints raw `<input type="password">` patterns and warns to use `<AuthForm>` or `<PasswordInput>`.

**Repo-local fix.** Swap raw login/signup/reset pages for `<AuthForm/>`. Wire `RESEND_API_KEY` + canonical sender so magic-link doesn't rate-limit on Supabase's default service. Run the four-leg smoke test.

**Added.** Originally in CLAUDE.md "AUTH PAGE PATTERN" — consolidated into this standard 2026-05-19.

### R2 — Every UI is responsive (375px → 1440px)

**Rule.** Every web UI works dynamically across mobile phone (≤414px) and laptop (≥1280px) viewports. Single responsive build that reflows — never a separate mobile/desktop fork. Mobile-first CSS. 44×44px tap targets minimum. 16px base font minimum on mobile. Tables collapse or scroll; modals go full-screen on mobile; nav collapses to drawer/hamburger.

**Enforcement.**
- Use `<ResponsiveShell>` from `@caistech/corporate-components` (when shipped) as the page wrapper. Enforces mobile-first defaults.
- CI gate `responsive-snapshot.yml` (Playwright) renders top routes at 375 + 1440px and fails the deploy on horizontal-scroll detection, < 16px text, or tap-target collisions.
- Local pre-commit hook lints for fixed pixel widths that don't reflow.

**Repo-local fix.** Wrap pages in `<ResponsiveShell>`. Replace fixed widths with fluid containers (`w-full`, `max-w-*`, `grid-cols-1 md:grid-cols-N`). Test at 375px in dev.

**Added.** Originally in CLAUDE.md "RESPONSIVE DESIGN RULE" — consolidated 2026-05-19.

### R3 — Every UI surface has an explanatory header (WHAT / DO / MATTERS)

**Rule.** Every page and every standalone panel opens with a 1–3 sentence header answering: what is this? what does the user do here? why does it matter to their broader workflow? Above any form or interactive content. Not a tooltip. Not marketing copy.

**Enforcement.**
- Use `<ExplanatoryHeader what="…" do="…" matters="…">` from `@caistech/corporate-components` (when shipped). The component requires all three slots — no silent omission.
- CI gate `header-presence.yml` greps for `<ExplanatoryHeader>` or an equivalent pattern in every page-level component and fails the deploy if missing.
- Local pre-commit hook flags new `app/**/page.tsx` files that don't import the header.

**Repo-local fix.** Add `<ExplanatoryHeader>` to every page. The header doesn't have to be long — 1 sentence per slot is fine — but all three must answer.

**Added.** Originally in CLAUDE.md "UI EXPLANATORY HEADER RULE" — consolidated 2026-05-19.

### R4 — Every memory save triggers an auth smoke test

**Rule.** Any time a memory file is saved in `~/.claude/projects/<project-slug>/memory/` during a session in an active product repo, run the four-leg auth smoke test (sign-up, login, forgot-password, magic-link) before considering the memory save complete.

**Enforcement.**
- A `PostToolUse` hook on the Write tool in `settings.json` (when shipped) detects writes to the memory dir and triggers the smoke test. Smoke test is a curl-based check of HEAD /signup, HEAD /login, the magic-link send endpoint, and the forgot-password endpoint. Non-2xx → blocks memory save and surfaces.
- Naive-tester weekly routine catches drift between hook runs.

**Repo-local fix.** If smoke test fails, fix the failing route before the memory save commits.

**Added.** Originally in CLAUDE.md "AUTH SMOKE-TEST ON EVERY MEMORY SAVE" — consolidated 2026-05-19.

### R5 — Supabase migrations: idempotent, CLI-pushed, never destructive without confirm

**Rule.** All migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc.). Applied via `supabase db push` from the repo without user prompt. Destructive operations (DROP TABLE, DROP COLUMN, backfills under load, REGULATED-tier migrations) require user confirmation before push.

**Enforcement.**
- Pre-commit hook in `@caistech/portfolio-gate` lints migration files for non-idempotent patterns.
- `supabase db push` is the canonical apply path — documented in every product README.
- The bootstrap script `onboard-new-project.sh` wires Supabase CLI auth on first project link.

**Repo-local fix.** Wrap CREATE / ALTER / DROP statements in idempotent guards. Confirm with user before any destructive migration on REGULATED tier.

**Added.** Originally in CLAUDE.md "SUPABASE MIGRATIONS" — consolidated 2026-05-19.

### R6 — Email sender is the verified Resend subdomain

**Rule.** Every transactional and authentication email sends from `noreply@updates.corporateaisolutions.com` (or another verified subdomain for a specific product). Never `corporateaisolutions.com` bare (not verified — silently fails). Never the default Supabase email service in production (rate-limited).

**Enforcement.**
- `RESEND_FROM_EMAIL` env var present and pinned in every product's Vercel env. Pre-deploy gate verifies presence.
- The Resend SMTP custom config is documented in `scripts/configure-email-templates.sh` and verified per-project by `scripts/onboard-new-project.sh`.

**Repo-local fix.** Set `RESEND_FROM_EMAIL=noreply@updates.corporateaisolutions.com` in Vercel env. Wire Supabase Auth → SMTP Settings → custom SMTP to Resend.

**Added.** Originally in CLAUDE.md "CORPORATE AI SOLUTIONS EMAIL INFRASTRUCTURE" — consolidated 2026-05-19.

### R7 — Check `@caistech/*` hub before building any new utility

**Rule.** Before writing any new utility, SDK, component, or integration, check whether it already exists in the `@caistech/*` shared-services hub. Read `cais-shared-services/packages/` and `cais-shared-services/README.md`. If the capability exists, install the package; do not rebuild locally. If it's missing a feature you need, extend the hub package and republish — do not fork into the consumer repo.

**Enforcement.**
- Pre-commit hook (`@caistech/portfolio-gate`) scans new files for patterns the hub already implements (ABN lookup, Mapbox autocomplete, address validation, ai-client routing, audit-log writes, etc.) and surfaces the matching `@caistech/*` package.
- Code review checklist (CI comment) lists hub packages relevant to the diff.

**Repo-local fix.** Install the matching `@caistech/*` package; remove the local re-implementation.

**Added.** Originally in CLAUDE.md "@caistech SHARED-SERVICES FIRST RULE" — consolidated 2026-05-19.

### R8 — Bootstrap automation, not manual checklist

**Rule.** Project setup tasks that have bitten Dennis once are automated. Never tell the user to "open the Supabase dashboard and paste these values" — find the script in `cais-shared-services/scripts/`, run it, surface the result. If the same chore comes up in two sessions, it becomes a script.

**Enforcement.**
- `scripts/onboard-new-project.sh` covers Vercel + Supabase + Resend + email-templates + manifest registration.
- `scripts/harvest-secrets.mjs` propagates shared portfolio keys.
- `scripts/configure-email-templates.sh` brands every Supabase email template.
- Pre-deploy gate verifies the project is registered in `portfolio-manifest.yaml`.

**Repo-local fix.** If a setup step is being done manually, ask "is this in `cais-shared-services/scripts/`?" If yes — run it. If no — write it, then run it.

**Added.** Originally in CLAUDE.md "PROJECT BOOTSTRAP AUTOMATION" — consolidated 2026-05-19.

### R9 — RLS: NEVER `USING (true)` on tables with user data — *NEW 2026-05-19*

**Rule.** No production table containing user data may have an RLS policy of `USING (true)`. Every policy must scope by tenant/owner column (`auth.uid() = owner_id`, `auth.uid() = user_id`, or equivalent). Service-role bypass is reserved for server-side admin operations and must not be used in unauthenticated API routes.

**Enforcement.**
- CI gate `rls-audit.yml` (`@caistech/portfolio-gate`) scans `supabase/migrations/*.sql` for `USING (true)` patterns on tables matching `panels|interviews|users|customers|orders|subscriptions|plans|prices|projects|reports|documents|messages|notifications` and fails the build.
- Local pre-commit hook lints new migrations against the same pattern.
- Naive-tester weekly canary curls every `/api/*` endpoint anonymously and reports any that return data without auth.

**Repo-local fix.** Write a migration that DROPs the open policy and CREATEs a scoped one. Idempotent. Push via `supabase db push`. Verify with `select * from <table>` as anonymous — should return 0 rows.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC7 — Privacy Act exposure on Connexions, Universal Interviews, Platform-Trust, Longtail-AIVS).

### R10 — No verbatim Postgres errors in API responses — *NEW 2026-05-19*

**Rule.** API error responses must not include `error.message`, `error.detail`, or `error.code` verbatim from the database driver. Use a generic-error helper that returns `{ error: 'Internal server error', request_id: '<uuid>' }` to the client and logs the real error server-side. Same rule for any backend dependency error (Supabase, Stripe, Anthropic, etc.) — sanitise before responding.

**Enforcement.**
- Use `errorResponse()` helper from `@caistech/portfolio-gate` (when shipped). Generates a request_id, logs the full error, returns the sanitised payload.
- CI gate `error-leak-audit.yml` scans `app/api/**/*.ts` for patterns matching `error.message`, `err.detail`, `pgerror.code` in return statements and fails the build.
- Local pre-commit hook lints for the same.

**Repo-local fix.** Replace verbatim error patterns with `errorResponse(error)`. Confirm logs are still receiving the full error server-side.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC7 — Platform-Trust `/api/audit` leaks Postgres column types verbatim).

### R11 — No hardcoded vendor identity in shared components or templates — *NEW 2026-05-19*

**Rule.** Vendor identity (Dennis's mobile, email, Calendly handle, name, photo, Instagram handle) MUST NOT appear in `@caistech/*` shared components, in the default state of `cais-build-template-*`, or in any product whose primary positioning is white-label / reseller / template. Vendor identity is routed through environment variables (`NEXT_PUBLIC_VENDOR_NAME`, `NEXT_PUBLIC_VENDOR_EMAIL`, `NEXT_PUBLIC_VENDOR_CALENDLY`, `NEXT_PUBLIC_VENDOR_PHONE`) with explicit placeholder defaults (`"Your Brand Here"`, `"hello@yourbrand.com"`).

**Enforcement.**
- `<CorporateHeader vendor={false}>` defaults to `false` (vendor-neutral) in `@caistech/corporate-components`. Marketing site opts in explicitly.
- CI gate `vendor-leak-audit.yml` greps committed code for `mcmdennis`, Dennis's phone number, `calendly.com/mcmdennis`, and personal Instagram handles, and fails the build if found outside the `Corporate-AI-Solutions` marketing repo.
- Pre-commit hook same.

**Repo-local fix.** Replace hardcoded vendor strings with `process.env.NEXT_PUBLIC_VENDOR_*`. Set placeholder defaults in `.env.example`.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC9 — RaiseReadyTemplate's "white-label" demo carries Dennis's mobile/email/Calendly in 14 places).

### R12 — Public-API endpoint policy: deny-by-default — *NEW 2026-05-19*

**Rule.** Every `app/api/*/route.ts` handler defaults to requiring authentication. If an endpoint is intentionally public (e.g. health check, public badge URL), it must be declared in an `PUBLIC_ROUTES` allowlist with a one-line justification comment. Anonymous access to data-bearing endpoints is a build failure.

**Enforcement.**
- Middleware pattern (template provided in `@caistech/portfolio-gate`): every route hits an auth check unless on the `PUBLIC_ROUTES` allowlist.
- CI gate `unauth-endpoint-audit.yml` curls every `/api/*` route anonymously on the preview deploy and fails the build if any response carries data fields other than what's in the public allowlist.
- The naive-tester weekly canary re-runs this check.

**Repo-local fix.** Add `getUser()` (or equivalent) check at the top of each route handler. If the route is genuinely public, add it to the `PUBLIC_ROUTES` allowlist with a justification comment.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC7 — Universal Interviews `/api/panels*` and `/dashboard` were unauthenticated).

### R13 — Route smoke test on every deploy — *NEW 2026-05-19*

**Rule.** Every product's CI runs a route smoke test before the deploy is promoted. The test hits the top routes (homepage, /pricing, /about, /contact, /login, /signup, /privacy, /terms, plus product-specific routes) and fails the deploy on any non-200.

**Enforcement.**
- `@caistech/portfolio-gate` ships a default `routes.test.ts` that reads `routes.config.ts` (a per-repo list) and curls each.
- GitHub Action `gate.yml` runs this on every PR + push to main.
- Vercel promotion is blocked if the action fails.

**Repo-local fix.** Add `routes.config.ts` with the product's canonical routes. Install `@caistech/portfolio-gate`. Wire `gate.yml`.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC6 — 15+ products had headline CTAs leading to 404 or redirect loops).

### R14 — One public sample artefact before signup — *NEW 2026-05-19*

**Rule.** Every product showing data-bearing functionality must publish at least one static sample artefact (PDF, screenshot, transcript, JSON response, sample dashboard) reachable from the landing page without signup. For API products: a working curl + sample JSON response. For consumer products: one sample output. For B2B SaaS: one anonymised real artefact OR one hand-crafted credible example labelled "sample."

**Enforcement.**
- CI gate `sample-presence-audit.yml` checks for the existence of `app/sample/page.tsx` or `app/demo/page.tsx` or a `<SampleArtefact>` import on the homepage. Fails the build if absent.
- Naive-tester weekly canary checks that the sample is reachable anonymously.

**Repo-local fix.** Add a sample-output page. Link to it from the landing hero AND the closing CTA. Static content is fine for v1.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC5 — 13 products had no demo / no sample artefact / "give us your data first" gating).

### R15 — Trust scaffolding on REGULATED products — *NEW 2026-05-19*

**Rule.** Products in the REGULATED tier must publicly disclose their compliance counterparties wherever they make claims about regulatory status. For financial products: AFSL holder, trustee, custodian, valuer, auditor — each with status (Contracted / In negotiation / Open EOI / Not yet appointed). For health/identity products: certifications and the bodies that issued them. For children's-data products: privacy policy + parents page + COPPA + GDPR-K compliance posture. No claim without a backing counterparty.

**Enforcement.**
- `<TrustPanel kind="…">` from `@caistech/corporate-components` (when shipped) renders the appropriate disclosure block. Required on every REGULATED product's landing and on every screen making a regulatory claim.
- CI gate `trust-panel-presence.yml` checks for the import on REGULATED-tier products (tier declared in `portfolio-manifest.yaml`).
- Pre-deploy gate: fail if any unverified regulatory claim is present in the marketing copy of a REGULATED product (heuristic — flag for human review, don't block silently).

**Repo-local fix.** Add `<TrustPanel>` to landing + relevant screens. Populate counterparty status. Where counterparties are not yet contracted, mark "Not yet appointed" — never imply they exist.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC8 — F2K-Fund-Tokenisation claims AFSL-regulated structure without naming AFSL holder, trustee, custodian, valuer publicly).

### R16 — Supabase Auth redirect allowlist hygiene — *NEW 2026-05-19*

**Rule.** Every Supabase project's Auth → URL Configuration → Redirect URLs allowlist is scrubbed regularly and contains ONLY URLs belonging to that product's canonical slug + localhost. Cross-project URL contamination (e.g. F2K Checkpoint Supabase containing ndissda-automate redirect URLs) is a build failure.

**Enforcement.**
- `scripts/onboard-new-project.sh` CLEARs the allowlist before SETting new entries (clear-then-set, not append).
- An audit script `scripts/audit-supabase-allowlists.sh` runs in the naive-tester weekly routine and flags drift.

**Repo-local fix.** Open Supabase Dashboard → Auth → URL Configuration → Redirect URLs. Remove any URL not owned by this product. Verify the bootstrap script is the clear-then-set version.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC3 — F2K Checkpoint session bouncing to ndissda-automate.vercel.app via stale allowlist entries).

### R17 — Vercel alias hygiene and custom domain for top-tier products — *NEW 2026-05-19*

**Rule.** Every product has ONE canonical hostname documented in `portfolio-manifest.yaml`. Marketing copy + CTAs + internal links + email content reference the canonical hostname only — never `<slug>.vercel.app` directly (bare slugs may be unowned and collide). REGULATED and REVENUE-tier products use a custom domain (`<product>.corporateaisolutions.com` or a product-specific domain).

**Enforcement.**
- Pre-commit hook scans for `*.vercel.app` references in marketing-copy files and surfaces the canonical hostname from the manifest.
- A weekly cron audit (`scripts/audit-vercel-aliases.sh`) resolves every canonical hostname and asserts the right project answers.
- The `onboard-new-project.sh` bootstrap claims the bare slug + wires the custom domain.

**Repo-local fix.** Update marketing copy to use the canonical hostname. Wire a custom domain in Vercel.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC1 — 21 products affected by Vercel preview alias collisions).

### R18 — ElevenLabs ConvAI widget constraints — *NEW 2026-05-19*

**Rule.** Per-product ElevenLabs ConvAI agents must NOT have portfolio-router tools (`navigate_to_url`, `route_to_product`, `canRoute` flags). Widget mounts must set `auto-connect="false"` unless explicitly gated behind a user-initiated journey selection. Every product embedding the widget must declare CSP `navigate-to 'self'` in `next.config.mjs`. Widget version pinned (no head-of-default-branch from unpkg).

**Enforcement.**
- A wrapper component `<ConvAIWidget>` in `@caistech/elevenlabs-convai` (when extended) enforces the constraints at the React level.
- CI gate scans `next.config.mjs` for the CSP header and `<elevenlabs-convai>` props.
- Per-agent audit script in `@caistech/elevenlabs-convai` lists agent tools and flags `navigate_to_url` on non-portfolio agents.

**Repo-local fix.** Reconfigure the product's ConvAI agent in ElevenLabs dashboard to strip portfolio-router tools. Set `auto-connect="false"`. Add CSP to `next.config.mjs`. Pin widget version.

**Added.** 2026-05-19 (naive-tester portfolio root-cause RC2 — 11 products experienced cross-product session hijacks via ConvAI widget).

### R19 — CommitmentPanel presence before outreach — *NEW 2026-05-28*

**Rule.** Every product MUST have a CommitmentPanel on its main surface before outreach begins for validation. This is the bridge between "interesting" and "action" — it includes RunOnYourData (primary), GetReport (secondary), and JoinPilot/BookSetup (high-intent). Without this, the product cannot be validated because there's no way to measure real commitment.

**Enforcement.**
- `portfolio-gate` static audit scans for `<CommitmentPanel/>` import on key pages.
- Pre-outreach gate in the pipeline cockpit blocks validation outreach until R19 passes.

**Repo-local fix.** Add `<CommitmentPanel/>` from `@caistech/corporate-components` to the product's main page (e.g., `app/page.tsx`, `app/(product)/page.tsx`). Implement the `onRun`, `onReport`, and optionally `onPilot` handlers.

**Added.** 2026-05-28 (validation pipeline hardening — converts "interest" signals into "commitment" signals).

### R20 — Voice agent mandatory on product surfaces — *NEW 2026-05-28*

**Rule.** Voice agent is NOT optional — it's the clarifier layer for any nuanced UI question. Every product surface with multi-step user input (forms, wizards, onboarding, setup flows) must have a voice agent reachable in 3 clicks or fewer. This is mandatory, not nice-to-have.

**Enforcement.**
- `portfolio-gate` static audit scans for voice widget imports (`VoiceWidget`, `ElevenLabsConvai`, `<elevenlabs-convai>`) on key product pages.
- Naive-tester verifies voice agent presence as part of the Standards Check.

**Repo-local fix.** Add `<VoiceWidget/>` from `@caistech/elevenlabs-convai/react` to the product's chrome (sidebar, header, or FAB). Ensure it's reachable from any authenticated surface.

**Added.** 2026-05-28 (voice agent is a core differentiator, not an afterthought).

---

## Enforcement architecture (the cure summary)

These are the things that turn the rules above into pipeline gates.

| Layer | Owns | Status |
|-------|------|--------|
| `@caistech/portfolio-gate` (new) | CI gate workflows, pre-commit hooks, pre-deploy gates, `errorResponse()` helper | **Build needed** |
| `@caistech/corporate-components` (existing — extend) | `<AuthForm>`, `<ResponsiveShell>`, `<ExplanatoryHeader>`, `<TrustPanel>`, `<CorporateHeader vendor={false}>`, `<ConvAIWidget>` | **Extend** |
| `cais-build-template-v2` (replace RaiseReadyTemplate's role for new products) | Scaffold for new products — pre-wires the standard | **Build needed** |
| `@caistech/portfolio-migrator` (new) | Backfill CLI for existing products | **Build needed** |
| `cais-shared-services/scripts/onboard-new-project.sh` (existing — patch) | Patch `onboard-new-project.sh` to CLEAR-then-SET Supabase allowlist (R16) | **Patch needed** |
| Renovate / Dependabot auto-PR pipeline | When shared package ships, every consumer receives a PR; CI gate must pass; patch versions auto-merge, minor/major require human review | **Configure** |
| Naive-tester weekly routine | Already wired (`trig_01HpfLqpwQTLgnZb48xnciuD`) — runs first-contact pulse every Monday 7am Sydney time | **Live** |
| Local on-demand `/naive-tester` skill | Deep persona walkthroughs, calibrated to Anneke quality bar — fires when Dennis wants depth | **Live** |

---

## Migration / backfill protocol

For each existing product, migration to standard means (in order):

1. **Install `@caistech/portfolio-gate`.** Pulls in CI gate workflows, pre-commit hooks, the `errorResponse()` helper, the smoke-test runner.
2. **Install / update `@caistech/corporate-components` to latest.** Swap raw auth pages for `<AuthForm>`; swap headers for `<CorporateHeader vendor={false}>`; wrap pages in `<ResponsiveShell>`; add `<ExplanatoryHeader>` to every page; add `<TrustPanel>` to REGULATED products.
3. **Run the `@caistech/portfolio-migrator` CLI.** Inspects the repo against this standard, opens a migration PR, surfaces blockers.
4. **Verify Supabase allowlist** (R16). Scrub manually if needed.
5. **Verify Vercel alias / custom domain** (R17). Wire custom domain for REGULATED + REVENUE tier.
6. **Verify ConvAI widget config** (R18). Strip portfolio-router tools from per-product agents.
7. **Run the four-leg auth smoke test** (R1, R4). Confirm all four work end-to-end.
8. **Re-run the naive-tester local** (deep walkthrough) to verify the user-visible findings are closed.

Migration order (per portfolio sequence):
- **REGULATED first**: MMC Build, F2K-Checkpoint, F2K-Fund-Tokenisation, NDISSDA-Automate, R&D Tax, Platform Trust, Story-Verse, AIFTIS-Demo
- **REVENUE second**: InvestorPilot, DealFindrs, EasyClaudeCode, StorefrontMCP, LaunchReady, MMC Build webapp (revenue side)
- **STANDARD last**: Everything else in the active portfolio

---

## Change log

**v1.0 — 2026-05-19**
- Initial consolidation. Migrated NON-NEGOTIABLE rules from `~/.claude/CLAUDE.md`: AUTH PAGE PATTERN (R1), RESPONSIVE DESIGN RULE (R2), UI EXPLANATORY HEADER RULE (R3), AUTH SMOKE-TEST ON EVERY MEMORY SAVE (R4), SUPABASE MIGRATIONS (R5), EMAIL INFRASTRUCTURE (R6), @caistech SHARED-SERVICES FIRST RULE (R7), PROJECT BOOTSTRAP AUTOMATION (R8).
- Added new rules surfaced by the naive-tester sweep (2026-05-19): RLS deny-by-default (R9), no verbatim Postgres errors (R10), no hardcoded vendor identity (R11), public-API deny-by-default (R12), route smoke test on deploy (R13), sample artefact required (R14), trust scaffolding on REGULATED (R15), Supabase allowlist hygiene (R16), Vercel alias hygiene (R17), ConvAI widget constraints (R18).
- Established tier framework (REGULATED / REVENUE / STANDARD).
- Defined enforcement architecture and migration protocol.

---

## Open standards questions (not yet decided)

These are placeholders for upcoming decisions. Mark resolved when answered.

- **Q1.** Should `R14` (sample artefact) apply to admin / internal-only products (no public landing)? *Default: no — internal tools exempt.*
- **Q2.** What's the Vercel custom-domain naming convention for STANDARD-tier products? *Open.*
- **Q3.** Auto-merge policy for major version bumps of `@caistech/*` packages — currently human-review-only. Revisit after 3 successful minor-version auto-merges. *Open.*
- **Q4.** Trust-tier policy for AI testimonials — currently blanket-banned on REGULATED + REVENUE tier (ACCC misleading-conduct exposure). Standard tier? *Open — default: discouraged but not blocked.*

---

**This standard supersedes `~/.claude/CLAUDE.md` NON-NEGOTIABLE rule blocks on conflict.** Update CLAUDE.md to reference this doc rather than restate the rules.
