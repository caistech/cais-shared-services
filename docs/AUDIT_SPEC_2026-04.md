# PycharmProjects Shared-Services Audit — 2026-04

**Author of spec:** Claude (carry-forward from session c00546d7…, 2026-04-17/18)
**Intended executor:** Next Claude Code session (preferably started in `C:\Users\denni\PycharmProjects\cais-shared-services`)
**Type:** Research-only. No code edits. Output = markdown deliverable.

---

## 1. Mission

Audit every repo under `C:\Users\denni\PycharmProjects\` to surface **duplicated or near-duplicated code, infrastructure, and patterns** that should be extracted into `@caistech/*` shared packages — or already have a planned extraction and need faster prioritization.

Produce a **prioritized extraction backlog** Dennis can work through over the next 6–8 weeks.

Goal is not completeness — it is **ranked ROI**. A 3-repo 50-line duplication beats a 2-repo 500-line duplication if the 3-repo one is in regulated code paths.

---

## 2. Context (read first, don't re-derive)

- **Shared repo:** `caistech/cais-shared-services` (GitHub Packages, private, `@caistech/*` scope). Already published: `@caistech/elevenlabs-convai@0.1.3`.
- **Declared but unpublished packages (gated `"private": true`):** `@caistech/elevenlabs-voice`, `@caistech/openrouter-client`, `@caistech/language-config`, `@caistech/stt-noise-filter`, `@caistech/agents`, `@caistech/security`.
- **Sequencing memory:** `C:\Users\denni\.claude\projects\C--Users-denni-PycharmProjects-F2K-Fund-Tokenisation\memory\project_cais_shared_services_sequence.md` — has 5-step pipeline + already-confirmed next extractions (compliance-guardrails, corporate-components, abn-lookup, openrouter-client, ghl-client).
- **Repo tiers** (from `C:\Users\denni\.claude\CLAUDE.md`):
  - **REGULATED**: mmcbuild, platform-trust, ndissda-automate, f2k-checkpoint, f2k-fund-tokenisation, r-and-d-tax, disaster-support
  - **REVENUE/CASE STUDY**: easy-claude-code, tenderwatch, deal-findrs, investorpilot, partner-pilot, storefront-mcp
  - **STANDARD**: everything else
- **Recently migrated** (already extracted):
  - `@caistech/elevenlabs-convai` — F2K admin-console migrated (`apps/admin-console/src/app/dataroom/[id]/api/activate/route.ts`). Kira + Connexions have the pre-migration hotfix committed but NOT yet migrated to import from the package.
- **Just-surfaced duplicate not yet in the pipeline:** "Platform Trust middleware + security gate + .env.example" appears in at least Kira and Connexions (identical commit messages). Investigate if this is a 3rd duplicate.

---

## 3. Scope

### In scope
- All git-tracked repos directly under `C:\Users\denni\PycharmProjects\*` (≈40 repos — see Section 9 for list).
- TypeScript/JavaScript code (primary).
- Config/infrastructure: `.env.example`, Next.js middleware, GitHub Actions workflows, Supabase migrations, Tailwind config.
- Architectural patterns where the same shape recurs (auth flows, API route scaffolds, error handling, RLS policies).

### Out of scope
- `node_modules`, `.next`, `dist`, `build`, `.venv`, `__pycache__`, `.git` directories.
- Auto-generated files (lockfiles, type generators' output).
- Project-specific business logic that happens to look similar superficially (e.g. two different SaaS pricing pages).
- Python code **unless** it sits alongside a JS service (the shared-services target is the Node/TS ecosystem).

---

## 4. Method

Favor scale over depth. **Use the `Explore` agent for anything >2 greps**. Main thread should:

1. **List all repos** via `ls -d C:/Users/denni/PycharmProjects/*/` and filter to git-tracked ones.
2. **Parallelize scans** across the candidate categories in Section 6 using multiple `Explore` agents (5+ in a single message).
3. **Gather evidence not opinions.** Every claim must cite specific file paths. Line counts where relevant.
4. **Compare shape, not identity.** Two files that do the same thing with different variable names still count as duplication.
5. **Weight by risk tier.** REGULATED tier duplication is a higher-priority finding than STANDARD tier.

### Signature patterns to grep for (non-exhaustive)

```
# API surface duplication
api.elevenlabs.io/v1/convai
api.openai.com/v1/chat
openrouter.ai/api/v1
api.anthropic.com/v1
claude-sonnet-4|claude-sonnet-4-5|claude-haiku-4

# Integration duplication
app.gohighlevel.com|rest.gohighlevel.com  # GHL CRM
api.stripe.com                            # Stripe
api.resend.com                            # email
sumsub                                    # KYC

# Compliance / guardrails
INVESTMENT_DISCLAIMER|AFSL|wholesale investor|s708
buildClaudeSystemPrompt|buildSystemPrompt
PII|redact|sanitize

# UI components
CorporateHeader|CorporateFooter|ABN.?Lookup|AddressAutocomplete
tailwind-brand-colors

# Platform Trust / security middleware
platform-trust|platformTrust|security-gate|securityGate

# Auth / Supabase
createSupabaseService|createClient.*SUPABASE
createRouteHandlerClient
auth\\(\\).getUser|getSession

# Next.js scaffolds
export async function POST.*NextResponse
createRouteHandlerClient
middleware\\.ts
next\\.config\\.js.*transpilePackages

# GitHub Actions workflows
actions/setup-node@v4
actions/checkout@v4
pnpm install
```

### When comparing two candidate duplicates, check:
- Does one have fixes the other doesn't? (security patches, model rename, etc.)
- Does one handle an edge case the other doesn't? (retries, rate limits, error shapes)
- Does extraction require flexibility neither currently has? (e.g. passing custom headers)
- What's the call-site count per repo?

---

## 5. Output specification

Write a single markdown file:

**Path:** `C:\Users\denni\PycharmProjects\cais-shared-services\docs\AUDIT_RESULTS_2026-04.md`

**Target length:** 2,500–4,000 words (don't pad; don't bloat).

**Required sections:**

### 5.1 Executive summary (≤200 words)
- Top 3 extraction candidates by ROI (brief sentence each, with blast radius)
- Highest-risk drift across regulated tier
- One-sentence call on each already-declared-but-unpublished `@caistech/*` package: "ship as v0.1.0 / needs more audit / scope reshape / drop"

### 5.2 Per-category findings
One subsection per investigated category from Section 6. Each must contain:
- **Category name**
- **Duplication count:** how many repos share variants
- **Evidence:** file paths (absolute, forward slashes), total LOC affected
- **Divergence map:** a small table — repo → which variant (A/B/C with 1-line description)
- **Best-of-breed:** which repo/file is closest to what the extracted package should look like
- **Extraction effort:** XS (<30 min) / S (30 min–2 h) / M (half day) / L (1+ day) / XL (project)
- **Extraction blockers:** API shape mismatches, breaking behavior changes, needed before extraction
- **Priority:** P0 (blocking revenue / regulated risk) / P1 (big win) / P2 (tidy) / P3 (later)

### 5.3 Non-duplication findings
- Repos that drift from established shared patterns where migration would improve them (e.g. projects that still hand-roll a Supabase client instead of using an existing shared one)
- Architectural anti-patterns that recur (e.g. N+1 API calls, inlined secrets, missing error handling)

### 5.4 Ranked backlog
Single ordered list of extraction actions. Each line:
```
[priority] @caistech/<name> — <one-line description> (effort: S, repos touched: N, LOC saved: ~M)
```

### 5.5 Uncertainty log
Things the reviewer wasn't sure about. Short list. Honest beats confident-wrong.

---

## 6. Categories to investigate

Parallelize across these. Not every category will yield findings — that's fine; report a one-liner null result for categories where no meaningful duplication was found.

| # | Category | Hypothesis |
|---|---|---|
| 1 | **ElevenLabs ConvAI agent lifecycle** | Already extracted; verify no stragglers missed the v0.1.3 upgrade |
| 2 | **ElevenLabs TTS/STT one-shot** | Planned `@caistech/elevenlabs-voice` — scope the actual shape from Mova / TourLingo / UniversalLingo |
| 3 | **OpenRouter LLM client** | Planned extraction — likely in InvestorPilot, PartnerPilot, Mova, DisasterSupport, raiseready-core |
| 4 | **Anthropic SDK usage patterns** | Repeated `createClient` / `messages.create` scaffolds across F2K, DealFindrs, Connexions, Kira |
| 5 | **Supabase client factories** | `createSupabaseService` / `createSupabaseBrowser` / `createSupabaseServer` — almost certainly duplicated |
| 6 | **Supabase auth helpers** | `getAdminUser`, `getUser`, RLS policy patterns |
| 7 | **Compliance guardrails** | `INVESTMENT_DISCLAIMER`, `buildClaudeSystemPrompt`, AFSL disclaimers — confirmed duplicated in F2K |
| 8 | **PII redaction / classification** | `classification-patterns.json` from `@caistech/security` — find consumers, verify usage |
| 9 | **ABN lookup + address autocomplete** | `lib/abn.ts`, `lib/abr-client.ts`, `components/abn-lookup/` — confirm where used |
| 10 | **Corporate UI components** | `CorporateHeader`, `CorporateFooter`, brand colors — DealFindrs, TourLingo, others |
| 11 | **GHL CRM integration** | Planned `@caistech/ghl-client` — find all GHL touchpoints |
| 12 | **Stripe patterns** | Webhook handlers, subscription lifecycle — Kira has one; who else? |
| 13 | **Resend email templates** | Invitation emails, transactional — F2K has a dataroom invite flow |
| 14 | **Sumsub KYC integration** | F2K mentions it; check if any other repo touches KYC |
| 15 | **Next.js middleware patterns** | **Just surfaced: "Platform Trust middleware"** in Kira + Connexions. Find all copies |
| 16 | **Security gate / .env.example templates** | Same commit msg "security gate + .env.example" in multiple repos — template duplication or intentional |
| 17 | **GitHub Actions workflows** | Publishing, deploys, preview env setup — standardizable |
| 18 | **Vercel config patterns** | `vercel.json`, build commands, env var lists |
| 19 | **Audit logging** | F2K has audit_log table + helper; other regulated repos? |
| 20 | **Error handling / response shapes** | `NextResponse.json({ error })` scaffolds, status code conventions |
| 21 | **Rate limiting** | Which repos have it? Which need it? |
| 22 | **Claude Code skills / agents / hooks** | `.claude/` directories — which repos share skills; gstack usage |
| 23 | **Testing harnesses** | Hardhat config, Vitest setups, Jest configs |
| 24 | **DB migration patterns** | Supabase SQL files — idempotent CREATE patterns, RLS boilerplate |
| 25 | **Tailwind / design system** | `tailwind.config.js` patterns, shadcn/ui setup, brand palettes |

If a new category emerges mid-audit, add it. Don't skip.

---

## 7. Known hotspots (start here, don't re-discover)

These are already documented duplications — the audit should verify blast radius and add them to the backlog without spending time re-proving them.

| Duplicate | Known repos | Source of knowledge |
|---|---|---|
| ElevenLabs ConvAI agent CRUD | F2K, Kira, Connexions (migrated / hotfixed) | previous session audit |
| `INVESTMENT_DISCLAIMER` + `buildClaudeSystemPrompt` | F2K (two copies internally) | other-session audit reference in sequencing memory |
| OpenRouter client | InvestorPilot, PartnerPilot, Mova, DisasterSupport | README of cais-shared-services |
| ABN lookup API adapter | MMCBuild (at least) | sequencing memory |
| Corporate UI components | DealFindrs, TourLingo | README of cais-shared-services |
| Platform Trust middleware + security gate + .env.example | Kira, Connexions (confirmed); possibly more | git log 2026-04-17 |
| stt-noise-filter | Mova, TourLingo | README of cais-shared-services |
| Claude Code project memory templates | every project has `PROJECT_STATUS.md`; each project also generates `CLAUDE.md` | per global CLAUDE.md config |

---

## 8. Priority framework

For each extraction candidate, compute a rough priority:

```
priority_score = (blast_radius * tier_weight) + severity_of_drift - extraction_effort
```

Where:
- `blast_radius` = number of repos with the duplicate
- `tier_weight` = REGULATED = 3, REVENUE = 2, STANDARD = 1
- `severity_of_drift` = how divergent the copies have become (0 = identical, 3 = versions have real bugs in some)
- `extraction_effort` = XS=1, S=2, M=3, L=5, XL=8

Don't mechanically follow this — use judgment. But if two candidates feel close, this tiebreaks.

---

## 9. Repo list (starting set)

Derived from `ls C:/Users/denni/PycharmProjects/*/`. Not exhaustive — if new ones exist, include them.

```
AI-God-Mode, AI-Inside, AI_Forge, Agentic-OS-old, ApplicationReady,
ConferenceLingo, Connexions, Corporate-AI-Solutions, DealFindrs,
DisabilityConnect, DisasterSupport, F2K Voice Agent,
F2K-Checkpoint-Latest, F2K-Contracts, F2K-Fund-Tokenisation,
GRFC_Projects, HouseSitAgent, JessAIChat, Kira, LaunchReady,
LeadSpark, LongtailAIVentureStudio, MMCBuild, MessageReady, Mova,
NDISSDAAutomate, OutreachReady, PartnerPilot, PubGuard,
PycharmProjectsRaiseReady, QuoteMaster,
R-and-D-Tax-Eligibility-Work-Recording, RaiseReadyTemplate,
RehearsalsAI, SmartBoard, StoryVerse, Tenderwatch, TourLingo,
UniversalLingo, WarrantyReady, WordToDocs, agentic-os, apps,
coordination, easy-claude-code, gbta-openclaw, investorpilot,
llm-council, nudge-core, packages, platform-trust,
property-analysis-sdk, property-services, raiseready-core,
reverseauction, storefront-mcp, universal-interviews,
whatsyourproject
```

Also inspect: `C:\Users\denni\PycharmProjects\packages\` — a local-only sibling directory (non-git) containing `corporate-ai-common` and `translation` — historical staging area; compare against `caistech/cais-shared-services` to see what's been migrated vs what's still orphaned there.

---

## 10. Evaluation criteria for your output

The deliverable is good if Dennis can:

1. Read the executive summary and **pick the next extraction without reading the rest** of the doc.
2. See, for the top 5 backlog items, **exactly which files need to change** and roughly how much code moves.
3. Identify **one or two surprising findings** — things neither we nor Dennis expected.
4. Trust the priority ranking — because the evidence backs it.

The deliverable is bad if:
- It reads like an inventory (boring, shallow).
- It claims duplication without file paths.
- It spends more than 200 words on categories with no findings.
- It recommends extracting things already in the published pipeline without adding new info.
- It sprawls past 5,000 words.

---

## 11. Session priming (paste this at start of the next session)

```
I'm starting a cross-repo shared-services audit. Read
C:/Users/denni/PycharmProjects/cais-shared-services/docs/AUDIT_SPEC_2026-04.md
in full before doing anything. Then execute per that spec.
Confirm you've read the spec and briefly state which categories
you'll start with + the parallel Explore agent fan-out plan before
doing any greps.

Working directory: C:/Users/denni/PycharmProjects/cais-shared-services
Output file: docs/AUDIT_RESULTS_2026-04.md
Don't edit any code. Don't commit or push.
```

---

## 12. Non-goals for this audit session

- **Don't extract anything.** That's a separate future session per package.
- **Don't migrate any call sites.** Record them as evidence only.
- **Don't write new packages.** Document gaps only.
- **Don't publish anything.** Read-only across the board.
- **Don't refactor the audit target codebases** even if you see obvious wins.

---

## 13. Success signals

When this audit's output lands, the next 3 extraction sessions should each be able to start with: "open `AUDIT_RESULTS_2026-04.md`, read the top entry in §5.4, and execute the extraction plan." No re-audit, no rediscovery.
