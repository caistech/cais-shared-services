# Build Plan: `cais-au-compliance` MCP (Phase 1)

**Parent docs:** [`MCP_BUILD_BRIEF.md`](../MCP_BUILD_BRIEF.md) (v1.0) + [`MCP_BUILD_BRIEF_v1.1_AMENDMENT.md`](./MCP_BUILD_BRIEF_v1.1_AMENDMENT.md)
**Phase:** 1 — first MCP to ship
**Author:** Dennis / Corporate AI Solutions
**Date:** 2026-05-18
**Estimated effort:** 10–14 days end-to-end (tools + hosting + telemetry + funnel)
**Status:** FROZEN FOR BUILD

---

## Audience and positioning

Australian SMB compliance builders, R&D Tax Tracker adjacency, indie regtech / fintech devs working AU-specific workflows.

**One-line marketplace pitch:** *"Validate ABNs, screen sanctions lists, extract data from compliance certificates — Australian-first regulatory plumbing for any agent."*

This is the wedge for the broader CAIS funnel. It's deliberately scoped narrow so:
- The free tools (`validate_abn`, `validate_registration_number`) prove utility instantly with zero friction (no API key, no signup).
- The BYOK tools (`extract_cert`, `screen_subject` if live lookups are added) extend value without forcing CAIS into the LLM-billing relationship.
- The funnel routes high-intent installs into Connexions Sprint (employed compliance devs) or prelabz (indie regtech builders) per Appendix B's triage signal.

---

## Tool catalog (8 tools across 4 packages)

| Tool name | Backing package + function | Cost class | BYOK? | Description |
|---|---|---|---|---|
| `validate_abn` | `@caistech/abn-lookup` → `validateAbn` + `formatAbn` | Utility (sub-cent) | No | Deterministic ABN checksum validation; returns formatted ABN + error reasons. |
| `lookup_abn` | `@caistech/abn-lookup` → `lookupAbn` | Utility (sub-cent) | No (uses CAIS-held ABR GUID) | ABR live lookup — entity name, status, GST, trading names, ACN. |
| `search_business_by_name` | `@caistech/abn-lookup` → `searchByName` | Utility (sub-cent) | No | Free-text business name search against ABR. |
| `validate_registration_number` | `@caistech/business-registry` → `validateRegistrationNumber` | Utility (sub-cent) | No | Deterministic format check for CN (USCC), VN (MST), MY (SSM), AU (ABN), HK (NIB). |
| `lookup_business` | `@caistech/business-registry` → `BusinessRegistry.lookup` | Variable | Yes (provider key required for live lookups; deterministic fallback always works) | Multi-country registry lookup via injected provider (Tianyancha for CN, stub for others). |
| `screen_subject` | `@caistech/sanctions-screen` → `SanctionsScreener.screen` | Variable (~$0.001/call cached) | No (CAIS-hosted list cache) | Screen a person or entity against OFAC SDN, UN consolidated, AU DFAT, UK HM Treasury, EU consolidated. Fuzzy name matching. |
| `extract_cert` | `@caistech/cert-extractor` → `extractCert` | LLM-class | **Yes (Claude vision key)** | OCR + structured extraction for ISO 9001, business licences, CodeMark, JAS-ANZ, mill certs. Bilingual original + EN translation. |
| `list_supported_cert_types` | `@caistech/cert-extractor` (re-export of `CertType` enum) | Utility | No | Returns enum of supported certificate types — helps the calling agent pick the right input shape. |

**Resources (read-only, not tools):**
- `cais://au-compliance/version` — package versions in this MCP build (for debuggability)
- `cais://au-compliance/health` — last-cached sanctions-list refresh timestamps + provider statuses

---

## Source-of-truth posture (single-line restatement)

Every tool above is a **thin adapter**: it imports the named function from the `@caistech/*` package, validates the MCP-protocol input, calls the function, returns the JSON result. **Zero domain logic lives in the MCP server.** A bug fix in `@caistech/abn-lookup` → republish → MCP redeploy → all installs pick up the fix on next call. No parallel maintenance.

---

## Server architecture

```
cais-shared-services/
└── apps/
    └── cais-au-compliance-mcp/        ← new app (sibling to existing packages/)
        ├── package.json               ← declares dependencies on @caistech/* packages
        ├── src/
        │   ├── server.ts              ← MCP server entrypoint
        │   ├── tools/
        │   │   ├── abn.ts             ← validate_abn, lookup_abn, search_business_by_name
        │   │   ├── registry.ts        ← validate_registration_number, lookup_business
        │   │   ├── sanctions.ts       ← screen_subject
        │   │   ├── cert.ts            ← extract_cert, list_supported_cert_types
        │   │   └── index.ts           ← exports all tool definitions
        │   ├── telemetry.ts           ← usage counter + threshold tracking (shared infra for all 4 MCPs)
        │   ├── interview.ts           ← AI interview agent stub + routing logic
        │   ├── byok.ts                ← session-scoped key handling for cert extraction
        │   └── auth.ts                ← @caistech/api-key-auth wiring (free tier = anonymous, premium = API key)
        ├── api/
        │   └── mcp/[transport].ts     ← Vercel deployment entrypoint
        ├── tsconfig.json
        └── README.md                  ← marketplace listing content lives here
```

**Why `apps/` (not `packages/`):** apps are deployables, packages are libraries. The MCP server is a deployed product, not a library. The existing monorepo workspace (`pnpm-workspace.yaml` or `package.json` workspaces) already supports both — add `apps/*` to the workspaces glob if not already present.

**Dependencies the MCP server pulls in:**

```json
{
  "name": "@caistech/cais-au-compliance-mcp",
  "private": true,
  "dependencies": {
    "@caistech/abn-lookup": "workspace:*",
    "@caistech/business-registry": "workspace:*",
    "@caistech/sanctions-screen": "workspace:*",
    "@caistech/cert-extractor": "workspace:*",
    "@caistech/api-key-auth": "workspace:*",
    "@modelcontextprotocol/sdk": "^latest",
    "@vercel/mcp-adapter": "^latest"
  }
}
```

`workspace:*` ensures the MCP always builds against the latest in-tree version of each `@caistech/*` package — this is the single-source-of-truth enforcement.

---

## Hosting target — Vercel

Decided in favour of Vercel over Cloudflare/Railway because:
- `@vercel/mcp-adapter` exists and is the path of least resistance for an HTTP-transported MCP server.
- Existing portfolio infra (`@caistech/portfolio-env-sync`) already manages Vercel env vars per project — slot the MCP project into the manifest and env sync just works.
- Vercel preview deployments give per-PR test URLs, useful for marketplace QA.

**Vercel project name:** `cais-au-compliance-mcp`
**Production URL:** `https://mcp.cais.au/compliance` (custom domain) or `cais-au-compliance-mcp.vercel.app` (default)
**Custom domain decision:** Custom domain recommended pre-marketplace-launch — gives all four MCPs a coherent `mcp.cais.au/<theme>` namespace.

**Env vars (added to `portfolio-manifest.yaml`):**
- `ABR_GUID` — CAIS-held ABR Web Services GUID for `lookup_abn` / `search_business_by_name`
- `SANCTIONS_CACHE_BACKEND` — `vercel-kv` or `none` (default `vercel-kv` for production)
- `TELEMETRY_BACKEND` — `supabase` (writes to the shared coordination/usage table)
- `INTERVIEW_AGENT_URL` — points at `cais.com/interview` or in-MCP route
- `CONNEXIONS_INTAKE_URL` — Connexions Platform Trust Sprint intake form
- `PRELABZ_INTAKE_URL` — prelabz onboarding flow
- `NOTIFICATION_EMAIL` — where threshold-prompt + interview-completion notifications go

---

## Telemetry & threshold logic (shared infra for all four MCPs)

Built once in Phase 1, reused in Phases 2–4.

**Tables (Supabase, schema-only, no PII at install):**

```sql
-- Anonymous install + usage tracking
create table mcp_install (
  install_id uuid primary key default gen_random_uuid(),
  mcp_name text not null,             -- 'cais-au-compliance', etc.
  installed_at timestamptz default now(),
  user_agent text,                    -- Claude Code / Cowork / other
  opted_in_telemetry boolean default true
);

create table mcp_call (
  call_id uuid primary key default gen_random_uuid(),
  install_id uuid references mcp_install(install_id),
  tool_name text not null,
  called_at timestamptz default now(),
  duration_ms integer,
  status text                         -- 'ok' | 'error' | 'rate_limited'
);

-- Threshold + interview state
create table mcp_engagement (
  install_id uuid primary key references mcp_install(install_id),
  prompted_at timestamptz,            -- when threshold prompt fired
  interview_started_at timestamptz,
  interview_completed_at timestamptz,
  routing text,                       -- 'connexions' | 'prelabz' | 'data_only'
  routing_payload jsonb               -- captured interview answers
);
```

**Threshold rule (v1, tunable):** Prompt after **N=10 tool calls** OR **M=7 days of any active use**, whichever comes first. Prompt is a soft tool result appendix: *"You've used cais-au-compliance N times — want to go deeper? [link to interview]"*. The user is not blocked; the prompt does not re-fire if dismissed within 30 days.

**No PII captured at install or in `mcp_call`.** First PII (email) is collected only at the interview step, with explicit consent.

---

## Funnel: AI interview agent + routing

Per Appendix B's funnel architecture:

1. **Threshold prompt fires** → user clicks the interview link → opens `cais.com/interview?install_id=<uuid>&mcp=au-compliance` (or in-MCP if MCP supports interactive sessions).
2. **Interview agent (Claude-powered)** asks the four canonical questions:
   - "What are you building?"
   - "What's working — which tools have you been using?"
   - "What's missing — anything you wish this MCP did?"
   - **Triage question:** *"Are you building this for someone else (employer / client) or for yourself (you want to sell what you're building)?"*
3. **Routing logic** (in `interview.ts`):
   - `for-someone-else` → POST to `CONNEXIONS_INTAKE_URL` with interview payload
   - `for-self` → POST to `PRELABZ_INTAKE_URL`
   - `both` / `unclear` / `exploring` → write to `mcp_engagement.routing = 'data_only'`, email Dennis with gentle follow-up cadence flag
4. **Email Dennis** at `NOTIFICATION_EMAIL` on every interview completion with full context.

Interview agent itself uses `@caistech/ai-client` internally for Claude calls — that's CAIS's own LLM cost, not the user's.

---

## BYOK posture per tool

| Tool | BYOK? | If yes — how the user supplies it |
|---|---|---|
| `validate_abn`, `lookup_abn`, `search_business_by_name` | No | CAIS-hosted ABR GUID; free forever |
| `validate_registration_number` | No | Deterministic; no API call |
| `lookup_business` | Optional | Live provider lookups (Tianyancha, etc.) require a provider key passed as MCP session config; without a key, falls back to deterministic format validation only |
| `screen_subject` | No | CAIS-hosted sanctions-list cache; free with rate limit (e.g. 100 calls/day/install) |
| `extract_cert` | **Yes** | User passes their Anthropic API key as an MCP session config var (`ANTHROPIC_API_KEY`). The MCP server never logs or persists it. Framed in marketplace copy as: *"This tool uses Claude vision. Connect your Anthropic account so usage runs on your existing credit — no markup from us."* |

**Rate limits for non-BYOK tools (sanity caps to keep CAIS's hosted cost bounded):**
- Free tier: 100 calls/install/day per tool
- Above limit: returns a tool error with a "talk to us about volume" link → routes to the interview agent

---

## Marketplace listing (draft)

**Title:** CAIS AU Compliance — Australian Business + Sanctions + Certificate Intelligence

**Short description:** Validate ABNs, screen sanctions lists, extract data from compliance certificates. Australian-first regulatory plumbing for any Claude or MCP-compatible agent.

**Long description:** [draft separately during Phase 1 — keep <300 words, lead with one specific use case e.g. "Building a fintech KYC flow? This MCP gives you ABR lookup + DFAT screening in one install."]

**Categories:** Compliance, Australian Business, Sanctions Screening, KYC

**Trust signals:** "Made by Corporate AI Solutions (Sydney). Tools wrap audited `@caistech/*` packages used in production for F2K Tokenisation (CMPP G1/G6) and the R&D Tax Tracker."

---

## Pre-launch checklist (from Appendix B + Phase 1 specifics)

- [ ] All four `@caistech/*` packages published at their latest versions (abn-lookup ≥0.1.1, business-registry ≥0.1.0, sanctions-screen ≥0.2.0, cert-extractor ≥0.1.0)
- [ ] `apps/cais-au-compliance-mcp/` builds clean via `pnpm build`
- [ ] MCP server passes Anthropic's MCP marketplace validation (tool schema, manifest)
- [ ] Vercel project provisioned and added to `portfolio-manifest.yaml`
- [ ] Env vars set on Vercel (ABR_GUID, SANCTIONS_CACHE_BACKEND, TELEMETRY_BACKEND, etc.)
- [ ] Supabase tables (`mcp_install`, `mcp_call`, `mcp_engagement`) provisioned via migration (apply via `supabase db push`, not manually)
- [ ] Custom domain `mcp.cais.au/compliance` provisioned and proven (or fallback to vercel.app subdomain documented)
- [ ] Connexions Platform Trust Sprint intake form live and reachable at `CONNEXIONS_INTAKE_URL`
- [ ] prelabz onboarding flow live and reachable at `PRELABZ_INTAKE_URL`
- [ ] AI interview agent built and tested against all three triage outcomes
- [ ] Threshold prompt UX tested in Claude Code + at least one other MCP client
- [ ] Email sequencer set up (Day 0 / 3-5 / 14 / 30 from interview completion) using `noreply@updates.corporateaisolutions.com`
- [ ] CRM / Notion / Sheets pipeline that captures install → call → interview → routing → conversation → outcome
- [ ] Dennis has explicit calendar capacity reserved for follow-up calls
- [ ] Marketplace listing copy reviewed and submitted
- [ ] Smithery listing prepared in parallel (same package, separate listing)

**If any of these are missing at launch time: hold the launch.** Installs without follow-up infra evaporate (per Appendix B).

---

## Auth-pattern check (global CLAUDE.md rule)

The MCP server itself doesn't ship an auth page — but the **interview agent's web frontend at `cais.com/interview`** is a user-facing page that may need session continuity. If the interview flow grows beyond a single-page form (e.g. resume-after-30-days, multi-step), and any password field appears, the three non-negotiable patterns (forgot-password, password visibility toggle, working magic-link) must all be present. Flag if Phase 1 grows in that direction; v1 of the interview is single-page-form-only and doesn't trigger the rule.

---

## Open questions logged in this plan

1. **Custom domain** — `mcp.cais.au/<theme>` vs `<theme>.mcp.cais.au` vs default Vercel subdomain. Default custom subpath; confirm before launch.
2. **Rate limit values** — 100 calls/install/day is a guess. Tune after first 100 installs.
3. **Sanctions-list refresh cadence** — currently weekly cache; check whether the underlying `@caistech/sanctions-screen` package has a built-in refresh job or needs the MCP server to schedule one.
4. **Interview agent location** — in-MCP (using MCP elicitation) vs hosted at `cais.com/interview`. Hosted is simpler v1; in-MCP is the dogfooding answer. Default hosted; revisit when MCP elicitation patterns settle in the ecosystem.

---

## Patterns reused by Phases 2–4

Everything in this build plan that is **not specific to AU compliance tools** is shared infrastructure for the other three MCPs:

- The `apps/cais-<theme>-mcp/` directory pattern
- Telemetry tables (`mcp_install`, `mcp_call`, `mcp_engagement`)
- Threshold + interview-prompt logic
- Routing-to-Connexions/prelabz logic
- BYOK session-config handling
- Vercel + portfolio-manifest deployment posture
- Marketplace listing structure

Phases 2–4 cite this document for shared infra and only spec their own tool catalogs + audience-specific positioning.
