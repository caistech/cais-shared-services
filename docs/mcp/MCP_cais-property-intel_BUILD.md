# Build Plan: `cais-property-intel` MCP (Phase 2)

**Parent docs:** [`MCP_BUILD_BRIEF.md`](../MCP_BUILD_BRIEF.md) (v1.0) + [`MCP_BUILD_BRIEF_v1.1_AMENDMENT.md`](./MCP_BUILD_BRIEF_v1.1_AMENDMENT.md)
**Inherits shared infra from:** [`MCP_cais-au-compliance_BUILD.md`](./MCP_cais-au-compliance_BUILD.md) (Phase 1)
**Phase:** 2 — second MCP, ships after Phase 1's funnel proves out
**Date:** 2026-05-18
**Estimated effort:** 5–7 days (most infra is reused; this plan focuses on tool catalog + audience-specific funnel)
**Status:** FROZEN FOR BUILD (gated on Phase 1 launch)

---

## Audience and positioning

Australian proptech indie devs, Deal-Findrs / F2K Checkpoint adjacency, builders needing programmatic property intelligence (zoning, planning overlays, subdivision feasibility).

**One-line marketplace pitch:** *"Australian property intelligence for agents — geocode, derive a property profile, assess subdivision feasibility, validate the owner. One install, one MCP."*

The wedge tool is `forward_geocode` (Mapbox-based, BYOK Mapbox key — free tier covers a lot). Once a developer is geocoding AU addresses through this MCP, they're one tool call away from `derive_property_profile` and the conversion question — *do you want the deeper assessment data?* That's the Managed Tier hook.

---

## Tool catalog (8 tools across 4 packages)

| Tool name | Backing package + function | Cost class | BYOK? | Description |
|---|---|---|---|---|
| `forward_geocode` | `@caistech/mapbox` → `forwardSearch` | Utility | **Yes (Mapbox key)** | Forward geocoding — address → lat/lng + structured components. AU-biased. |
| `reverse_geocode` | `@caistech/mapbox` → `reverseSearch` | Utility | **Yes (Mapbox key)** | Reverse geocoding — lat/lng → address + suburb/postcode/state. |
| `parse_coordinates` | `@caistech/mapbox` → `parseCoordinates` | Utility (no API) | No | Coordinate string parsing helper. Deterministic. |
| `static_map_url` | `@caistech/mapbox` → `getStaticMapUrl` | Utility | **Yes (Mapbox key)** | Returns a static map image URL (incl. satellite styles). |
| `validate_abn` | `@caistech/abn-lookup` → `validateAbn` + `formatAbn` | Utility | No | Re-exposed from `cais-au-compliance` — useful for owner/developer entity checks. |
| `lookup_abn` | `@caistech/abn-lookup` → `lookupAbn` | Utility | No | Re-exposed — owner entity profile from ABR. |
| `derive_property_profile` | `@caistech/property-services-sdk` → `PropertyServicesClient.derive` | Variable (calls hosted edge functions) | Free tier rate-limited; Managed Tier removes limits | Property profile: lot info, zoning, environmental overlays, planning overlays, normalised address. |
| `assess_property_suitability` | `@caistech/property-services-sdk` → `PropertyServicesClient.assess` | LLM-class (server-side, CAIS-billed in Managed Tier; rate-limited in free tier) | No (CAIS-hosted) | Subdivision feasibility + suitability assessment. **Managed Tier upgrade trigger.** |

**Resources:**
- `cais://property-intel/version` — package versions
- `cais://property-intel/coverage` — which AU states + LGAs the `property-services` backend currently covers (matters for setting expectations)

**Why re-expose `validate_abn` + `lookup_abn`** instead of telling property-intel users to also install `cais-au-compliance`: avoids two-MCP-install friction for the most common combined workflow (property-owner-verification + property-data). Same single source of truth (`@caistech/abn-lookup`); just exposed in two catalogs.

---

## Source-of-truth posture

Same as Phase 1: thin adapter pattern, zero domain logic in the MCP server. `property-services-sdk` itself wraps property-services edge functions over HTTP — so the call chain is **MCP → SDK → edge function → Supabase**. Three hops, but each hop preserves the single-source-of-truth invariant: query shape lives in the SDK, business logic lives in the edge function, data lives in Supabase. Decision on whether to flatten (MCP → edge function direct, skipping the SDK) deferred — current default keeps SDK in the loop, revisit if latency becomes a problem.

---

## Server architecture

Same shape as `cais-au-compliance-mcp`:

```
cais-shared-services/
└── apps/
    └── cais-property-intel-mcp/
        ├── package.json
        ├── src/
        │   ├── server.ts
        │   ├── tools/
        │   │   ├── geocode.ts     ← forward_geocode, reverse_geocode, parse_coordinates, static_map_url
        │   │   ├── owner.ts       ← validate_abn, lookup_abn
        │   │   ├── property.ts    ← derive_property_profile, assess_property_suitability
        │   │   └── index.ts
        │   ├── telemetry.ts       ← reuses Phase 1 schema; same Supabase tables, different mcp_name value
        │   ├── interview.ts       ← reuses Phase 1 interview agent + triage flow
        │   ├── byok.ts            ← Mapbox key handling (different from Phase 1's Anthropic-key BYOK; same pattern)
        │   └── auth.ts            ← @caistech/api-key-auth (free + Managed Tier)
        └── api/mcp/[transport].ts
```

**Workspace dependencies:**

```json
{
  "name": "@caistech/cais-property-intel-mcp",
  "private": true,
  "dependencies": {
    "@caistech/mapbox": "workspace:*",
    "@caistech/abn-lookup": "workspace:*",
    "@caistech/property-services-sdk": "workspace:*",
    "@caistech/api-key-auth": "workspace:*",
    "@modelcontextprotocol/sdk": "^latest",
    "@vercel/mcp-adapter": "^latest"
  }
}
```

---

## Hosting

**Vercel project:** `cais-property-intel-mcp`
**Production URL:** `https://mcp.cais.au/property-intel` (or vercel.app fallback)
**Additional env vars on top of Phase 1's set:**
- `PROPERTY_SERVICES_URL` — base URL for the property-services edge functions backend (this is the URL of the existing `property-services` Next.js app)
- `PROPERTY_SERVICES_API_KEY` — shared secret for MCP-to-property-services authentication (the property-services backend should accept a CAIS-internal key in addition to user-facing API keys)

Telemetry tables, interview agent, Connexions/prelabz routing — all reused from Phase 1, no schema changes.

---

## BYOK posture per tool

| Tool | BYOK? | If yes — how the user supplies it |
|---|---|---|
| `forward_geocode`, `reverse_geocode`, `static_map_url` | **Yes (Mapbox)** | User passes `MAPBOX_TOKEN` as MCP session config. Framing: *"Connect your Mapbox account — Mapbox's free tier covers up to 100K monthly requests."* |
| `parse_coordinates` | No | Deterministic |
| `validate_abn`, `lookup_abn` | No | Inherited from `cais-au-compliance` posture |
| `derive_property_profile` | No | Free tier: 50 calls/install/day. Managed Tier: unlimited + deeper data fields. |
| `assess_property_suitability` | No | Free tier: 10 calls/install/day. Managed Tier: unlimited. |

**Why `property-services-sdk` is NOT BYOK:** the property-services backend is CAIS-hosted infrastructure with curated AU data. Forcing users to bring their own property data API would defeat the value proposition. Instead, the Managed Tier subscription covers CAIS's hosting cost; free tier is rate-limited.

---

## Managed Tier conversion hook (this MCP's funnel-specific differentiator)

When a user hits the rate limit on `derive_property_profile` or `assess_property_suitability`, the tool error returns a structured upgrade prompt:

```json
{
  "error": "rate_limited",
  "message": "Free tier limit reached — 50 derive calls today.",
  "upgrade": {
    "label": "Talk to CAIS about higher volume",
    "url": "https://cais.com/interview?install_id=<uuid>&mcp=property-intel&trigger=rate_limit"
  }
}
```

This is the interview agent's pre-prompted entry — when the user lands at `cais.com/interview` via this path, the AI interview opens with: *"Looks like you're hitting the free-tier ceiling for property assessments — what are you building?"* Higher-conversion variant of the standard threshold prompt.

**Managed Tier pricing reference (from Appendix C):** $500–1,500/month per organisation depending on volume + SLA. Final price set per engagement during the interview conversation.

---

## MMC Build / Karthik framing

Appendix C calls out MMC Build's Karthik conversation as the canonical Managed Tier early case. The `cais-property-intel` MCP is the productised expression of that conversation: fixed monthly fee, CAIS handles keys/hosting/updates/support, AU compliance currency maintained centrally.

For MMC Build specifically (already a portfolio project, not a marketplace install): consume the `@caistech/*` packages directly via npm in their backend, and consume the MCP only for agent/dev-facing surfaces. Managed Tier billing handled outside the MCP infra (existing client engagement).

---

## Marketplace listing (draft)

**Title:** CAIS Property Intelligence — Australian Property Data for Agents

**Short description:** Geocode AU addresses, derive property profiles (lot, zoning, overlays), assess subdivision feasibility. Built on curated AU planning data.

**Trust signals:** "Powered by the same property intelligence backend used by F2K Checkpoint and Deal-Findrs."

---

## Pre-launch checklist (Phase 2 specifics)

Phase 1's shared infra checklist applies. Additionally:

- [ ] `@caistech/property-services-sdk` published at latest version
- [ ] `property-services` backend reachable from Vercel (allowlist / CORS configured)
- [ ] `PROPERTY_SERVICES_API_KEY` provisioned and stored in Vercel env
- [ ] Free-tier rate limits tuned (50 derive / 10 assess per day initial)
- [ ] Managed Tier pricing page live (or routed via interview)
- [ ] Coverage resource (`cais://property-intel/coverage`) populated with current AU state/LGA list
- [ ] Smoke test: `forward_geocode("100 Pitt St Sydney") → derive_property_profile(<result>) → assess_property_suitability(<profile>)` runs end-to-end in Claude Code

---

## Open questions

1. **Flatten the SDK or not?** Default keep `property-services-sdk` in the loop (preserves single-source-of-truth for query shape). Revisit if latency becomes user-visible.
2. **Free-tier rate limit values** — initial 50 derive / 10 assess per day are guesses. Tune after 50 installs.
3. **Coverage messaging** — if a user geocodes an address in a low-coverage LGA, the tool should return partial data gracefully and explain the gap. UX detail for build time.

---

## What's NOT in this MCP

- `cert-extractor` — moved to Phase 1 (AU compliance) instead. If property-intel users need building-cert OCR (e.g. CodeMark for a specific build), they install `cais-au-compliance` alongside. Cross-MCP composition is the pattern for any user with multi-domain needs.
- F2K-specific tools (dataroom, fund mechanics) — these are F2K-domain code in `@f2k/shared`, not portfolio-shared. Stay in F2K's monorepo.
