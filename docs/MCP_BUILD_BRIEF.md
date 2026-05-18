# Brief: Claude for Small Business — Strategic Production-Model Assessment

**Prepared for:** Build session in `cais-shared-services` repo
**Author:** Dennis / Corporate AI Solutions
**Date:** 2026-05-18
**Version:** 1.0 — FROZEN FOR BUILD
**Priority:** R&D / Strategic Spike → Build
**Audience:** Build agent. Read in full before touching code.

> **Status:** Frozen at v1.0 as of 2026-05-18. This brief is the build specification for Phase 1 (MCP server wrapping existing `@caistech/*` packages). Subsequent phases (skill registry, funnel mechanics, hosting) are scoped here but should be confirmed against current state before each phase starts. Do not edit this brief during the build session — surface changes as proposals, get sign-off, then version-bump to v1.1.

---

## The Core Question

**Does Claude for Small Business fundamentally change how we produce products, or what products we could produce?**

Three sub-questions, in priority order:

1. **Production model** — Does the plugin (skills + connectors pattern, packaged as a Cowork toggle) change the factory itself? Specifically: does it shorten our build path, replace any of our shared-services work, or commoditise pieces of what we currently ship at $5K / 7 days?
2. **Opportunity surface** — Does it open product space we couldn't profitably address before? E.g. SMB-tier products that ride on the connectors instead of us building each integration. Does it create a new distribution surface (Cowork users discovering / running our skills)?
3. **Project fit** — For each live project, is the plugin a building block, a handoff target, a competitive threat, or irrelevant? This is **evidence for #1 and #2**, not the deliverable itself.

A defensible "no, it doesn't change anything" is a valid and useful answer. Don't force a yes.

---

## Background

Anthropic launched **Claude for Small Business** on 13 May 2026 — a plugin for Claude Cowork. Toggle install, 15 pre-built workflow skills, connectors to QuickBooks, PayPal, HubSpot, Canva, DocuSign, Google Workspace, Microsoft 365, Slack (plus Square, Stripe, Webflow in broader Cowork ecosystem). No extra cost above an existing Claude plan.

The architecture mirrors our own skills + connectors pattern. That's the reason this matters: Anthropic is now shipping the same building blocks we use, to the same customer tier we partly target.

Anthropic also runs an **official plugin marketplace** at `claude.com/plugins`. 11 official plugins in Jan 2026, 12 more in Feb 2026 (HR, Engineering, Design, Ops, Financial Services). Third-party developers can submit. Enterprise admins can stand up private plugin marketplaces. This is a distribution channel we did not have access to twelve months ago.

---

## The 15 SMB Workflow Skills (pre-enumerated)

Cross-referenced from launch page + third-party deep-dives. Naming varies across sources; canonical list below.

**Finance (6)**
1. **Payroll Planning** — reads payroll data, reconciles cash, surfaces discrepancies for approval
2. **Month-End Close** — reconciles books against settlements, flags mismatches, generates P&L
3. **Cash-Flow View** — forward-looking 30-day cash position
4. **Invoice Chaser** — tracks open invoices, drafts follow-ups
5. **Margin Analyzer** — profitability by product/service line
6. **Tax-Season Organizer** — organises expenses and documents for accountant review

**Sales & Marketing (5)**
7. **Lead Triage** — scores/segments leads, drafts outreach sequences
8. **Campaign Analysis** — attribution and conversion breakdowns
9. **Canva Asset Generation** — on-brand campaign creative
10. **Content Strategist** — content calendar and topic recommendations
11. **Customer Pulse** — surfaces trends, flags at-risk accounts

**Operations & Legal (4)**
12. **Contract Reviewer** — flags clauses by risk, plain-English summaries
13. **Business Pulse Dashboard** — cross-functional health summary (read-only)
14. **Weekly Commitments** — prioritised weekly plan drafter
15. **Docusign Follow-Through** — tracks signature status, chases stalled documents

**Source confidence:** launch page individually names ~11; the substack write-up (Karo Zieminski) appears to have done the cross-referencing for the remaining 4. Treat the 4 less-confirmed ones (Cash-Flow View, Customer Pulse, Weekly Commitments, Docusign Follow-Through) as working assumptions until the official Cowork docs become accessible.

---

## Projects in Scope

Treat these as evidence for the core question. Read READMEs, integration layers, and any public-facing copy. Do **not** read deep into business logic without explicit per-project approval.

### 1. R&D Tax Tracker — highest-priority project fit
ATO-compliant R&D Tax Incentive record-keeping. Australian market. Manual financial entry today.
**Critical AU caveat:** SMB plugin ships QuickBooks. AU R&D users live on **Xero / MYOB**. A roadmap for Xero/MYOB/KeyPay/Deputy already exists ([project_rnd_erp_connectors](../.claude/projects/C--Users-denni/memory/project_rnd_erp_connectors.md)). Assess whether the QuickBooks connector is useful at all here, and whether the SMB plugin's accounting normalisation work accelerates or competes with the Xero connector we'd build anyway. Tax-Season Organizer skill is the loudest direct overlap — focus the competitive threat assessment here.

### 2. F2K Checkpoint
AI PM for modular construction. AU market. Plausible connectors: DocuSign (supplier contracts), HubSpot (builder onboarding), Slack (project status). Relevant skills: Docusign Follow-Through, Contract Reviewer, Weekly Commitments, Business Pulse Dashboard.

### 3. MMC Build
Post-launch, polish mode. Active SCRUM at corporateaisolutions-team.atlassian.net. Plausible connectors: Canva (branded design outputs), DocuSign (design sign-off). Relevant skills: Canva Asset Generation, Docusign Follow-Through, Contract Reviewer. Lower priority — check SCRUM backlog via Rovo MCP before recommending anything that competes with planned work.

### 4. StoreFront MCP
Infrastructure product (structured data / MCP layer). Expected: low/no fit. Confirm and close.

---

## Tasks

### Task 1 — Answer the core question (the deliverable)

Produce a direct answer to: *does this change how or what we produce?* Lead with a one-paragraph verdict. Back it with the three sub-questions, each answered in 3–5 sentences with concrete reasoning from the project evidence below.

### Task 2 — Per-project evidence table

For each project, one row:

```
Project: [name]
Relevant connectors: [list]
Workflow skills with overlap: [from the 15 above]
Integration type: [native embed | handoff layer | inform feature dev | no fit]
Complexity tag: [connector exists in shared services | connector new | requires data-model change]
Priority: [immediate | backlog | monitor | skip]
Rationale: [2–3 sentences]
```

No effort hours — the agent can't see enough code to estimate them. Use the complexity tag instead.

### Task 3 — Shared services architecture decision

The plugin itself cannot be embedded (Anthropic-hosted Cowork toggle, not vendorable code). Three patterns can absorb its value into our shared services layer:

1. **Skills as portfolio primitives** — adapt relevant SMB skills into `cais-shared-services/skills/` and/or `.claude/skills/` for cross-project reuse.
2. **Own connector packages** — `@caistech/quickbooks`, `@caistech/xero` (AU priority), `@caistech/docusign` as siblings to existing `@caistech/mapbox` and `@caistech/abn-lookup`. The SMB plugin's connector list becomes our **roadmap of what's worth owning**.
3. **Optional Cowork bridge** — `@caistech/claude-smb-bridge` that detects Cowork + plugin installation and offers the Anthropic-hosted flow as an alternate path. Only worth building if our AU SMB customer base overlaps meaningfully with Cowork installs.

For each, recommend: **build now / build later / skip**, with rationale. Cross-check against `@caistech/*` first rule (no rebuilding what already exists).

### Task 4 — Competitive flag for R&D Tax Tracker

Does the SMB plugin normalising "AI + accounting connectivity" accelerate or threaten the Tracker's positioning? Output: either "no action needed" with one-line rationale, or a concrete SCRUM backlog item. Focus specifically on Tax-Season Organizer overlap.

---

## Out of Scope

- Anthropic pricing analysis, market sizing, or competitive positioning of Claude for Small Business as a product
- Generic AI-for-SMB market commentary
- Effort estimates in hours
- Any project not in the four listed above
- Any recommendation that requires a new external developer dependency (Revit API, OAuth integrations beyond what shared services already covers) without explicit flagging
- The two appendices below (architectural decision + marketplace strategy) are separate follow-on spikes — surface relevant findings here but do not over-invest

---

## Constraints

- Cross-check recommendations against existing CLAUDE.md, PROMPTING_GUIDE.md, and `cais-shared-services/` before surfacing anything that conflicts with established architecture
- `@caistech/*` shared-services-first rule applies — if a connector overlaps an existing package, say so
- AU market reality (Xero/MYOB > QuickBooks) governs all accounting-connector analysis

---

## Deliverable

Single markdown report. Structure:

1. **Verdict** — one paragraph answering the core question
2. **Production model** — does it change how we build? (3–5 sentences + reasoning)
3. **Opportunity surface** — does it change what we build? (3–5 sentences + reasoning)
4. **Per-project evidence table** — Task 2 output
5. **Shared services recommendation** — Task 3 output (three patterns, build/skip decision each)
6. **R&D Tax Tracker competitive flag** — Task 4 output
7. **Open questions / things to revisit** — anything surfaced that wasn't answerable inside the time budget

**Done criteria:** Verdict is unambiguous (yes / no / hybrid with conditions). Each project has a clear integration type and priority. Shared services question has a recommendation per pattern with rationale. R&D Tracker flag is either closed or filed as a backlog item.

---

## Reference

- Claude for Small Business launch: https://www.anthropic.com/news/claude-for-small-business
- Anthropic plugin marketplace: https://claude.com/plugins
- Anthropic official plugins (GitHub): https://github.com/anthropics/claude-plugins-official
- Claude Cowork docs (currently redirecting/incomplete): https://platform.claude.com/docs/en/claude-cowork
- Substack deep-dive on the 15 skills: https://karozieminski.substack.com/p/claude-for-small-business-decision-tree-workflows

---

## Appendix A: Follow-on Architectural Decision — Skills as Shared Services Runtime

**Question:** Should skills be auto-discovered and runtime-dispatched across all repos from a shared services layer?

**Two paths, distinguished by consumer:**

**Path A — Agent/dev context (Claude Code sessions across repos).** Already mostly works via `~/.claude/skills/`. The shared-services upgrade is to wrap the registry as an MCP server (`@caistech/skill-mcp`) and register it in global CLAUDE.md. Result: every repo's Claude Code session auto-discovers and uses skills with zero per-repo hardcoding. ~2-3 days effort. Recommended **Phase 1**.

**Path B — End-user product runtime (e.g. R&D Tax Tracker user uploads receipts → skill auto-fires).** Requires `@caistech/skill-runtime` package with registry, shape detector, dispatcher, and permission layer in each consumer product. **Full zero-hardcoding is not achievable** because:

1. Heterogeneous data schemas across products require per-project adapters (which is hardcoding by another name);
2. Each skill invocation is a paid LLM call requiring throttling/caching;
3. Trust boundary requires "suggest, not execute" defaults for any destructive skill.

Realistic target: explicit one-line registration per skill per project, automatic dispatch from there. **Phase 2**, only if Phase 1 validates value.

**Phase 3 (auto-discovery / shape detection in end-user products):** Only after 5+ skills × 3+ projects in production give real usage data.

---

## Appendix B: Funnel Architecture and Lead-Gen Monetization

**Strategic position:** The plugin is a lead-gen / brand surface, not a direct revenue product. Marketplace evidence (Claude plugins, Smithery) shows publishers don't monetize through the marketplace directly — they monetize through downstream services. CAIS funnels installs into either productized consulting (Connexions Platform Trust Sprint) or productization partnership (prelabz). No subscription gate on the plugin itself.

### The funnel — five stages

| Stage | What happens | User commitment | CAIS captures |
|---|---|---|---|
| **1. Install** | Marketplace install, plugin works immediately, no signup, no telemetry capture | Zero | Nothing |
| **2. Free usage** | All core skills work; local usage counter accumulates | Zero | Anonymous usage if opted in |
| **3. Threshold** | After N uses / M days of active use, plugin surfaces a soft prompt: "Want personalized guidance? Talk to our AI agent about what you're building." | Decision point | User self-selects |
| **4. AI interview** | Conversational agent asks: what you're building, what's working, what's missing, what's next. Routes outcome to Connexions, prelabz, or "data-only" | Soft (~5-10 min) | Full context |
| **5. Pipeline** | Dennis follows up with interview context. Sprint engagement OR productization OR ongoing relationship | Real commitment | Revenue |

### Lead capture model

**Capture at value realization, not at install.** Installs are zero-friction so users can evaluate. Lead capture happens at stage 3-4, when the user has demonstrated genuine utility-driven engagement.

**What the engagement event unlocks** (must be tangible enough to justify the user's time):

- Personalized guidance — interview output summarized back as "3 things to look at next"
- Premium skills — advanced templates, deeper agents, vertical-specific capabilities
- Direct line to Dennis / scoped call
- `@caistech/*` packages — unlock the shared services packages that the free plugin doesn't include

### Unit economics — three pricing layers

The "free forever" model holds for utility-class skills but breaks at viral scale for LLM-driven skills (variable LLM API cost scales with usage). The sustainable model is layered, not flat:

| Skill class | What it covers | Cost to CAIS | Pricing |
|---|---|---|---|
| **Utility skills** | ABN lookup, Mapbox geocoding, data validators, simple lookups, registry queries | Cheap forever (sub-cent per call) | **Free, always** — these are the wedge |
| **LLM-driven skills** | Compliance analysis, contract review, agentic workflows, multi-step reasoning | Expensive, scales with usage | **Bring Your Own Key (BYOK) by default** — user configures their Anthropic / OpenAI key; LLM costs pass through to them |
| **Managed Tier** | Same skills as above, but CAIS handles keys, infra, support, SLA | CAIS bears full cost + margin | **Subscription** — opt-in for users who don't want to manage keys, or for production deployments |

**Why BYOK is the right default:** it's the industry pattern in 2026 (Cursor, Continue, Aider all default to it). Most devs installing a Claude-based plugin already have an Anthropic key — pasting it is a 30-second action, not real friction.

**User-facing framing — do NOT call it "BYOK" in copy.** Frame as feature, not technical detail:

> "This skill uses Claude. Connect your Anthropic account so usage runs on your existing credit — no markup from us, no billing relationship with CAIS required."

That positioning is a trust signal: CAIS doesn't see the user's credit card, doesn't markup their LLM spend, doesn't lock them into CAIS-billed infrastructure. The Managed Tier subscription is then a positive opt-in ("don't want to manage keys? we'll handle it") rather than a forced paywall.

### Terminology

Do NOT use the word "upgrade" in user-facing copy — it primes commercial expectations. Better:

- "Let's go deeper"
- "Talk to CAIS"
- "Get personalized guidance"
- "Connect with the team"

### Triage signal

The interview routes to Connexions or prelabz based on one question:

> "Are you building this for someone else (employer / client) or for yourself (you want to sell what you're building)?"

- **For someone else** → Connexions Platform Trust Sprint (productized consulting; user has a budget and a deliverable)
- **For themselves** → prelabz (productization partnership; CAIS contributes infra/GTM for equity or fee)
- **Both / unclear / "just exploring"** → data-only, follow-up cadence stays gentle

### Conversion math (one plugin, 12 months, realistic mid-tier success)

- Installs: ~5,000
- Active after 30 days: ~1,000 (typical utility-plugin retention)
- Hit usage threshold: ~200-400
- Take the interview: ~100-200 (~50% of prompted)
- Qualified leads from interview: ~50-100 (high quality, full context)
- Convert to engagement (Sprint or prelabz): 10-30% → **5-30 deals**

Plan for Dennis bandwidth: 5-10 calls/month per active plugin. The plugin works because per-deal revenue is high ($5-50K Sprint, equity-bearing prelabz), not because conversion volume is large.

### Per-plugin destination recommendation

| Plugin | Primary downstream | Why |
|---|---|---|
| **CAIS Trust** | Connexions Sprint + premium skill access | Enterprise security buyers; productized consulting fits; sits next to Semgrep/Aikido pricing space |
| **CAIS Construction** | Connexions Sprint | AU construction-tech audience too small for SaaS; consulting is the established fit |
| **CAIS Property Intelligence** | Connexions Sprint primary, prelabz for indie devs building proptech | Unique data → defensible product future, but immediate conversion is consulting |
| **CAIS AU Compliance** | Connexions Sprint + prelabz for high-intent indie compliance builders | Mix of employed devs (Sprint) and indie consultants (productization candidates) |

### Distribution channels

- **Claude plugins marketplace** — free, highest reach, "Anthropic Verified" badge target
- **Smithery** — free (verify $30/mo isn't required), broader MCP-protocol audience
- **Direct / private** — for enterprise engagements

All three in parallel. The plugin is the same package; marketplace presence multiplies discovery.

### Pre-launch checklist

- [ ] Connexions Platform Trust Sprint intake form live and routing replies to Dennis
- [ ] prelabz.com onboarding flow live (or minimum: "talk to us about productization" form)
- [ ] AI interview agent built and tested (in-plugin skill or hosted at e.g. `cais.com/interview`)
- [ ] Local usage tracking + threshold prompt UX in the plugin
- [ ] Email sequencer set up (Day 0 / 3-5 / 14 / 30) with templates approved — fires ONLY for users who opted in via the interview
- [ ] CRM or Notion/Sheets pipeline that captures: install (anonymous) → interview → triage → conversation → outcome
- [ ] Dennis has explicit calendar capacity for 5-10 calls/month per active plugin

If any of those aren't ready, hold the plugin launch — installs without follow-up infra evaporate.

---

## Appendix C: MCP Architecture vs Current State

### What we have now

`cais-shared-services/packages/@caistech/*` — internal npm packages. Each CAIS project npm-installs the packages it needs. Version-pinned. No external distribution. No agent-callable surface. No usage telemetry. No discovery layer outside the CAIS team.

### What the MCP adds

- **External distribution surface** — visible on Claude plugins marketplace + Smithery
- **Agent-callable interface** — Claude / Cowork / other MCP-aware agents can invoke skills directly
- **Usage telemetry** — what's being called, how often, by whom (opt-in)
- **Funnel mechanism** — threshold prompts, interview routing, lead capture
- **Brand surface** — CAIS becomes visible to the developer ecosystem, not just current clients

### What the MCP does NOT replace

- `@caistech/*` npm packages for in-process runtime use in product backends
- Direct function calls between CAIS server code
- Existing internal architecture

The MCP is **additive**, not a replacement. It wraps existing capabilities for new consumption surfaces.

### Architecture sketch

```
External users (Claude Code, Cowork, marketplace installers)
        │
        │  MCP protocol
        ▼
┌──────────────────────────────┐
│   CAIS MCP Server            │
│   (hosted: Vercel /          │
│    Cloudflare / Railway)     │
│                              │
│   Skill Registry             │
│   + Tool Catalog             │
│   + Auth / Telemetry         │
│   + Threshold logic          │
│   + Interview agent          │
└────────┬─────────────────────┘
         │  internal imports
         ▼
┌──────────────────────────────┐
│  @caistech/* npm packages    │  ← logic still lives here
│  (single source of truth)    │
└──────────────────────────────┘

Internal CAIS products (R&D Tax, F2K, MMC, etc.)
  → consume @caistech/* directly via npm at runtime
  → consume via MCP only when the surface is dev/agent-facing
```

### Should internal CAIS repos consume MCP "as external users"?

**Mostly no for production runtime, yes for developer/agent workflows.** The split:

| Context | Use MCP? | Why |
|---|---|---|
| R&D Tax Tracker server-side ABN validation at form submit | **No — npm direct** | In-process call, no network overhead, no MCP hosting dependency |
| F2K Checkpoint background supplier validation job | **No — npm direct** | High frequency makes network round-trips wasteful |
| Dennis in Claude Code working on any project | **Yes — MCP** | This IS the external user experience; dogfooding the developer surface |
| MMC Build AI agent that helps a builder find suppliers | **Yes — MCP** | The user-facing AI surface is the MCP's home turf |
| Internal Claude Code skill execution inside any repo | **Yes — MCP** | Same dogfooding logic |

**Rule of thumb:** if the call is service-to-service backend logic, use the npm package directly. If the call is agent-invokable or dev-facing, route through MCP.

### Run cost reality (under BYOK model)

LLM cost dominates everything else when CAIS bears it. Under BYOK (the recommended default for LLM-class skills), LLM cost passes through to users and CAIS only carries hosting + utility-API costs. The numbers change dramatically:

| Tier | Calls/month | CAIS cost — if CAIS bears LLM | CAIS cost — under BYOK |
|---|---|---|---|
| **Low** (one client team, regular use) | ~3,000 | ~$80-125 | **~$30-60** |
| **Medium** (multiple teams / active dev across projects) | ~30,000 | ~$560-735 | **~$100-200** |
| **High** (viral / production-grade, multiple tenants) | ~300,000 | ~$5,000-5,700 | **~$500-1,500** |

Under BYOK, even high-tier viral usage is supportable as pure marketing spend. The variable LLM cost — the part that scales linearly and breaks the model — sits with users where it belongs.

The Managed Tier subscription (for users who opt in to have CAIS handle keys/infra/support) is then priced to cover full per-user cost including LLM, plus support markup. Realistic Managed Tier price: **$500-1,500/month per organisation**, depending on usage volume and SLA.

**For the MMC Build subscribe option discussed with Karthik:** the Managed Tier framing applies directly. MMC Build pays a fixed monthly for CAIS to handle everything — keys, hosting, updates, support, AU compliance currency. Internally that's the Managed Tier product, branded for a single-client engagement.

### Build phases

**Phase 1 — Wrap existing packages.** Build `cais-mcp-server` that imports `@caistech/*` packages and exposes their functions as MCP tools. Logic stays in npm packages; MCP is a thin adapter. ~3-5 days for v1 with 5-6 core capabilities (ABN, security gate, agent trust, mapbox, property-services).

**Phase 2 — Add skill registry.** Wrap markdown-defined skills (the adapted SMB primitives + CAIS-specific skills) as MCP-callable. Skills can compose tool calls. ~3-5 days.

**Phase 3 — Funnel mechanics.** Threshold tracking, interview agent, route-to-pipeline logic. ~5-7 days. Integrates with Connexions intake and prelabz.

**Phase 4 — Hosting and observability.** Production deploy (Vercel/Cloudflare/Railway), telemetry, SLAs. ~3-5 days.

**Total: ~2-3 weeks for v1.** Phase 1 can ship standalone if you want to validate distribution before building the funnel.

### Decision left open

Whether to refactor `@caistech/*` packages so the MCP server is the source of truth (npm packages call MCP) versus keeping the current "npm-first, MCP wraps" model. Recommend **stay npm-first** until external MCP usage justifies the refactor cost. Premature inversion creates unnecessary network coupling for internal callers.
