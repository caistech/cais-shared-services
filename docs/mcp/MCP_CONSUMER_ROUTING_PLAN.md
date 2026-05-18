# Consumer Routing Plan (Placeholder)

**Parent docs:** [`MCP_BUILD_BRIEF.md`](../MCP_BUILD_BRIEF.md) (v1.0) + [`MCP_BUILD_BRIEF_v1.1_AMENDMENT.md`](./MCP_BUILD_BRIEF_v1.1_AMENDMENT.md)
**Author:** Dennis / Corporate AI Solutions
**Date:** 2026-05-18
**Status:** **PLACEHOLDER — audit structure only; per-repo decisions NOT filled in.** Refresh after Phase 1 ships and again at each subsequent MCP launch.

---

## What this document is, and isn't

After the four themed MCPs ship, every internal repo that consumes `@caistech/*` will face a per-call-site question: **stay on npm, or route through MCP?** This document is the framework for answering that question — but the actual per-repo decisions are intentionally blank.

Why placeholder: the decisions depend on facts that aren't true yet (which MCPs exist, what their hosting / latency / cost profiles look like in production, what Phase 1's telemetry reveals about the funnel). Filling them in before the MCPs ship would bake in guesses that immediately need redoing.

**Refresh triggers:**
- Phase 1 launch (Aug-Sep 2026 target) → fill in routing decisions for all repos that consume packages now exposed via `cais-au-compliance`
- Phase 2 launch → fill in routing for property-intel package consumers
- Phase 3 launch → fill in routing for outreach package consumers
- Phase 4 launch (if it happens) → fill in routing for trust-eval consumers
- Any time a hub package's npm contract changes (breaking change to function signature, deprecation) → re-audit relevant rows

---

## Default decision: stay on npm

The brief's Appendix C is unambiguous: service-to-service backend logic stays on npm direct. Routing an internal repo's in-process call through MCP would add HTTP latency (typically 50–200ms), a hosting dependency, and a SPOF (the MCP server) for no benefit. The hub remains the source of truth either way — the MCP is just a different consumption surface.

**Concrete examples (stay-on-npm cases):**
- R&D Tax Tracker's form-submit handler calling `validateAbn()` — server-side, latency-sensitive, internal-only → npm.
- F2K Checkpoint's background supplier-validation job calling `screen_subject()` at high frequency → npm.
- MMC Build's backend geocoding 1000 addresses in a batch → npm.

---

## Override criteria — when MCP routing IS the right answer

A call site qualifies for MCP routing **only if** at least one of these is true:

1. **The call is agent-invokable in an end-user context.** The user (or their agent in Claude Code / Cowork) is the one initiating the call, not internal backend code. Example: MMC Build's user-facing AI agent helping a builder find suppliers — that agent is the customer of the MCP, exactly the audience the MCPs are for.
2. **The call is dev-facing.** Dennis or a teammate in Claude Code wants to invoke the capability while working on an unrelated repo. Dogfooding the developer surface = use MCP.
3. **The call needs the MCP-specific value-adds** that don't exist in the npm package: telemetry, threshold prompts, the funnel interview. Rare — most internal repos don't need these for internal calls.
4. **The call is going through the marketplace plugin** as the actual install path (e.g. a future product where the customer's Claude Code is the consumer, not CAIS's backend).

**If none of the four are true → stay on npm.** The 80%+ default.

---

## Per-repo audit template

For each consumer repo, one row per `@caistech/*` package it imports. Audit happens after the relevant MCP ships:

```
Repo: <name>
Package: @caistech/<pkg>
Call sites: <count, with file:line refs once audited>
Call context: [backend / build-time / agent-facing / dev-tooling / mixed]
MCP availability: [in cais-au-compliance | in cais-property-intel | in cais-outreach | in cais-trust-eval | none — stays npm-only]
Routing decision: [npm-only | mcp-only | hybrid (specify per-call-site)]
Rationale: <2–3 sentences>
Migration effort: [none | trivial | small | nontrivial]
Open questions: <if any>
```

**Migration effort scale:**
- **None** — npm-only decision; no code change required
- **Trivial** — swap import path; no API shape change; 1 file affected
- **Small** — swap call pattern (sync → async, or in-process → fetch); a handful of files
- **Nontrivial** — re-architect around network latency or session state; flag for review before starting

---

## Pre-populated consumer inventory (24 repos, ~33 package-consumer pairs)

Audited 2026-05-18 from each repo's root `package.json` (sub-package audits happen during fill-in). The "MCP candidate?" column maps the package to its destination MCP per the v1.1 amendment.

| Repo | Packages consumed | MCP candidate? | Audit status |
|---|---|---|---|
| AIFTIS-Demo | `elevenlabs-convai` | none (no voice MCP planned v1) | TBD |
| Connexions | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| DealFindrs | `platform-trust-middleware`, `property-services-sdk` | platform-trust = hard-cut; property-services = property-intel MCP | TBD (after Phase 2) |
| F2K-Checkpoint | `coordination-sdk`, `mapbox`, `nudge-core`, `platform-trust-middleware`, `property-services-sdk`, `site-intelligence` | mixed: coordination/nudge/platform-trust = hard-cut; mapbox + property-services = property-intel MCP; **site-intelligence = placeholder package, no package.json — flag** | TBD (after Phase 2) + flag |
| F2K-Projects | `ghl-client` | outreach MCP | TBD (after Phase 3) |
| Kira | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| LaunchReady | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| LeadSpark | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| LessonsLearned | `corporate-components`, `platform-trust-middleware` | both **hard-cut — npm-only** | Pre-resolved: stay on npm |
| LingoPureAI | `elevenlabs-convai` | none (no voice MCP planned v1) | TBD |
| MMCBuild | `mapbox`, `platform-trust-middleware`, `property-services-sdk` | platform-trust = hard-cut; mapbox + property-services = property-intel MCP | TBD (after Phase 2) — strong agent-facing use case likely justifies MCP for the user-facing builder agent |
| PartnerPilot | `ai-client`, `brave-search`, `hunter-email` | ai-client = hard-cut; brave + hunter = outreach MCP | TBD (after Phase 3) |
| PrelabzAI | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| RaiseReadyTemplate | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| SmartBoard | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| coordination.ARCHIVED-2026-04-20 | `platform-trust-middleware` | hard-cut, but **repo is archived — flag for cleanup** | Pre-resolved: stay on npm; flag |
| gbta-openclaw | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| investorpilot | `ai-client`, `brave-search`, `hunter-email`, `unipile-channels` | ai-client = hard-cut; brave + hunter + unipile = outreach MCP | TBD (after Phase 3) |
| omq-outreach | `ai-client`, `brave-search`, `hunter-email` | ai-client = hard-cut; brave + hunter = outreach MCP | TBD (after Phase 3) — note: paused per `project_paused_2026_05_16` |
| platform-trust | `agent-trust-score`, `platform-trust-middleware`, `security-gate` | platform-trust + security-gate = hard-cut; agent-trust-score = trust-eval MCP | TBD (after Phase 4) — likely the **dogfooding case** for trust-eval |
| property-services | `api-key-auth`, `platform-trust-middleware` | both **hard-cut — npm-only** | Pre-resolved: stay on npm |
| raiseready-core | `platform-trust-middleware` | hard-cut, but **repo is orphaned (no consumers found) — flag for cleanup** | Pre-resolved: stay on npm; flag |
| storefront-mcp | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |
| universal-interviews | `platform-trust-middleware` | **hard-cut — npm-only** | Pre-resolved: stay on npm |

**Pre-resolved count: 13 repos.** Either consume only hard-cut packages (UI / infra / internal-only — never exposed via MCP), or consume packages with no planned MCP destination. The decision for these 13 is locked at "stay on npm" and won't change unless a future MCP exposes one of their packages.

**TBD count: 11 repos.** Decisions deferred until the relevant MCP ships and the call-context can be audited in production. Each TBD row maps to one of:
- **Phase 2 fill-in** (DealFindrs, F2K-Checkpoint, MMCBuild) — property-intel consumers
- **Phase 3 fill-in** (F2K-Projects, PartnerPilot, investorpilot, omq-outreach) — outreach consumers
- **Phase 4 fill-in** (platform-trust) — trust-eval consumer
- **No MCP path** (AIFTIS-Demo, LingoPureAI) — voice consumers; revisit only if a voice MCP is added

---

## Patterns observed in the inventory

Worth surfacing before the audit starts so they shape decisions consistently:

1. **`platform-trust-middleware` dominates** — 18 of 24 consumers use it. All 18 stay on npm by architectural rule (the package is internal middleware, not an agent tool). Don't litigate this 18 times — it's one decision applied 18 places.

2. **`F2K-Checkpoint` is the heaviest single consumer** — 6 packages, including the only consumer of `site-intelligence` and a consumer of `coordination-sdk`. Audit this repo first when Phase 2 ships; many downstream decisions become clearer once F2K-Checkpoint's routing is locked.

3. **Three repos share an outreach pattern** — PartnerPilot, investorpilot, omq-outreach all consume `ai-client + brave-search + hunter-email` (omq also paused). If any of these productises into a customer-facing AI agent, that agent could be a Phase 3 MCP customer rather than a hub-package customer. Worth a strategic look during Phase 3 fill-in.

4. **`platform-trust` repo is the dogfooding candidate** — it consumes `agent-trust-score`, which is the trust-eval MCP's centerpiece. Phase 4's first real-world test should be platform-trust calling the trust-eval MCP on its own codebase. Self-reinforcing trust signal.

5. **Two repos are flagged for cleanup, not migration:**
   - `coordination.ARCHIVED-2026-04-20` — already archived; the `@caistech/coordination-sdk` package it points at should probably be unpublished or marked deprecated.
   - `raiseready-core` — the only consumer of `platform-trust-middleware` that has no consumers of its own (orphan layer). Decide whether to retire or revive separately.

---

## Orphan + cleanup audit (parallel to routing)

This section gets filled out alongside the per-repo routing decisions. Tracks hub packages that may become deletion candidates as the MCP surface matures.

### Suspected orphans (zero current npm consumers after the routing audit)

To be filled in. Initial suspects from the 2026-05-18 inventory:

| Package | Status | Action |
|---|---|---|
| `coordination-sdk` | Wraps the archived `coordination.ARCHIVED-2026-04-20/` backend. Sole npm consumer is F2K-Checkpoint. | Confirm whether F2K-Checkpoint's usage is live or dead-import. If dead, unpublish package. If live, restore the backend or migrate F2K-Checkpoint off. |
| `site-intelligence` | Directory exists in hub but no `package.json` — yet F2K-Checkpoint declares a dependency on it. | Either ship the package or remove the F2K-Checkpoint dependency. Flag inconsistency. |
| `db-schema` | Declared in hub but no migrations/ directory; not yet published. | Either populate or remove. Decide before Phase 1 launch. |

### Hub packages with very few consumers (review for usage)

- `corporate-components` — 1 consumer (LessonsLearned). UI infra; acceptable to have few consumers, but worth confirming LessonsLearned is actively maintained.
- `nudge-core` — 1 consumer (F2K-Checkpoint). Internal notification infra; confirm it's actually called, not just imported.

---

## Sequencing — how the audit unfolds over time

```
Phase 1 launches (cais-au-compliance)
  → No fill-in expected: cais-au-compliance's packages
    (abn-lookup, business-registry, sanctions-screen, cert-extractor)
    have no current internal consumers
  → Confirm above by grep; if false, fill in those rows

Phase 2 launches (cais-property-intel)
  → Fill in: DealFindrs, F2K-Checkpoint, MMCBuild rows
    for mapbox + property-services-sdk decisions
  → Likely outcomes: MMCBuild's user-facing builder agent → MCP;
    server-side property lookups → npm

Phase 3 launches (cais-outreach)
  → Fill in: F2K-Projects, PartnerPilot, investorpilot, omq-outreach rows
  → Likely outcomes: most server-side outreach work → npm;
    any user-facing outreach agents → MCP
  → Strategic question: do PartnerPilot / investorpilot become
    MCP-customer products instead of npm-consumer products?

Phase 4 launches (cais-trust-eval, if it ships)
  → Fill in: platform-trust row
  → Likely outcome: platform-trust runs trust-eval on its own
    codebase via MCP (dogfooding) AND keeps npm imports for the
    middleware it's exposing
```

Each fill-in is bounded scope (4–11 rows max) and grounded in production reality, not pre-shipping guesses.

---

## Open questions logged in this placeholder

1. **Does `F2K-Checkpoint`'s `site-intelligence` dependency actually work today?** The package has no `package.json`. Either it's broken in F2K-Checkpoint already, or there's a placeholder/stub somewhere. Investigate during Phase 2 fill-in or earlier if it blocks any work.
2. **Is `coordination.ARCHIVED-2026-04-20/` actually archived, or is it still being consumed by F2K-Checkpoint via `coordination-sdk`?** If consumed, "archived" is misleading naming.
3. **Should the `LeadSpark` and `F2K-Fund-Tokenisation` monorepos' sub-packages get their own audit rows?** Currently treated as single repos; their internal `@leadspark/*` and `@f2k/*` consumers may each have distinct call-context needs. Decide before Phase 3 fill-in.
4. **MCP hosting cost reality** — once Phase 1 ships, observe the actual per-call cost on Vercel. If higher than projected, the cost-tilt may push more borderline TBD decisions toward npm. Re-audit assumption then.

---

## Change log

- **v0.1 (2026-05-18)** — Placeholder created with audit structure, pre-resolved 13 stay-on-npm rows, deferred 11 TBD rows pending MCP launches, orphan suspects logged.
- (Next: v0.2 after Phase 1 launch — confirm no fill-in needed, refresh orphan audit.)
