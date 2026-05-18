# Amendment: MCP Build Brief v1.1

**Amends:** [`docs/MCP_BUILD_BRIEF.md`](../MCP_BUILD_BRIEF.md) (v1.0, frozen 2026-05-18)
**Author:** Dennis / Corporate AI Solutions
**Date:** 2026-05-18
**Status:** FROZEN FOR BUILD — supersedes Phase 1 scope and the phase model from v1.0. All other v1.0 sections (Core Question, Projects in Scope, Out of Scope, Appendix B funnel, Appendix C architecture posture) remain in force.
**Audience:** Build agent. Read v1.0 first, then this amendment, before touching code.

---

## What changed and why

v1.0 scoped Phase 1 as "wrap 5–6 core capabilities" (ABN, security-gate, agent-trust, mapbox, property-services) into a single `cais-mcp-server`. A subsequent inventory + audit (this conversation, 2026-05-18) surfaced three problems with that framing:

1. **The named capabilities don't share an audience.** ABN (AU compliance), mapbox (geography), agent-trust (security tooling), property-services (proptech), security-gate (internal infra for the MCP itself) — five capabilities, four unrelated user personas, one of them not even a tool. A marketplace listing exposing all five has no answer to "who is this for?", which kills install intent and the Appendix B funnel routing.
2. **Half the hub's 30 packages aren't agent-callable tools.** `corporate-components` (React UI), `platform-trust-middleware` (Next.js wrapper), `db-schema` (SQL), `portfolio-env-sync` (CAIS-internal), `language-config` (config data), `api-key-auth` (the MCP server's own plumbing) — these are libraries you import, not tools an agent calls. A whole-hub wrap would expose them anyway and confuse the catalog.
3. **The phase model assumed a single growing MCP.** v1.0's Phase 1 → 2 → 3 → 4 was "wrap → add skills → add funnel → host." Better fit: per-MCP vertical slices, each shipped end-to-end (tools + funnel + hosting), so the second MCP benefits from the first one's hosting + telemetry infra.

This amendment replaces Phase 1 scope and the phase model accordingly. v1.0's strategic answer (does Claude for Small Business change how/what CAIS produces?) is unchanged.

---

## Source-of-truth posture (re-stated for clarity)

The original Appendix C decision **stands and is critical**: `@caistech/*` npm packages remain the single source of truth. MCP servers are *thin import-and-expose wrappers* — they `import` from `@caistech/<pkg>` and surface a subset of functions as MCP tools. Republish the package → every MCP that imports it picks up the new behaviour on next deploy. **No duplicate codebases. No parallel maintenance.**

Concretely:

- A bug fix or feature added to `@caistech/abn-lookup` flows automatically to `cais-au-compliance` MCP on the next MCP deploy.
- Internal CAIS repos (the 24 listed in the consumer inventory) continue to consume `@caistech/*` via npm directly. They do **not** route through MCP for production runtime calls — that would add latency, hosting dependency, and a SPOF for no benefit.
- MCPs serve two audiences only: (a) external users / agents via marketplace installs, (b) Dennis-in-Claude-Code dogfooding the same surface.
- The "stripped down CAIS" mental model is **incorrect**. The hub doesn't shrink. It gains an MCP overlay.

---

## Four themed MCPs (replaces v1.0 Phase 1's single-server scope)

Each MCP has one "wedge" tool (sub-cent utility, free forever per Appendix B's pricing layers) and a small supporting catalog. Each maps to a distinct downstream destination in Appendix B's per-plugin routing table.

### 1. `cais-au-compliance` — Phase 1 (build first)

| Field | Value |
|---|---|
| Wedge tool | `abn-lookup` — deterministic, free forever |
| Supporting tools | `business-registry` (CN/VN/MY/AU), `sanctions-screen` (OFAC/UN/AU/UK/EU), `cert-extractor` (BYOK Claude) |
| Audience | AU SMB compliance builders, R&D Tax adjacency, fintech / regtech indie devs |
| Funnel destination | CAIS AU Compliance plugin in Appendix B: Connexions Sprint + prelabz (mixed audience) |
| Why first | Smallest catalog, sharpest "who it's for," AU is Dennis's home market, fills the gap Anthropic's QuickBooks-first plugin leaves open for non-US accounting markets |

### 2. `cais-property-intel` — Phase 2

| Field | Value |
|---|---|
| Wedge tools | `mapbox` (geocoding, BYOK Mapbox key), `abn-lookup` (developer/owner ID) |
| Supporting tools | `property-services-sdk`, `cert-extractor` (building certs/CodeMark) |
| Audience | AU proptech indie devs, Deal-Findrs / F2K Checkpoint adjacency |
| Funnel destination | CAIS Property Intelligence plugin: Connexions Sprint primary, prelabz for indie proptech builders |
| Managed-tier hook | Deeper `property-services` data + analysis behind subscription |

### 3. `cais-outreach` — Phase 3

| Field | Value |
|---|---|
| Wedge tools | `brave-search`, `hunter-email` (BYOK keys both) |
| Supporting tools | `extractors` (LLM site/social intelligence, BYOK Claude), `unipile-channels` (LinkedIn/Gmail OAuth), `ghl-client` (GHL API key) |
| Audience | Outbound sales / lead-gen builders, PartnerPilot / InvestorPilot adjacency |
| Funnel destination | (Not yet in Appendix B — propose adding) prelabz primary for indie outreach builders, Connexions secondary |
| Friction note | Unipile + GHL require user OAuth / API keys per session — design first-run UX before launch |

### 4. `cais-trust-eval` — Phase 4 (optional, build only after first three validate)

| Field | Value |
|---|---|
| Wedge tool | `agent-trust-score` — score the user's agent, return a graded report |
| Supporting tool | `report-generator` — turn the score into a branded PDF |
| Audience | Builders evaluating their own agents, security-conscious enterprise dev teams |
| Funnel destination | CAIS Trust plugin in Appendix B: Connexions Platform Trust Sprint (direct fit — "your agent scored X, here's how Connexions can get it to Y") |
| Why later | Niche audience, lowest install volume, but highest-quality lead — defer until the first three MCPs have proved out the funnel mechanics |

---

## Hard cut — packages that NEVER appear in any public MCP

These ten packages from the hub stay npm-only. They're infrastructure, UI, or CAIS-internal — exposing them as MCP tools makes no sense.

| Package | Why excluded |
|---|---|
| `platform-trust-middleware` | Next.js wrapper — the MCP server *uses* it for its own gating, doesn't expose it |
| `security-gate` | Agent security infra — the MCP server uses it internally, doesn't expose it |
| `security` | Agent permissions / PII / audit — internal use only |
| `api-key-auth` | The MCP server's own auth plumbing — exposing it would be circular |
| `corporate-components` | React UI — not agent-callable |
| `agents` | Agent provisioning meta-infra — for building agents, not a tool external agents call |
| `ai-client`, `openrouter-client` | LLM-client wrappers — an agent calling an LLM-wrapper-as-a-tool is circular; the agent's own LLM does that |
| `db-schema` | Unpublished SQL migrations |
| `portfolio-env-sync` | CAIS-internal portfolio tooling |
| `coordination-sdk` | Wraps the archived coordination repo; likely dead — flag for cleanup |
| `nudge-core` | Internal notification infra; no obvious external user |
| `language-config`, `stt-noise-filter` | Config data / utility — could surface as MCP **resources** later (not tools) if voice-themed MCP is added |

Of the 30 hub directories (28 published + `db-schema` unpublished + `site-intelligence` placeholder), **14 are public-MCP-eligible** across the four themed MCPs. The rest stay internal.

---

## Revised phase model

Each phase ships an MCP end-to-end. Telemetry, hosting, funnel-prompt infra built in Phase 1 are reused by Phases 2–4 — no separate "add funnel" or "add hosting" phases.

| Phase | Deliverable | Estimated effort | Gate to next phase |
|---|---|---|---|
| **1** | `cais-au-compliance` MCP: 4 tools, hosting, telemetry, threshold prompt, AI interview agent stub, Connexions/prelabz routing form | ~10–14 days | Funnel proves out: ≥1 marketplace install → interview → triage → conversation logged |
| **2** | `cais-property-intel` MCP: 4 tools, reuses Phase 1 infra | ~5–7 days | Validate property-services managed-tier conversion |
| **3** | `cais-outreach` MCP: 5 tools + OAuth onboarding UX | ~7–10 days | (none — proceed to Phase 4 only if trust-eval audience validates separately) |
| **4** | `cais-trust-eval` MCP: 2 tools, Connexions Sprint funnel | ~3–5 days | — |

**Total: ~25–36 days for all four MCPs end-to-end** — vs. v1.0's ~14–22 day estimate for a single mega-MCP. The extra time buys: a focused marketplace listing per audience, four shots at the funnel, no orphaned tools in any catalog.

If only Phase 1 ships, that is already a complete product with a working funnel — Phases 2–4 are conditional on Phase 1 telling us the model works.

---

## Sequencing constraints

- **Phase 1 must ship hosting + telemetry + threshold-prompt + interview-agent infra**, not just the tool wrappers. Phases 2–4 reuse this infra; if Phase 1 punts on it, Phase 2 inherits the same gap.
- **Connexions Sprint intake form and prelabz onboarding flow are pre-launch dependencies** (per Appendix B's pre-launch checklist). If either isn't live, hold Phase 1 launch — installs without follow-up infra evaporate.
- **Each MCP's per-build doc** (`docs/mcp/MCP_cais-<name>_BUILD.md`) supersedes v1.0's Phase 1 capability list for that MCP. Build agents follow the per-MCP doc, not the v1.0 capability list.

---

## What's NOT in this amendment

Out of scope here — covered in follow-on documents:

- **Consumer routing plan** (renamed from "migration"): per-`@caistech/*`-consumer audit across the 24 internal repos. Default decision = stay on npm; route through MCP only for dev/agent-facing surfaces. Drafted **after** MCPs ship, not before.
- **Package cleanup**: any hub package with zero npm consumers and zero MCP exposure (e.g. `coordination-sdk`) becomes a deletion candidate. Separate audit, not blocking.
- **Voice-themed MCP**: `elevenlabs-*` + `language-config` + `stt-noise-filter` could form a fifth themed MCP if a voice audience emerges. Not in scope until the first four validate.
- **MMC Build Managed Tier**: Appendix C names this as Karthik-specific Managed Tier framing. Implementation lives in the `cais-property-intel` (or `cais-construction` — TBD naming) Managed Tier SKU, not a separate MCP.

---

## Open questions surfaced but not answered here

1. **`property-services` flatten decision** — when `cais-property-intel` calls property data, does it go MCP → `@caistech/property-services-sdk` (npm) → property-services edge functions (HTTP), or MCP → property-services edge functions (HTTP, skip SDK)? Default: keep SDK in the loop (preserves the single source of truth for query shape and caching). Revisit if the SDK becomes a bottleneck.
2. **`coordination-sdk` retirement** — is the archived `coordination.ARCHIVED-2026-04-20/` repo really dead, or is there a successor? If dead, package can be unpublished. Out of scope here; flag in package-cleanup audit.
3. **Naming** — "cais-construction" was floated in Appendix B's plugin destinations table; this amendment uses "cais-property-intel" instead. F2K Checkpoint construction audience is too narrow for its own plugin and overlaps property-intel sufficiently. Confirm before publishing the marketplace listing.

---

## Change log

- **v1.1 (2026-05-18)** — Phase 1 scope replaced with `cais-au-compliance` vertical slice. Phase model changed from linear single-server build to per-MCP vertical slices. Four themed MCPs named with tool catalogs. Hard-cut package list added. Source-of-truth posture re-stated (npm-first, MCPs import). Open questions logged.
- **v1.0 (2026-05-18)** — Initial brief, frozen.
