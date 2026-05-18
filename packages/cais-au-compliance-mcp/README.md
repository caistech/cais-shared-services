# @caistech/cais-au-compliance-mcp

MCP server exposing Australian compliance tools as thin adapters over the
`@caistech/*` packages: ABN lookup, multi-country business registry,
sanctions screening, and certificate extraction.

**Phase 1 of the CAIS MCP build** — see
[`docs/mcp/MCP_cais-au-compliance_BUILD.md`](../../docs/mcp/MCP_cais-au-compliance_BUILD.md)
for the full build plan + funnel architecture.

## Tools (8)

| Tool | Backing package | BYOK? |
|---|---|---|
| `validate_abn` | `@caistech/abn-lookup` | No |
| `lookup_abn` | `@caistech/abn-lookup` | No (server-side ABR GUID) |
| `search_business_by_name` | `@caistech/abn-lookup` | No (server-side ABR GUID) |
| `validate_registration_number` | `@caistech/business-registry` | No |
| `lookup_business` | `@caistech/business-registry` | Optional (provider key per country) |
| `screen_subject` | `@caistech/sanctions-screen` | No (CAIS-hosted public-list cache) |
| `list_supported_cert_types` | `@caistech/cert-extractor` | No |
| `extract_cert` | `@caistech/cert-extractor` | **Yes — Anthropic key** |

## Source-of-truth posture

Every tool is a thin adapter that imports a named function from the backing
package, validates input via zod, calls the function, and returns the
result. **Zero domain logic lives in this package.** Bug fixes or feature
additions to a backing package flow through to this MCP on the next
republish + redeploy.

## What's NOT in v0.1.0 (deferred)

The build plan calls for a vertical slice; this is the scaffolded code half
of that slice. Still to do across follow-up sessions:

- Vercel hosting deploy + custom domain `mcp.cais.au/compliance`
- Supabase migration for `mcp_install` / `mcp_call` / `mcp_engagement` tables
  (telemetry currently falls back to in-memory)
- HTTP transport adapter (currently stdio only — works in Claude Code already)
- Interview agent web frontend at `cais.com/interview`
- Connexions Sprint + prelabz intake form wiring
- Marketplace listing + smoke tests under Anthropic's MCP validator

## Local development

```bash
# From the monorepo root:
npm install

# Build this package only:
npm run build --workspace @caistech/cais-au-compliance-mcp

# Run via stdio (works in Claude Code MCP config):
node packages/cais-au-compliance-mcp/dist/server.js
```

## Configuration (env vars)

| Var | Purpose | Default |
|---|---|---|
| `ABR_GUID` | ABR Web Services GUID for `lookup_abn` / `search_business_by_name` | (none — tools return error if unset) |
| `ANTHROPIC_API_KEY` | BYOK key for `extract_cert` vision calls (local dev fallback; hosted MCP reads from session config instead) | (none — `extract_cert` returns error if unset) |
| `TIANYANCHA_API_KEY` | CN provider key for `lookup_business` (deferred — v1 ships stub providers only) | (none) |
| `TELEMETRY_BACKEND` | `memory` or `supabase` — Supabase wiring lands when migration is applied | `memory` |
| `FREE_TIER_DAILY_PER_TOOL` | Per-tool per-install daily call cap | `100` |
| `FUNNEL_PROMPT_AFTER_CALLS` | Threshold for soft funnel prompt | `10` |
| `FUNNEL_PROMPT_AFTER_DAYS` | Or after this many days of active use | `7` |
| `INTERVIEW_AGENT_URL` | URL the funnel prompt links to | `https://cais.com/interview` |
| `CONNEXIONS_INTAKE_URL` | Connexions Platform Trust Sprint intake (already live since 2026-05-14) | `https://connexions-silk.vercel.app/p/platform-trust-sprint-intake` |

**On prelabz routing:** Path C decision logged 2026-05-18 — prelabz productisation
routing is deferred for v1. The interview agent's triage question still asks
"for someone else or yourself?", but for-yourself outcomes are captured
data-only by the interview agent (no public productisation intake). Revisit
once funnel data shows real demand for a productisation track.
