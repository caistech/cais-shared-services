# Gate-1 Backfill Worklist — Tier-2 naive-tester findings (2026-05-26)

> Compiled from the first run of the THIN_MVP_RUBRIC v2 Gate-1 readiness pass.
> Tier-1 (cheap HARD gate) cleared 17/19; Tier-2 (`/naive-tester` live personas) found a
> **cross-cutting pattern: 6/6 products' core promise is unreachable behind a strong front
> door.** This is the recurring Gate-1 gap — the landing layer sells, but the actual product
> experience doesn't load/complete for a cold visitor, so a validation-outreach link would
> send the audience to a door that doesn't open.
>
> **Goal of the backfill:** move each product from NO-GO to *sendable* — i.e. unblock the core
> promise so the thin-MVP link does what the rubric requires (the audience *feels* the promise).
> Source reports: `cais-shared-services/naive-tester-reports/` + `tenderwatch/naive-tester-reports/`.

## Prioritisation (severity × leverage)

- **P0 Security** — abuse/cost exposure on CAS's own accounts. *(DONE.)*
- **P1 Core-flow blocker** — the promise is literally unreachable (crash / dead submit / 404 /
  wrong artifact). Highest leverage: flips NO-GO → sendable.
- **P2 Promise correctness / try-before-buy** — the product loads but mismatches the pitch, or
  the only path is a live charge with no preview.
- **P3 Trust-killers + surgical polish** — credibility damage, quick wins (mojibake, dead CTAs,
  sub-16px text, missing eye-toggle/Mapbox/ABN, httpOnly cookie).

Leverage order across products (lane weight): **Singify, Connexions** (Lane-1 flagships) →
**DealFindrs, InvestorPilot, RaiseReady, rehearsals-ai** (live Engine exemplars) → Kira, LaunchReady
(audit not yet run).

---

## Backfill progress (2026-05-26) — 3 PRs shipped

| # | Product | Outcome | PR |
|---|---------|---------|-----|
| 0 | raiseready-template (+rehearsals-ai/-six) | ✅ Fail-closed `SETUP_SECRET` gate. **Pending you:** merge + set `SETUP_SECRET` on 3 Vercel projects. | [raiseready-template#2](https://github.com/dennissolver/raiseready-template/pull/2) |
| 1 | Singify | ✅ `/sing` mobile crash fixed — lazy-mount the heavy `@elevenlabs/react` clarifier SDK (was eager-mounted on load). | [singify-platform#1](https://github.com/dennissolver/singify-platform/pull/1) |
| 3 | InvestorPilot | ✅ Post-auth 404 fixed — added `/dashboard` resolver → `/org/[slug]/dashboard`. **Routing gap, not a deploy gap** (audit hunch confirmed: pages were built, the landing URL was missing). | [investor-pilot#1](https://github.com/dennissolver/investor-pilot/pull/1) |
| 2 | DealFindrs | ⚠️ **NOT a bug** — the signup handler is wired and **live in production** (verified: deployed chunk has `Passwords do not match` + `api/company/create`). The audit hit a stale/broken deploy (failing `@caistech` `NODE_AUTH_TOKEN` build, since fixed). Shipped the one real §2 gap from #14 instead (password-toggle aria-label + confirm-field toggle). | [deal-findrs#3](https://github.com/dennissolver/deal-findrs/pull/3) |

**Re-audit (2026-05-26, current production) — phantom-clearing pass:**
- **DealFindrs signup CONFIRMED WORKING end-to-end** (Anneke re-run): `POST /auth/v1/signup → 200` → "we've sent a confirmation link" → `/setup`. The "dead signup" was a stale-deploy artifact; now cleared. ⚠️ Email *delivery* not verifiable cold (Supabase built-in SMTP is rate-limited — wire Resend).
- **New genuine DealFindrs findings (not phantoms):** (a) **Terms/Privacy links go to `#` and `/terms` 404s, yet signup FORCES agreeing to them** — agreeing to non-existent docs on a paid product (§9 + content/IP gap). (b) **#7 ICP mismatch CONFIRMED** — landing = buyers'-agents (buy-side); product/`/reports` = dev-feasibility (QS/GRV/IRR/lender packs, "Auto-Generate IMs") = sell-side. (c) §6 no voice agent despite landing promising "Voice-Guided Input". (d) §7 no favicon + generic shared title. (e) #14 address no Mapbox, company no ABN.
- **Kira + LaunchReady NOT auditable — canonical deploys 401** (`kira-corporate-ai-solutions` / `launchready-corporate-ai-solutions` both behind Vercel deployment protection). Same class as F2K Checkpoint #15 — a Gate-1 research link can't be served from a 401-walled alias. (The bare `kira.vercel.app`/`launchready.vercel.app` 200s are unofficial/other projects.)

**Refined findings (changed the plan):**
- **#4 Connexions white-label** is *not* a surgical strip — it's **multi-repo + a whose-brand-travels decision**. The leaking tenant the audit saw is the **separate `universal-interviews` repo**; Connexions itself carries `components/corporate/CorporateHeader/Footer.tsx` which is *correct* on CAS-owned distributor-acquisition surfaces but wrong on tenant instances. Needs the lane-aware scoping decision (which surfaces travel under whose brand) before any edit — `/gtm-auditor` is the tool for this.
- **#9 Connexions trust-killers** are partly **Stripe-dashboard, not code** (the "Cancel anytime" mojibake is on the Stripe-hosted checkout, not in the repo). `/agents` + `/admin`-hint need locating in the `app/` tree (a focused pass).
- **#15 F2K Checkpoint 401** → reclassified **needs-decision**: it's a REGULATED/contracted product (Engine 4). Blindly removing the auth wall to expose a public research alias may be wrong — confirm whether F2K Checkpoint is even a distributor-research candidate before de-authing it.

## P0 — Security (DONE)

| # | Product | Finding | Status |
|---|---------|---------|--------|
| 0 | rehearsals-ai / RaiseReady / raiseready-template | Anonymous visitor could trigger **real** Supabase/GitHub/Vercel/ElevenLabs provisioning via `/api/setup/*` (no auth/confirm/rate-limit). | ✅ **Fixed** — fail-closed `SETUP_SECRET` gate, PR #2 on `raiseready-template`. Pending: merge + set `SETUP_SECRET` on 3 Vercel projects. |

---

## P1 — Core-flow blockers (the recurring Gate-1 gap)

| # | Product | Repo local? | Finding (🔴) | Fix | Decision needed? |
|---|---------|-------------|--------------|-----|------------------|
| 1 | **Singify** | ✅ `singify-platform` | `/sing` **crashes the mobile tab on load** (media/pitch pipeline inits on route load). | Defer mic/camera/audio/pitch init until **after paint + user taps "Start baseline"**. | No — fix now. |
| 2 | **DealFindrs** | ❌ clone `deal-findrs` | **Signup submit is dead** — no handler fires, silent dead-end (magic-link works, so backend is alive). | Wire the password-signup submit to the auth backend. | No — fix now (after clone). |
| 3 | **InvestorPilot** | ✅ `investorpilot` | **Post-login `/dashboard` + every app route 404** — `(dashboard)` route-group in the build but no page resolves. Doubly load-bearing (it's the pipeline's own stage-3 engine). | Investigate why the `(dashboard)` pages don't ship to the deployed URL; ship them. | Investigate (likely deploy/build-output gap). |
| 4 | **Connexions** | ✅ `Connexions` | **White-label promise leaks** — the inspectable live tenant is stamped "by Corporate AI Solutions" + links to other CAS products (live counter-example to the white-label claim). | Strip ALL CAS branding from tenant instances (true white-label, env-driven vendor identity). | No — fix now (scope it). |
| 5 | **RaiseReady** | ✅ `raiseready-*` | Linked URL is the **generator, not the coaching product** — voice rehearsal/scoring never demonstrated. | Point the research link at a **live demo child deployment**, not the generator. | **Decision** — which demo child / provision one. |
| 6 | **rehearsals-ai** | ✅ `RehearsalsAI` | Core promise **routes to the VC builder** (RaiseReady), not a presenter rehearsal. | Ship one **always-on, no-signup sample rehearsal** the CTA lands on. | **Decision/build** — generic presenter sample. |

## P2 — Promise correctness / try-before-buy

| # | Product | Finding | Fix | Decision needed? |
|---|---------|---------|-----|------------------|
| 7 | **DealFindrs** | Hero targets buyers'-agents (buy-side) but `/reports` is a **development-feasibility tool** (QS/GRV/IRR/lender-pack). | Pick one ICP / add a buy-side mode, OR change the hero to match the product. | **Decision** — which ICP. |
| 8 | **Connexions** | **No try-before-buy** — `/buyer` form → straight to a live `cs_live_` $150 Stripe charge; the actual insight output only seen as a marketing mock. | Add a sandbox/preview tenant before the paywall + a "you're about to be charged" confirm. | No — build (medium). |

## P3 — Trust-killers + surgical polish (quick wins)

| # | Product | Items |
|---|---------|-------|
| 9  | **Connexions** | UTF-8 mojibake on Stripe page ("Cancel anytime â€¢"); `/agents` 404 dead-end in call chrome; public `/admin` leaks "Set ADMIN_SECRET_KEY…" hint to anon; `support@connexions.ai` third-domain mismatch. |
| 10 | **RaiseReady** | "See Live Example" + "Explore Demo First" both self-link to `/` (dead no-ops); setup wizard "Review" step **scrambles inputs** (first name→Company, email→First Name). |
| 11 | **rehearsals-ai** | Dead CTAs ("See Live Example"/"Explore Demo First" self-link; "Get Started"/`/setup` redirect home). |
| 12 | **Singify** | Mobile body text 14px / eyebrow 12px (sub-16px §1); voice-pill overlaps landing heading; **no before/after demo clip** (add one 15-sec clip on landing + studio so the promise is feel-able pre-setup). |
| 13 | **InvestorPilot** | Auth cookie `httpOnly:false` (XSS exposure); company-name field no ABN lookup. |
| 14 | **DealFindrs** | Confirm-password no eye-toggle/aria-label (§2); Company Address plain text → Mapbox; Company Name → ABN lookup; bare `tel` field. |

## Tier-1 HARD-fails (must clear before their Tier-2 deep pass)

| # | Product | Repo local? | Finding | Fix |
|---|---------|-------------|---------|-----|
| 15 | **F2K Checkpoint** | ✅ `F2K-Checkpoint` | Canonical alias returns **401** (a research link must be publicly openable). | Expose a public product alias / public landing. |
| 16 | **NDIS SDA** | ❌ clone | Slug serves the **wrong product** ("PF Platform — Property Friends" client instance). | Ship the real NDIS-SDA product page on the slug (same hijacked-slug issue that got it delisted). |

---

## Execution split

- **Fix now, no decision (this backfill):** #1 Singify crash, #4 Connexions white-label strip, #9–#14 surgical polish, #15 F2K public alias. #2 DealFindrs signup + #14 DealFindrs polish after clone.
- **Investigate:** #3 InvestorPilot dashboard-404 (deploy/build-output gap).
- **Needs Dennis decision:** #5 RaiseReady demo-child link, #6 rehearsals-ai sample rehearsal, #7 DealFindrs ICP, #8 Connexions sandbox tenant (build scope).

Order of work: **Singify (#1, #12) → InvestorPilot (#3 investigate) → Connexions (#4, #9) → clone DealFindrs (#2, #14) → F2K alias (#15)**, surfacing decisions as hit.
