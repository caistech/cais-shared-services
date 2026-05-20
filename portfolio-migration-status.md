# Portfolio Migration Status

**Single source of truth for the portfolio backfill driven by the 2026-05-19 naive-tester report.**
Source: `C:\Users\denni\naive-tester-reports\2026-05-19-1711\PORTFOLIO_ROOT_CAUSES.md`
Last updated: 2026-05-20 (Batch 1 closed; Batch 2 partial — RC2 cleared, RC1 surfaced as DNS-blocked)

Every product × every root cause is a cell. Update the cell when work lands. Don't track in your head.

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✓ | Fixed and verified (naive-tester rerun clean OR explicit confirmation on the cell's specific issue) |
| ✗ | Confirmed affected — fix pending |
| ? | Unknown — needs audit (treat as ✗ until proven ✓) |
| N/A | Not applicable to this product (no auth, no widget, no public buyer surface, etc.) |
| ⏳ | In-progress (operator currently working on it) |
| ⚠ | Blocked (note the blocker in the per-product notes) |

---

## Risk tier legend

| Tier | Symbol | Products |
|---|---|---|
| Regulated | 🔒 | Compliance-critical (NDIS, AFSL, MIS, R&D, NDB Article 33). Zero tolerance for ✗ in RC7/RC8. |
| Revenue | 💰 | Active or near-active paying customers / case-study products. ✗ in RC1/RC2/RC4 = priority. |
| Standard | ⚪ | Build / dogfood / early-stage. Standard cadence. |

---

## Root cause definitions

| Code | Root cause | Total products affected (per synthesis) | Hours est. | Batch order |
|---|---|---|---|---|
| RC1 | Vercel preview alias collisions (Routing-Bleed Mode A) | 21 | 12–20 | Batch 2 |
| RC2 | ElevenLabs ConvAI widget hijacks parent window (Mode B) | 11 | 6–10 | Batch 2 |
| RC3 | Supabase redirect-URL allowlist contamination (Mode C) | 2 confirmed, ~21 suspected | 3–4 | Batch 3 |
| RC4 | Auth pattern not enforced (forgot-password / visibility / magic-link) | 17 | 25–35 | Batch 4 |
| RC5 | No public demo / no sample artefact gating signup | 13 | 30–50 | Batch 7 |
| RC6 | Headline CTAs → 404 / anchor-only / redirect loop / empty body | 15 | 20–30 | Batch 5 (CI smoke) |
| RC7 | RLS open / `USING (true)` / unauth API endpoints (Privacy Act) | 5 | 15–25 | **Batch 1 (clock-on-now)** |
| RC8 | Trust scaffolding missing on regulated/financial/identity products | 8 | 25–40 | Batch 6 |
| RC9 | Brand / audience / vendor-identity leaking into buyer surfaces | 7 | 15–20 | Batch 8 |

---

## Execution batch order

| Batch | Root causes | Estimated hours | Target window |
|---|---|---|---|
| 1 | RC7 (Privacy Act sweep) | 15–25 | Today / this week |
| 2 | RC1 + RC2 (routing bleed both modes) | 20–30 | Next 1–2 weeks |
| 3 | RC3 (Supabase allowlist + onboard-script patch) | 3–4 | Week 2 |
| 4 | RC4 (shared `<AuthForm/>` + 17 wire-ups + Resend SMTP) | 25–35 | Weeks 3–4 |
| 5 | RC6 (CI route-smoke template + per-product rollout) | 17–25 | Week 4 |
| 6 | RC8 (trust scaffolding on regulated products) | 25–40 | Weeks 5–6 |
| 7 | RC5 (public demos / sample artefacts) | 30–50 | Weeks 6–8 |
| 8 | RC9 (brand-leak sweep + vendor-prop default-off) | 15–20 | Week 8 |
| 9 | Residue (10+ product-specific bugs from synthesis) | 15–25 | Week 9 |
| Cross-cut | Rule consolidation → `@caistech/portfolio-*` packages | 30–40 | Week 3 (between batches 2 and 4) |

**Total horizon:** ~6–9 weeks at sustainable portfolio pace (~25 hrs/wk substrate work per office-hours bandwidth tripwire).

---

## The table

> Cells: ✓ done · ✗ confirmed-affected · ? needs-audit · N/A not-applicable · ⏳ in-progress · ⚠ blocked
> Sorted by tier then alphabetical. Hot products (4+ root causes) flagged in Notes.

| Product | Tier | RC1 | RC2 | RC3 | RC4 | RC5 | RC6 | RC7 | RC8 | RC9 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| disaster-support | 🔒 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 (Supabase paused) |
| f2k-checkpoint | 🔒 | ✗ | ? | ✗ | ? | ? | ✗ | ? | ✗ | ? | **Hot (4 RCs)**. Mode-C confirmed (Stuart → ndissda-automate auth bleed). Backcheck submit fails (residue) |
| f2k-fund-tokenisation | 🔒 | ✗ | ? | ? | ? | ? | ? | ? | ✗ | ? | s1041H exposure on 30-day NAV claim (residue). AFSL holder / trustee not publicly named |
| f2k-fund-tokenisation-admin-consol | 🔒 | ✗ | N/A | ? | ✗ | N/A | ✗ | ? | ✗ | ? | LingoPure CTA → here on HTTP 429 (Mode A symptom) |
| f2-k-offshore-modular | 🔒 | ✗ | ? | ? | ? | ? | ? | ? | ✗ | ? | Wei: tab drift to F2K Projects / AIFTIS / LingoPure mid-session. JAS-ANZ issuer surfacing gap (residue) |
| mmcbuild | 🔒 | ✗ | N/A | ? | ? | N/A | ? | ? | ? | ✗ | NDA-locked. Footer Insta → karen.engel2026 personal (residue). Locked from open-source slate |
| ndissda-automate | 🔒 | ✗ | ? | ✗ | ? | ? | ? | ? | ✗ | ? | URL-query error reflection (phishing-by-URL) — residue. Auth flow paused 2026-05-16 |
| platform-trust | 🔒 | ✗ | ? | ? | ? | ? | ? | ✓ | ✗ | ? | **Hot (4 RCs)**. RC7 ✓ 2026-05-20 (R9 + R12 PASS post gate fix; intentional anon-public reads exempted in rls.config.json) |
| r-and-d-tax | 🔒 | ✗ | ? | ? | ? | ? | ? | ? | ✗ | ? | Climate heuristic missing QLD east coast (residue) |
| deal-findrs | 💰 | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | **Hot (5 RCs)**. Widget-consumer. US/Caribbean placeholder on AU product (residue). RC2 ✓ 2026-05-20 (no router leak, env scoped to 6 product-specific agents) |
| easy-claude-code | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | |
| investorpilot | 💰 | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer. Currently single-tenant for F2K. Production URL: investor-pilot-pi.vercel.app. RC2 ✓ 2026-05-20 (single product-scoped agent, no router leak) |
| partner-pilot | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| storefront-mcp | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: storefront-mcp-eight.vercel.app |
| tenderwatch | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: tenderwatch-alpha.vercel.app |
| aiftis-demo | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer. Mentioned in LingoPure cross-app returnTo allowlist. RC2 ✓ 2026-05-20 (generic ELEVENLABS_AGENT_ID, no router leak) |
| cais-interview-agent | ⚪ | ✗ | ? | ? | ? | ? | ✗ | ? | ? | ? | "Missing install id" dead-end UX (per bleed plan). MCP funnel — narrow by design |
| community-question-responder | ⚪ | ✓ | N/A | ✓ | ✓ | ✗ | ✓ | ✓ | N/A | ✓ | Built 2026-05-19/20 under current standard. Voice agent N/A pending VOICE AI rule retrofit. Slack BD play abandoned per Arnaud incident — pivoting to BYOK-free distribution |
| connexions | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ✓ | ? | ? | **Hot (5 RCs)**. RC7 ✓ + RC2 ✓ 2026-05-20. RC1 still affected — `connexions-silk.vercel.app` now serves "f27 survey" (hijack). Widget-consumer with demo + generic agent env (no router leak). |
| corporate-ai-solutions | ⚪ | ✗ | ✓ | ? | ? | N/A | ? | ? | ? | ? | Marketing site. RC2 ✓ 2026-05-20 — VoiceAgent.tsx is mock (TODO at line 100, canned responses), canRoute dead code. Only NEXT_PUBLIC_ELEVENLABS_AGENT_KIRA env set (proper home for the portfolio-router agent). |
| coordination-hub | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not in bleed list — needs initial audit |
| f2k-projects | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Video flyover fallback text on iOS Safari codec (residue) |
| gbta-openclaw | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not flagged in bleed list — verify production URL |
| hair-stylist-ai | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer (indirect via shared UI packages). RC2 ✓ 2026-05-20 — no ConvAI env vars configured at all. Margaret's "Start talking" → here |
| kira | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | RC2 ✓ 2026-05-20 — env scoped to KIRA_SETUP_AGENT_ID/PUBGUARD_KIRA_AGENT_ID (no router leak). `auto-connect="true"` at app/start/page.tsx:326 is the legitimate gated exception per the plan. RC1: bare slug kira.vercel.app hijacked by external "Kira - Spotify regional availability" app. Canonical: kira-rho.vercel.app |
| launchready | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | **Hot (4 RCs)**. Production URL: launchready-ruby.vercel.app |
| leadspark-tenant | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| lessonslearned | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: lessonslearned-wheat.vercel.app |
| lingo-pure-ai | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | RC2 ✓ 2026-05-20 — generic ELEVENLABS_AGENT_ID, no router leak. Widget-consumer. Megumi: "Get Started" → f2-k-fund-tokenisation-admin-consol on HTTP 429 |
| longtail-ai-venture-studio | ⚪ | ✗ | ? | ? | ? | ? | ? | ✓ | ? | ? | **Hot (4 RCs)**. RC7 ✓ 2026-05-20 (R9 + R12 PASS; drop migration 003_rls_replace_open_plans_prices_subs.sql) |
| mova | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not flagged in bleed list — needs initial audit |
| omq-outreach | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| outreach-ready | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| prelabz | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | RC2 ✓ 2026-05-20 — no ConvAI env vars set. Asha: tab bounced to LingoPure, then F2K Admin Console; HTTP 429 |
| property-services | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: property-services-kappa.vercel.app |
| raiseready-impact | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: raiseready-six.vercel.app |
| raiseready-template | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ✗ | "White-label" demo carries Calendly handle in 14 places — proves opposite of white-label pitch (RC9 confirmed) |
| rehearsals-ai | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not flagged in bleed list — needs initial audit |
| smart-board | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: smart-board-eight.vercel.app |
| story-verse | ⚪ | ✗ | ? | ? | ? | ? | ? | ✓ | ✗ | ? | **Hot (6 RCs)**. RC7 ✓ 2026-05-20 (R9 + R12 PASS; drop migration 20260519200817_rls_subscriptions_drop_wide_open.sql). Children's voice clones with no /privacy /parents /safety (residue + RC8). Production URL: story-verse-two.vercel.app |
| tour-lingo | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | RC2 ✓ 2026-05-20 — no ConvAI env vars set in TourLingo project. Widget-consumer. Rohan: silent navigation to kira-rho / universal-interviews / cais-interview-agent / longtail-ai-venture-studio after wait |
| tourlingo-operator | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ? | ? | ? | RC2 ✓ 2026-05-20. Same as tour-lingo (likely same product / aliased) |
| universal-interviews | ⚪ | ✗ | ✓ | ? | ? | ? | ? | ✓ | ? | ✗ | **Hot (6 RCs)**. RC7 ✓ + RC2 ✓ 2026-05-20. ELEVENLABS_SETUP_AGENT_ID scoped to UI setup flow. Drop migration 20260519221711_rls_membership_scoped.sql closed R9. Bea: 5 refreshes → 6 different products including DEPLOYMENT_NOT_FOUND. `$200K raise banner` on candidate screen (residue). Buyer page footer → connexions-silk (RC9 confirmed). |
| universallingo | ⚪ | ? | ✓ | ? | ? | ? | ? | ? | ? | ? | RC2 ✓ 2026-05-20. Widget-consumer per bleed plan inventory |

**Counts (current state):**

| RC | ✓ | ✗ | ? | N/A | Per-RC target (per synthesis) |
|---|---|---|---|---|---|
| RC1 | 1 | 30 | 6 | 0 | 21 confirmed affected. 5 confirmed bare-slug hijacks via portfolio-alias-probe (2026-05-20). Team-canonical `-corporate-ai-solutions` URLs are 401 deployment-protected. Resolution gated on DNS (Namecheap manual) or auth-protection change. |
| RC2 | 11 | 0 | 24 | 2 | 11 widget-consumers cleared at code level (2026-05-20). Shared @caistech/elevenlabs-convai has no nav tools; agent-ID env inventory shows no portfolio-router leak; canRoute in CAIS is dead code; Kira auto-connect="true" is the legitimate gated exception. Out-of-repo ElevenLabs dashboard agent configs remain unverified. |
| RC3 | 1 | 2 | 34 | 0 | 2 confirmed, ~21 suspected — audit fills the ? cells |
| RC4 | 1 | 0 | 36 | 0 | 17 affected — audit fills the ? cells |
| RC5 | 0 | 1 | 34 | 2 | 13 affected — audit fills the ? cells |
| RC6 | 1 | 2 | 33 | 1 | 15 affected — audit fills the ? cells |
| RC7 | 5 | 0 | 32 | 0 | All 5 candidate products PASS R9 + R12 (post gate fix 0.3.3). Batch 1 closed |
| RC8 | 0 | 7 | 30 | 0 | 8 affected — one ? to confirm |
| RC9 | 1 | 2 | 32 | 2 | 7 affected — audit fills the ? cells |

---

## Per-product residue (the ~10 product-specific bugs)

Carried alongside the root-cause migration. Each rides with its product's RC fixes, not consolidated.

| Product | Residue item | Severity |
|---|---|---|
| f2k-checkpoint | Backcheck submit silently fails (HTML5 required + middleware-503 combo) | High |
| mmcbuild | Footer Instagram links to karen.engel2026 personal account (also in JSON-LD) | High (brand+privacy) |
| story-verse | Children's voice clones with no /privacy /parents /safety | 🚨 Critical (under-13 risk) |
| f2k-projects | Video flyover fallback text on iOS Safari (codec) | Medium |
| deal-findrs | Hero showing US/Caribbean placeholder on AU product | High |
| f2k-fund-tokenisation | 30-day NAV claim against illiquid SPVs (s1041H exposure) | 🚨 Critical (regulatory) |
| universal-interviews | $200K raise banner on candidate-facing screens (ResearchHero import) | High |
| ndissda-automate | URL-query error reflection (phishing-by-URL) | High |
| f2-k-offshore-modular | JAS-ANZ-issuer surfacing gap | High (regulatory) |
| r-and-d-tax | Climate heuristic missing QLD east coast | Medium |

---

## How to update this file

1. **When you finish a fix on a product × RC cell**, change `✗` (or `?`) to `✓` in the table.
2. **When you start a fix**, change to `⏳` so other sessions don't double-handle.
3. **When you discover a cell is actually N/A**, mark it and add a one-line note explaining why in the Notes column.
4. **When you hit a blocker**, change to `⚠` and write the blocker in Notes.
5. **When the audit fills a `?`**, mark `✗` or `✓` accordingly.
6. **Update the date at the top** every time you touch the file.
7. **Update the counts table** when the row distributions change materially (don't recompute on every cell flip — recompute weekly or at batch boundaries).

The pre-batch ritual for each of the 9 batches:

1. Filter the table by the batch's RC column. Pull the ✗ and ? cells.
2. For ?: audit the product on this specific RC first. If clean → mark ✓, drop from batch. If affected → mark ✗, include in batch.
3. Group ✗ products by similarity of fix (shared component? per-product config? schema migration?).
4. Execute the batch in priority order: 🔒 → 💰 → ⚪.
5. After each cell flips to ✓, naive-tester-rerun the affected product to verify (the fix-then-test loop the synthesis recommends).

---

## Hot products to watch (most root causes hitting simultaneously)

From the synthesis — these get the biggest lift from any cross-cut fix. Worth re-running naive-tester on these specifically at the end of each batch to verify the lift compounds:

1. **universal-interviews** (6 root causes)
2. **story-verse** (6)
3. **connexions** (5)
4. **deal-findrs** (5)
5. **platform-trust** (4)
6. **longtail-ai-venture-studio** (4)
7. **launchready** (4)
8. **f2k-checkpoint** (4)

---

## Cross-cut: rule consolidation (substrate work)

Sitting in week 3 between batches 2 and 4. Builds the infrastructure that batches 4-9 inherit:

- `@caistech/portfolio-ci` — shared CI tests (auth-pattern grep, route smoke, bare-slug grep, `auto-connect="false"` grep, `process.env.X` BYOK classification, RLS `USING (true)` audit)
- `@caistech/portfolio-bootstrap` — consolidated setup automation (currently scattered across `onboard-new-project.sh`, `harvest-secrets.mjs`, `set-caistech-token.sh`, `setup-product-credentials.mjs`)
- `@caistech/portfolio-deploy-gate` — pre-deploy invariants (alias probe, naive-tester rerun, brand-leak grep, Supabase allowlist sweep)

After this lands, the global CLAUDE.md compresses from ~660 lines to ~150–200 lines. Rules move from "operator remembers" to "substrate enforces". Tracker entries flip ✓ as products inherit on next deploy.

---

## Update log

| Date | Change | Updater |
|---|---|---|
| 2026-05-20 | Initial tracker created from PORTFOLIO_ROOT_CAUSES.md synthesis | claude (session 1c092514) |
| 2026-05-20 | Batch 1 (RC7) closed — all 5 candidate products PASS R9 + R12. Drop migrations already landed; morning audit was false-positive due to portfolio-gate config-discovery bug (now patched, 0.3.3) | claude (this session) |
| 2026-05-20 | Batch 2 partial: RC2 (ConvAI hijack) cleared — shared package has no nav tools, agent-ID inventory across 11 widget-consumers shows no portfolio-router leak, canRoute in CAIS constants is dead code (mock VoiceAgent). Kira auto-connect="true" is the documented legitimate exception. RC2 effectively closed at code level; out-of-repo ElevenLabs dashboard configs remain unverified. RC1 (Vercel alias collisions) surfaced as a deeper issue: portfolio-alias-probe (new script) confirmed 5 hijacks (connexions-silk → "f27 survey", ndissda-automate.vercel.app → "PF Platform", mmcbuild.vercel.app → "MMC Minting dApp", mova.vercel.app → "Self Tutor", omq-outreach defaults to "Create Next App") plus 2 unowned 404s. Every team-canonical `<slug>-corporate-ai-solutions.vercel.app` URL is 401 deployment-protected — no working public swap exists. Resolution gated on custom DNS (corporateaisolutions.com is at Namecheap, requires manual CNAME or API token). Hijacked constants.ts entries marked with inline comments; no URL swap until DNS unblocks. | claude (this session) |
