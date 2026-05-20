# Portfolio Migration Status

**Single source of truth for the portfolio backfill driven by the 2026-05-19 naive-tester report.**
Source: `C:\Users\denni\naive-tester-reports\2026-05-19-1711\PORTFOLIO_ROOT_CAUSES.md`
Last updated: 2026-05-20 (Batch 1 closed)

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
| deal-findrs | 💰 | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | **Hot (5 RCs)**. Widget-consumer. US/Caribbean placeholder on AU product (residue) |
| easy-claude-code | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | |
| investorpilot | 💰 | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer. Currently single-tenant for F2K. Production URL: investor-pilot-pi.vercel.app |
| partner-pilot | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| storefront-mcp | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: storefront-mcp-eight.vercel.app |
| tenderwatch | 💰 | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: tenderwatch-alpha.vercel.app |
| aiftis-demo | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer. Mentioned in LingoPure cross-app returnTo allowlist |
| cais-interview-agent | ⚪ | ✗ | ? | ? | ? | ? | ✗ | ? | ? | ? | "Missing install id" dead-end UX (per bleed plan). MCP funnel — narrow by design |
| community-question-responder | ⚪ | ✓ | N/A | ✓ | ✓ | ✗ | ✓ | ✓ | N/A | ✓ | Built 2026-05-19/20 under current standard. Voice agent N/A pending VOICE AI rule retrofit. Slack BD play abandoned per Arnaud incident — pivoting to BYOK-free distribution |
| connexions | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ✓ | ? | ? | **Hot (5 RCs)**. RC7 ✓ 2026-05-20 (R9 + R12 PASS). Widget-consumer. "Try Free Demo" → universal-interviews (different brand, same sandbox) |
| corporate-ai-solutions | ⚪ | ✗ | ✗ | ? | ? | N/A | ? | ? | ? | ? | Marketing site. Widget-consumer (portfolio-router agents Alex/Scout/Morgan/Victoria/Kira — keep here, strip from per-product) |
| coordination-hub | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not in bleed list — needs initial audit |
| f2k-projects | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Video flyover fallback text on iOS Safari codec (residue) |
| gbta-openclaw | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not flagged in bleed list — verify production URL |
| hair-stylist-ai | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer (indirect via shared UI packages). Margaret's "Start talking" → here |
| kira | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer with `auto-connect="true"` at app/start/page.tsx:326 — legitimate exception per bleed plan but agent must have no portfolio-routing tools. Production URL: kira-rho.vercel.app |
| launchready | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | **Hot (4 RCs)**. Production URL: launchready-ruby.vercel.app |
| leadspark-tenant | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| lessonslearned | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: lessonslearned-wheat.vercel.app |
| lingo-pure-ai | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer. Megumi: "Get Started" → f2-k-fund-tokenisation-admin-consol on HTTP 429 |
| longtail-ai-venture-studio | ⚪ | ✗ | ? | ? | ? | ? | ? | ✓ | ? | ? | **Hot (4 RCs)**. RC7 ✓ 2026-05-20 (R9 + R12 PASS; drop migration 003_rls_replace_open_plans_prices_subs.sql) |
| mova | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not flagged in bleed list — needs initial audit |
| omq-outreach | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| outreach-ready | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Auth flow paused 2026-05-16 |
| prelabz | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Asha: tab bounced to LingoPure, then F2K Admin Console; HTTP 429 |
| property-services | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: property-services-kappa.vercel.app |
| raiseready-impact | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: raiseready-six.vercel.app |
| raiseready-template | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ✗ | "White-label" demo carries Calendly handle in 14 places — proves opposite of white-label pitch (RC9 confirmed) |
| rehearsals-ai | ⚪ | ? | ? | ? | ? | ? | ? | ? | ? | ? | Not flagged in bleed list — needs initial audit |
| smart-board | ⚪ | ✗ | ? | ? | ? | ? | ? | ? | ? | ? | Production URL: smart-board-eight.vercel.app |
| story-verse | ⚪ | ✗ | ? | ? | ? | ? | ? | ✓ | ✗ | ? | **Hot (6 RCs)**. RC7 ✓ 2026-05-20 (R9 + R12 PASS; drop migration 20260519200817_rls_subscriptions_drop_wide_open.sql). Children's voice clones with no /privacy /parents /safety (residue + RC8). Production URL: story-verse-two.vercel.app |
| tour-lingo | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer. Rohan: silent navigation to kira-rho / universal-interviews / cais-interview-agent / longtail-ai-venture-studio after wait |
| tourlingo-operator | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ? | ? | ? | Same as tour-lingo (likely same product / aliased) |
| universal-interviews | ⚪ | ✗ | ✗ | ? | ? | ? | ? | ✓ | ? | ✗ | **Hot (6 RCs)**. RC7 ✓ 2026-05-20 (R9 + R12 PASS; drop migration 20260519221711_rls_membership_scoped.sql). Bea: 5 refreshes → 6 different products including DEPLOYMENT_NOT_FOUND. `$200K raise banner` on candidate screen (residue). Buyer page footer → connexions-silk (RC9 confirmed). Widget-consumer |
| universallingo | ⚪ | ? | ✗ | ? | ? | ? | ? | ? | ? | ? | Widget-consumer per bleed plan inventory |

**Counts (current state):**

| RC | ✓ | ✗ | ? | N/A | Per-RC target (per synthesis) |
|---|---|---|---|---|---|
| RC1 | 1 | 30 | 6 | 0 | 21 confirmed affected — 9 over the synthesis count, audit reveals ~30 in bleed scope |
| RC2 | 0 | 11 | 24 | 2 | 11 widget-consumers (matches synthesis) |
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
