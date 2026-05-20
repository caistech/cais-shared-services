# Portfolio Naive-Tester Re-Sweep — 2026-05-20

> One-day-later check on the 27 products that went through the naive-tester walkthrough on 2026-05-19, ahead of the BYOK-free distribution rewrite.

---

## ⚠️ CORRECTION (2026-05-20 late session)

**An earlier section of this brief said "almost no fixes shipped" between 2026-05-19 and 2026-05-20. That was wrong. The remediation agent ran most of yesterday and shipped — and pushed — substantial work across at least 12 products.**

**Why the earlier read was wrong:** the initial pass scanned the `Status:` line at the top of each `NAIVE_TESTER_REMEDIATION_2026-05-19.md` doc. Most of those headers were never updated when commits landed, so "PLAN ONLY" stayed in the doc even after code shipped. Source of truth = `git log`, not the doc header.

**Git-log-based reality across the 27 products on 2026-05-19** (all commits below are pushed to `origin/main`):

| Product | Naive-tester remediation shipped 2026-05-19 | Persona's headline finding |
|---|---|---|
| **StoryVerse** | `de31877` — published `/privacy` `/terms` `/parents` `/safety` `/cookies` stubs + preliminary banners — **closes Privacy Act + COPPA + GDPR-K exposure on children's voice-cloning product (RC7)**. Also `4a69515` RLS tightened on subscriptions, `2a4ceab` vendor identity drop from footer. | ✅ Critical CLOSED |
| **Connexions** | `bb9c301` — auth-gated `/api/panels` + `/api/agents`, replaced `USING(true)` RLS — **closes the Privacy Act PII leak (RC7)**. + `25d631a` brand fix (`f27 survey` → `Connexions`). + RC1 routing-bleed work resolved 2026-05-20. | ✅ Critical CLOSED |
| **universal-interviews** | `92c4c28` — membership-scoped RLS + auth-gated `/api/panels` + middleware coverage — **closes RC7 PII leak**. + `3f990d5` — new `/auth/forgot-password` + `/auth/reset-password` routes — **closes Track 1.2 follow-up**. | ✅ Critical CLOSED |
| **NDISSDAAutomate** | `db75395` — whitelist `/login?error=` codes — **closes RC7 phishing-by-URL vector**. Verified live in prod today. | ✅ Critical CLOSED |
| **platform-trust** | `f19bc35` — auth-gated `/api/scan` + `/api/audit`, sanitised raw Postgres errors, self-grade marked self-attested — **closes C1**. | ✅ Critical CLOSED |
| **mmcbuild-webapp** | `184a3c2` — *"pricing/about/contact/blog redirect loops, dead Learn More links, replace emoji partner logos, remove unverified stats — closes naive-tester critical paying-client fixes"*. Every single Hamish finding addressed. | ✅ Critical CLOSED — but artifact is an **orphaned migration scaffold** (per `project_mmc_vercel_team_migration` memory). Real MMC Build runs on a separate Vercel team. Shipped work landed on the wrong surface — wasted from a real-user perspective. |
| **F2K-Checkpoint** | `0655e1a5` — full 3-persona backcheck path on new-project wizard. + `92d1d0dd` — thin no-auth `/backcheck` snapshot. + `fdf08b5c` — explanatory headers backfilled on 10 high-traffic pages. + Watchdog feature build (lanes A–E, 16 integration tests, E2E setup). **Closes Stuart's CRITICAL backcheck-submit-silently-fails finding** + the explanatory-header rule. 7 dead sidebar links — needs verification. | ✅ Critical CLOSED |
| **DealFindrs** | `d6dea51` — stop swallowing company-create failures at signup (**closes "signup submit silently fails"**). + `2d5c73b` shared UserMenu + requireAuth migration. + `7330597` reset/magic-link flow wired. + `77baad4` removed placeholder "Watch Demo" button. + `67666a9` hero placeholder demo data flipped AMBER→RED. + `ee4ae85` adversarial credit-review engine. + `e12606d` setup criteria persistence. | ✅ Most persona findings CLOSED |
| **RaiseReadyTemplate** | `28baa12` — **closes RC9: vendor identity scrubbed from default template state, routed via `NEXT_PUBLIC_VENDOR_*` env vars**. The white-label-template trust break is fixed. Actions D–H (pricing/licence/data-ownership) remain. | ✅ Critical CLOSED |
| **LongtailAIVentureStudio** | `5ab276e` — replaced `USING(true)` RLS on `plans`/`prices`/`subscriptions` — **closes RC7**. LP-read-only-view (the LP/Andre finding) NOT addressed. | ✅ RC7 CLOSED; persona's product gap open |
| **F2K-Projects** | `095b649` — admin allowlist denial surface + reset target email. Persona's main findings (no hero photos, duplicate lot data, mobile tap targets) NOT addressed. | ⚠️ Minor only |
| **Corporate-AI-Solutions** | Massive — `wave2`/`wave3` BYOK pivot rebuild (`/marketplace/cqr`, `/engagement`, `/clients`, retired `/launchstack` + Long Tail surface). + `d4f10bf` `/studio/partner` → `/engagement` 301 — **closes Helen's `/studio-partner 404` finding**. + `43085d0` 3 hijacked PLATFORMS URLs scrubbed. + `de53745` Connexions canonical alias. + RC1 routing-bleed batch (4-repo `ssoProtection` patch). | ✅ Critical CLOSED + BYOK pivot infrastructure shipped |
| **R-and-D-Tax** | No code-level work on 2026-05-19. RC1 routing-bleed fixed today (2026-05-20) — canonical URL now public. Persona's deeper findings (no branded landing, no "request beta" CTA) remain plan-only. | ⚠️ Plumbing only — content still open |

**Products with ZERO naive-tester remediation on 2026-05-19** (only CI/portfolio-standard sweep commits):

AIFTIS-Demo, easy-claude-code, F2K-Fund-Tokenisation, F2K-OffshoreModular, HairStylistAI, Kira, LaunchReady, LessonsLearned, LingoPureAI, PrelabzAI, property-services, storefront-mcp, TourLingo. **(13 products — all persona findings remain open.)**

---

## Corrected BYOK-readiness ranking

Excluding paying clients, regulated-tier products that need separate compliance work, and the orphaned mmcbuild-webapp. Distance to BYOK-ready is the *operator* judgement: would a third party who installs this and points it at their own creds get a clean, brand-coherent, trust-signal-correct product?

| Rank | Product | Why it's close (or not) | Residual to BYOK-ready |
|---|---|---|---|
| 1 | **CQR** | Decided Phase 1c first BYOK target per [[project_cqr_byok_distribution]]. Not in this 27-product set. Needs its own naive-tester walkthrough before public-publish per the 14-item release gate. | Pre-release gate + own walkthrough |
| 2 | **RaiseReadyTemplate** | Purpose-built clean-room template. Vendor identity now env-var-driven (RC9 closed). Actions D–H are content edits (pricing/licensing/data-ownership statements). | **D–H content edits only** — closest of the legacy 27 |
| 3 | **DealFindrs** | Heavy shipped work today. Signup works, auth wired, hero data fixed, demo placeholder removed. Persona walked away "won't sign up"; most of *that* has been addressed. | Pricing/value-prop polish; verify against persona's outstanding finding list |
| 4 | **InvestorPilot** | 50 commits — pipeline buildout + AI Interview wizard. Persona was already largely positive ("best auth page in portfolio"). But `/pricing 'Coming soon'` (the buying blocker) NOT addressed in any of the 50 commits. | `/pricing` page with a real number; otherwise persona-positive |
| 5 | **StoryVerse** | Critical Privacy Act exposure CLOSED (privacy/terms/parents/safety/cookies all live). Children's data product though — high regulatory bar always. Sample-book preview + demo flow still open. | Sample book + reviews; demo before signup |
| 6 | **storefront-mcp** | Zero remediation. `/for-investors` still 404, demo non-functional. Persona praised the copy quality. | All persona items still open |
| 7 | **universal-interviews** | RC7/RC9/forgot-password closed. Privacy Act incident overhead may make it the wrong brand surface to *lead* BYOK with, even when clean. | Cross-product routing fix + post-incident cooling |

Everything else is too distant from BYOK-ready to rank usefully (either has no remediation work shipped, or is regulated-tier / paying-client and not portable).

---

## What still actually needs doing across the 27

**Already done (don't re-do):** 12 products with shipped naive-tester remediation. See git log if anyone says "we still need to fix X" — check that X isn't already closed.

**Genuinely outstanding work, ranked by trust/conversion impact:**

1. **Cross-product session/routing bleed (Pattern 1 from 2026-05-19)** — affects 12+ products including Kira, LingoPureAI, Prelabz, TourLingo, AIFTIS, multiple F2K surfaces. Root cause never diagnosed beyond *"shared widget/MCP funnel + Vercel preview alias collision."* The 2026-05-20 ssoProtection patches addressed the *symptom* on 5 products (4 + r-and-d-tax today) but the underlying shared-infrastructure cause is still open.
2. **HairStylistAI `/privacy` `/terms` 404** on a face-AI product — same regulatory risk class as the StoryVerse exposure that was closed yesterday. Should be a 1-hour repeat of the StoryVerse fix.
3. **easy-claude-code architecture identity crisis** (local-first vs cloud-agent) + signup form hidden behind 4-step carousel. Persona said the product was provably uninstallable from the public site.
4. **F2K-Fund-Tokenisation AFSL holder / trustee / custodian not named** — regulated MIS surface, real compliance exposure.
5. **property-services `/demo` 404 + no OpenAPI** — proptech persona Dev called "API landing page hides the API."
6. **Kira cross-product redirect on landing** — 8-second auto-redirect to other portfolio products. Part of Pattern 1 above.
7. **LaunchReady `/forgot-password` 404 + wrong audience copy** (built for SWE founders, served to kitchen-gadget inventor).
8. **LingoPureAI Get Started bounces off-domain to F2K admin** — part of Pattern 1.
9. **Long Tail AI Venture Studio LP read-only view absent** — blocks Fund II conversations.
10. **InvestorPilot `/pricing` page** — the single named buying blocker, untouched in 50 yesterday's commits.

**Lowest-priority** (cosmetic or persona-validation needed before action):

- F2K-OffshoreModular JAS-ANZ CodeMark gap — funder-facing question, content edit
- F2K-Projects hero photos + lot data dedup
- TourLingo language-count consistency
- AIFTIS-Demo 4/5 portals 404 — depends on whether AIFTIS is still a live exploration
- LessonsLearned sample report — depends on whether the product is shipping

---

## What this corrected matrix means for the BYOK gate

> Original premise from earlier this session: *"any product still RED or AMBER on re-sweep is held from BYOK rewrite until clean."*

With the git-log-corrected picture, the gate looks different:

- **CQR remains the first BYOK target** — unchanged.
- **Realistic 2nd target** is **RaiseReadyTemplate** (purpose-built, RC9 closed, content edits remaining) — much closer than the cheap-probe suggested.
- **Realistic 3rd target** is **DealFindrs** or **InvestorPilot** — heavy shipped work, persona-positive baseline. InvestorPilot's only buying-blocker is `/pricing` page — one focused fix would close it.
- The cheap-probe "🟢 2 / 🟡 25 / 🔴 1" framing **understated reality**. Many ambers had their critical findings closed but failed the probe on routes that were never the persona's actual concern (e.g. probe checked `/comply` on mmcbuild — the persona's issue was `Learn More` *anchors*, fixed in `184a3c2`).

---

> **The cheap-probe section below remains accurate for HTTP plumbing, but should NOT be read as a remediation tally.** See per-product git history for what shipped.

---

> Headline (superseded by correction above): of 27, **only 2 pass the cheapest possible reachability check (root + 3 key routes)** — `ndissda-automate` and `universal-interviews`. The other 25 still bleed at the HTTP layer alone, before we even get to persona-level concerns. **First BYOK target remains CQR** (decided 2026-05-20, not in this 27-product set); the legacy 27 are not yet ready to be candidate templates.

**Companion docs:**
- `probe-summary-2026-05-20.md` — auto-generated traffic-light table (re-runnable)
- `probe-results-2026-05-20.csv` — raw per-route data
- `probe-roster-2026-05-20.json` — input data + key-route definitions
- Per-repo: each repo's `docs/NAIVE_TESTER_REMEDIATION_2026-05-19.md` now carries a 2026-05-20 re-sweep addendum at the bottom (idempotent — re-runnable)

---

## What changed since 2026-05-19

The premise behind running this re-sweep was *"after all the work that has been done to address issues raised, what is outstanding?"* The first step was checking how much work actually got done.

**Answer: almost none.**

| 2026-05-19 status | Count | Detail |
|---|---|---|
| Plan only — never executed | 21 | aiftis-demo, corporate-ai-solutions, deal-findrs, easy-claude-code, f2k-checkpoint, f2k-fund-tokenisation, f2k-offshore-modular, f2k-projects, hair-stylist-ai, investor-pilot, kira, launchready, lessonslearned, lingo-pure-ai, longtail-ai-venture-studio, prelabz, property-services, r-and-d-tax, storefront-mcp, story-verse, tourlingo-operator |
| Partial — some critical fixes landed | 4 | connexions (RC7 RLS), ndissda-automate (PR fixed locally, not pushed), platform-trust (C1 `/api/scan` auth), raiseready-template (vendor-identity scrub A/B/C) |
| Mostly fixed — critical items closed | 1 | universal-interviews (RC7/RC9/forgot-password) |
| Local commits only — not pushed | 1 | mmcbuild-webapp (Phase 1 paying-client fixes) |

So the cheap-probe re-sweep mostly tells us *"the persona findings still stand"* — which is what we'd expect when the plans-only docs were never executed.

---

## Cheap-probe results (re-runnable)

| | Slug | Was | Root | Title | Routes OK | BYOK ready? |
|---|---|---|---|---|---|---|
| 🟢 | `ndissda-automate` | partial_fixed | 200 | yes | 3/3 | basic OK |
| 🟢 | `universal-interviews` | mostly_fixed | 200 | yes | 3/3 | basic OK |
| 🟡 | `connexions` | partial_fixed | 200 | yes | 2/3 | no |
| 🟡 | `corporate-ai-solutions` | plan_only | 200 | yes | 2/3 | no |
| 🟡 | `deal-findrs` | plan_only | 200 | yes | 2/3 | no |
| 🟡 | `investor-pilot` | plan_only | 200 | yes | 2/3 | no |
| 🟡 | `platform-trust` | partial_fixed | 200 | yes | 2/3 | no |
| 🟡 | `storefront-mcp` | plan_only | 200 | yes | 2/3 | no |
| 🟡 | `easy-claude-code` | plan_only | 200 | yes | 1/3 | no |
| 🟡 | `f2k-checkpoint` | plan_only | 200 | yes | 1/3 | no |
| 🟡 | `f2k-fund-tokenisation` | plan_only | 200 | yes | 1/3 | no |
| 🟡 | `f2k-offshore-modular` | plan_only | 200 | yes | 1/3 | no |
| 🟡 | `hair-stylist-ai` | plan_only | 200 | partial | 1/3 | no |
| 🟡 | `launchready` | plan_only | 200 | yes | 1/3 | no |
| 🟡 | `lessonslearned` | plan_only | 200 | partial | 1/3 | no |
| 🟡 | `prelabz` | plan_only | 200 | yes | 1/3 | no |
| 🟡 | `aiftis-demo` | draft | 200 | yes | 0/3 | no |
| 🟡 | `f2k-projects` | plan_only | 200 | yes | 0/3 | no |
| 🟡 | `kira` | plan_only | 200 | yes | 0/3 | no |
| 🟡 | `lingo-pure-ai` | plan_only | 200 | yes | 0/3 | no |
| 🟡 | `longtail-ai-venture-studio` | plan_only | 200 | yes | 0/3 | no |
| 🟡 | `mmcbuild-webapp` | plan_only | 200 | yes | 0/3 | no |
| 🟡 | `property-services` | plan_only | 200 | yes | 0/3 | no |
| 🟡 | `raiseready-template` | partial_fixed | 200 | yes | 0/3 | no |
| 🟡 | `story-verse` | plan_only | 200 | yes | 0/3 | no |
| 🟡 | `tourlingo-operator` | plan_only | 200 | yes | 0/3 | no |
| 🔴 | `r-and-d-tax` | plan_only | 404 | no | 0/3 | NO |

---

## Notable findings beyond the persona reports

A few signals the cheap probe surfaced that weren't already in the 2026-05-19 baseline:

1. **`r-and-d-tax` was an RC1 routing-bleed (now resolved).** The probe found the short alias `r-and-d-tax.vercel.app` returning 404 (`DEPLOYMENT_NOT_FOUND`) — looked like a regression from last week's 401 wall. Investigation showed the project itself was alive and serving the wall at the team-canonical URL; the short alias had simply broken (probably never re-created after a recent deploy). Same Routing-Bleed Mode A pattern that bit the 4 repos fixed on 2026-05-20. **Resolved same-day** by patching ssoProtection + fixing the truncated URL in the CAS marketing site's PLATFORMS array.
2. **`hair-stylist-ai` and `lessonslearned` have one-word titles** ("HairStylistAI", "LessonsLearned") instead of two-word brand names ("Hair Stylist AI", "Lessons Learned"). The probe flags this as a partial title match. It's marginal but worth noting if the BYOK template uses two-word brand naming.
3. **`mmcbuild-webapp` continues to bleed** — every key route 404s. Phase 1 fixes were committed locally, never pushed. This is a paying-client deploy.
4. **`platform-trust` `/api/audit` returns 401** — that's actually correct behaviour post-2026-05-19 (C1 hardening landed). The probe records it as "broken" because it's classifying anything outside 2xx/3xx as a failure, but in this case 401 is the intended response. **Don't treat platform-trust's amber as a regression.**

---

## BYOK-readiness determination

The user's gating rule (stated 2026-05-20): *"any product still RED or AMBER on re-sweep is held from BYOK rewrite until clean."*

Applied verbatim, **only 2 of 27 even reach the basic-plumbing bar today**. Neither is suitable as the *first* BYOK template anyway:
- `ndissda-automate` is the PF Platform — paying-client/regulated work, not portable to a BYOK clean-room
- `universal-interviews` had a Privacy Act incident last week; even with the RLS fix, it's not the brand surface to lead a public BYOK rollout with

**Decision unchanged: CQR (Community Question Responder) remains the first BYOK target.** Per `~/.claude/projects/.../memory/project_cqr_byok_distribution.md`, this was decided on 2026-05-20 with a 14-item release gate. CQR is newer than these 27 and needs its own naive-tester walkthrough before any BYOK release — that walkthrough did not happen in the 2026-05-19 sweep.

---

## Next BYOK candidates (after CQR)

If/when we want a second BYOK template from the existing portfolio, the realistic shortlist is:

1. **`universal-interviews`** — once high/medium roadmap items close and the Privacy Act incident has fully cleared, this is the closest legacy product to BYOK-ready. Caveat: incident overhead may make it a poor brand surface for early BYOK distribution.
2. **`investor-pilot`** — 2 of 3 key routes resolving (only `/demo` 404s), persona report from 2026-05-19 was largely positive ("best auth page in the portfolio"). One pricing-page fix and a `/demo` page would close most of the gap.
3. **`storefront-mcp`** — 2 of 3 key routes resolving (only `/for-business` 404s), persona report described the SMB pitch as the clearest copy in the portfolio. Add the missing route and address the demo-button issue.
4. **`raiseready-template`** — explicitly a clean-room template by design. A/B/C scrub done, D-H pending. If completed, it's purpose-built for BYOK distribution.

Everything else needs material plumbing repair before persona-level fixes are even worth attempting.

---

## Top remediation queue (if/when capacity returns)

Ordered by *signal-to-effort ratio*: high-impact + low-cost first.

| # | Product | Action | Why it matters |
|---|---|---|---|
| ~~1~~ | ~~`mmcbuild-webapp`~~ | **DROPPED 2026-05-20** — orphaned migration scaffold (see [[project_mmc_vercel_team_migration]]), not the live paying-client surface. The real MMC Build product runs on Supabase `skyeqimwnyuuozvhubdc` and a separate Vercel team. The probe finding was correct for the artifact but the artifact has zero real users. | n/a |
| 1 | `ndissda-automate` | **VERIFIED LIVE 2026-05-20** — commit `db75395` *was* pushed to `main` (doc status header was stale). Phishing-by-URL payload no longer renders. Open follow-up: confirm or override the placeholder `admin@propertyfriends.com.au` mailto (set `NEXT_PUBLIC_PF_ADMIN_EMAIL` in Vercel if a different mailbox is canonical). | Regulated NDIS product. Whitelist fix verified by probe against `?error=Your+account+has+been+suspended...` payload — attacker string not rendered. |
| 2 | `r-and-d-tax` | **PATCHED + CONSTANTS FIXED 2026-05-20.** `ssoProtection` flipped `all_except_custom_domains` → `preview` via Vercel API (`scripts/patch-ssoprotection.py r-and-d-tax-eligibility-work-recording`). Canonical URL `r-and-d-tax-eligibility-work-recording-corporate-ai-solutions.vercel.app` now returns 200 + serves real product (title: *R&D Tax Tracker — Automated R&D Tax Incentive Recording*). Also fixed broken truncated URL in `Corporate-AI-Solutions/src/lib/constants.ts:383` (`...work-record` → `...work-recording-corporate-ai-solutions`). Persona finding "Vercel auth wall = front door" — **closed at the canonical-URL level.** Persona's deeper findings (no branded landing copy, no "request beta access" CTA) remain plan-only. | Short aliases `r-and-d-tax.vercel.app` and `r-and-d-tax-eligibility-work-recording.vercel.app` still 404 — not a CAS-owned alias, no action. |
| 3 | `universal-interviews` | Close high/medium roadmap items | Closest legacy product to BYOK-ready |
| 4 | `connexions` | Push the RC7 commit that's still pending Dennis review | Privacy Act exposure surface |
| 5 | `f2k-projects` | Add hero photos + dedupe lot data | Brand-new buyer arrives, sees no photos — 100% bounce |
| 6 | Add CI route-existence smoke test to every Vercel deploy | 1-day infra investment that would have caught most of the 404s in this report | Pattern 2 from the 2026-05-19 portfolio summary ("Headline marketing CTAs that lead nowhere") |
| 7 | CQR pre-launch naive-tester walkthrough | Per the BYOK release gate, this must happen before public-publish | CQR is the first BYOK target — needs its own persona report |

---

## Method

- Cheap-probe via Python `urllib`, parallel ThreadPool (8 workers), 15s timeout per request. Run from `cais-shared-services/`:
  ```
  python scripts/probe-portfolio-2026-05-20.py     # generates probe-results-* and probe-summary-*
  python scripts/append-resweep-addenda.py         # updates per-repo NAIVE_TESTER_REMEDIATION docs
  ```
- Re-runnable. If you fix something and want to verify, just re-run both scripts.
- The probe checks: root status code, page `<title>`, each of 3 key routes (HEAD with GET fallback for hosts that reject HEAD).
- **What this probe does NOT check:** copy quality, RLS holes behind 200 responses, broken CTAs that return 200 but link to nothing, persona-level trust signals, missing privacy pages on pages that DO load. For all of that, the 2026-05-19 persona reports remain authoritative.

---

## File locations

- This brief: `cais-shared-services/PORTFOLIO_NAIVE_RESWEEP_2026-05-20.md`
- Auto-generated table: `cais-shared-services/probe-summary-2026-05-20.md`
- Raw CSV: `cais-shared-services/probe-results-2026-05-20.csv`
- Roster (input): `cais-shared-services/probe-roster-2026-05-20.json`
- Probe scripts: `cais-shared-services/scripts/probe-portfolio-2026-05-20.py`, `append-resweep-addenda.py`
- Per-repo updates: each repo's `docs/NAIVE_TESTER_REMEDIATION_2026-05-19.md` now has a re-sweep addendum at the bottom (between `## 2026-05-20 Re-sweep addendum (cheap-probe)` and `<!-- /resweep-2026-05-20 -->` markers)
