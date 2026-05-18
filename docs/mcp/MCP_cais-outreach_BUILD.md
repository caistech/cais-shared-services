# Build Plan: `cais-outreach` MCP (Phase 3)

**Parent docs:** [`MCP_BUILD_BRIEF.md`](../MCP_BUILD_BRIEF.md) (v1.0) + [`MCP_BUILD_BRIEF_v1.1_AMENDMENT.md`](./MCP_BUILD_BRIEF_v1.1_AMENDMENT.md)
**Inherits shared infra from:** [`MCP_cais-au-compliance_BUILD.md`](./MCP_cais-au-compliance_BUILD.md) (Phase 1)
**Phase:** 3 — third MCP, gated on Phases 1–2 launching successfully
**Date:** 2026-05-18
**Estimated effort:** 7–10 days (extra time for OAuth first-run UX, the only meaningfully new design problem)
**Status:** FROZEN FOR BUILD (gated on Phases 1–2)

---

## Audience and positioning

Outbound sales / lead-gen builders, sales-ops engineers, PartnerPilot / InvestorPilot adjacency, agencies building prospect-outreach agents for clients.

**One-line marketplace pitch:** *"Build outreach agents that find, enrich, and (when you connect your accounts) message prospects. Web search + email finder + LinkedIn/Gmail in one MCP."*

This MCP's central design problem is **first-run friction**: web search and email finder need API keys (Brave, Hunter); LinkedIn and Gmail need OAuth via Unipile; CRM sync needs a GHL key. The wedge is therefore the **research-only path** (Brave Search + Hunter Email + extractors), which gets a user to value with two BYOK keys both of which have generous free tiers. Execution tools (Unipile, GHL) are unlocked only when the user explicitly connects those accounts.

---

## Tool catalog (10 tools across 5 packages — research path is 4, execution path adds 6)

### Research path (free tier, two BYOK keys, generous free quotas)

| Tool name | Backing package + function | Cost class | BYOK? | Description |
|---|---|---|---|---|
| `web_search` | `@caistech/brave-search` → `braveWebSearch` | Utility | **Yes (Brave key)** | Web search for prospect discovery. Brave free tier: 2K queries/month. |
| `find_email` | `@caistech/hunter-email` → `hunterEmailFinder` | Utility | **Yes (Hunter key)** | Given domain + name → likely email + confidence score. |
| `search_domain` | `@caistech/hunter-email` → `hunterDomainSearch` | Utility | **Yes (Hunter key)** | Given domain → all known emails at that domain. |
| `verify_email` | `@caistech/hunter-email` → `hunterEmailVerifier` | Utility | **Yes (Hunter key)** | Given an email → deliverability check + risk score. |
| `extract_business_profile` | `@caistech/extractors` → `extractProfile` | LLM-class | **Yes (Anthropic key)** | Pulls structured business profile from a website URL — name, services, locations, social links. |
| `extract_social_profiles` | `@caistech/extractors` → `extractSocialProfiles` | LLM-class | **Yes (Anthropic key)** | Pulls business signals from LinkedIn/Facebook/Instagram URLs. |

### Execution path (unlock by connecting account)

| Tool name | Backing package + function | Cost class | BYOK? | Description |
|---|---|---|---|---|
| `connect_linkedin` / `connect_email` | `@caistech/unipile-channels` → `listAccounts` + Unipile hosted OAuth | Setup | Yes (Unipile key + user OAuth) | Returns a hosted Unipile OAuth URL the user opens to connect their LinkedIn / Gmail / Outlook account. |
| `search_linkedin_people` | `@caistech/unipile-channels` → `searchLinkedInPeople` | API call | Inherited from connect step | Classic + Sales Navigator search by keywords / filters. |
| `send_linkedin_message` | `@caistech/unipile-channels` → `sendLinkedInMessage` | API call | Inherited | Send a LinkedIn DM through the user's connected account. |
| `send_email` | `@caistech/unipile-channels` → `sendEmailViaUnipile` | API call | Inherited | Send email via the user's connected Gmail/Outlook. |
| `connect_ghl` | `@caistech/ghl-client` → `createGHLClient` | Setup | **Yes (GHL API key + location ID)** | Validates GHL credentials, stores them session-scoped. |
| `upsert_ghl_contact` | `@caistech/ghl-client` → `upsertContact` | API call | Inherited | Push a contact (or update) into the user's GHL CRM. |
| `trigger_ghl_workflow` | `@caistech/ghl-client` → `triggerWorkflow` | API call | Inherited | Trigger a GHL workflow for a contact. |

**Why this many tools:** outreach is a multi-step workflow (research → find email → enrich → connect → message → CRM). Splitting these gives the calling agent fine control over each step and a clean audit trail per call. The MCP doesn't ship an "auto-outreach" mega-tool — that's a workflow the calling agent assembles.

**Resources:**
- `cais://outreach/version`
- `cais://outreach/connected-accounts` — read-only summary of which session connections are active (Unipile / GHL) — surfaces consent state to the calling agent

---

## First-run UX (the design problem unique to this MCP)

Phases 1 and 2 work with zero account setup (validators) or a single API key (Mapbox). Phase 3 needs up to **four credentials** depending on which path the user wants:

1. Brave API key (research)
2. Hunter API key (email finding)
3. Anthropic key (LLM extractors)
4. Unipile API key + per-account OAuth (LinkedIn / Gmail send)
5. GHL API key + location ID (CRM sync)

If the user installs the MCP and immediately calls `send_linkedin_message`, the failure mode must be helpful, not a generic auth error.

**Tool-error contract for missing credentials:**

```json
{
  "error": "credentials_required",
  "missing": ["unipile_account_connected"],
  "message": "This tool needs a connected LinkedIn account. Run connect_linkedin to set one up.",
  "next_step_tool": "connect_linkedin"
}
```

**Recommended first-run agent flow** (documented in marketplace listing + README):
1. Install MCP.
2. Call any research tool (`web_search`, `find_email`) — these prompt only for the relevant BYOK key, value provable in seconds.
3. When the agent later needs to message or sync to CRM, call `connect_linkedin` / `connect_ghl` — the MCP returns an OAuth URL or asks for the API key.
4. Subsequent execution tools work for the rest of the session.

**Session-scoped credentials only.** The MCP server **never persists** Unipile / GHL credentials between sessions. Storing third-party CRM credentials would be a massive trust and security liability that this audience will not tolerate; framing in copy: *"Credentials live in your MCP session, not on our servers."*

---

## Source-of-truth posture

Same single-source-of-truth model. Every tool imports from the named `@caistech/*` package; zero domain logic in the MCP server. The MCP server adds: input schema, BYOK / OAuth orchestration, telemetry, and the missing-credential error contract.

---

## Server architecture

```
cais-shared-services/
└── apps/
    └── cais-outreach-mcp/
        ├── package.json
        ├── src/
        │   ├── server.ts
        │   ├── tools/
        │   │   ├── research.ts        ← web_search, find_email, search_domain, verify_email
        │   │   ├── enrichment.ts      ← extract_business_profile, extract_social_profiles
        │   │   ├── linkedin-gmail.ts  ← connect_linkedin, search_linkedin_people, send_linkedin_message, send_email, connect_email
        │   │   ├── ghl.ts             ← connect_ghl, upsert_ghl_contact, trigger_ghl_workflow
        │   │   └── index.ts
        │   ├── session-creds.ts       ← session-scoped credential store (in-memory only, dies with session)
        │   ├── telemetry.ts           ← reuses Phase 1
        │   ├── interview.ts           ← reuses Phase 1
        │   └── auth.ts                ← @caistech/api-key-auth
        └── api/mcp/[transport].ts
```

**Workspace dependencies:**

```json
{
  "name": "@caistech/cais-outreach-mcp",
  "private": true,
  "dependencies": {
    "@caistech/brave-search": "workspace:*",
    "@caistech/hunter-email": "workspace:*",
    "@caistech/extractors": "workspace:*",
    "@caistech/unipile-channels": "workspace:*",
    "@caistech/ghl-client": "workspace:*",
    "@caistech/api-key-auth": "workspace:*",
    "@modelcontextprotocol/sdk": "^latest",
    "@vercel/mcp-adapter": "^latest"
  }
}
```

---

## Hosting

**Vercel project:** `cais-outreach-mcp`
**Production URL:** `https://mcp.cais.au/outreach`
**Env vars (mostly user-supplied at session time — minimum CAIS-side):**
- `UNIPILE_BASE_URL` — Unipile DSN (defaults to `https://api.unipile.com`; some users will need a regional override)
- All other credentials are session-scoped, set by the user via MCP config or tool calls; never stored in Vercel env

**Why so few server-side env vars:** this MCP is deliberately credential-light on the CAIS side because Unipile is per-tenant SaaS — users bring their own Unipile account, which fans out to their own LinkedIn / Gmail.

---

## Funnel routing (Appendix B's triage question, adapted)

This MCP has its own routing nuance. The standard interview triage question (*"are you building for someone else or for yourself"*) maps to:

- **For someone else (employer / client)** → Connexions Sprint (often: "I'm building this for our sales ops team")
- **For yourself** → prelabz (often: "I want to launch an outreach tool / agency")
- **Both / unclear** → data-only

The CAIS Outreach plugin's appendix-B destination wasn't explicitly named (Appendix B's table was Trust / Construction / Property Intel / AU Compliance). **Propose adding to Appendix B as a v1.2 amendment:** primary destination = prelabz (most outreach plugin users are agency-style indie builders, productisation candidates); secondary = Connexions Sprint for the employed-sales-engineer subset.

---

## Marketplace listing (draft)

**Title:** CAIS Outreach — Build Sales Agents with LinkedIn, Gmail, and CRM

**Short description:** Web search for prospects, find their emails, enrich profiles, then (with your accounts connected) message them on LinkedIn or Gmail and sync to your CRM. Built for outreach-agent builders.

**Trust messaging:** "Credentials are session-scoped — your LinkedIn, Gmail, and GHL keys live in your MCP session, never on our servers."

---

## Pre-launch checklist (Phase 3 specifics)

Phase 1's shared infra checklist applies. Additionally:

- [ ] All five backing `@caistech/*` packages published
- [ ] First-run UX documented in marketplace README (the four-credential flow above)
- [ ] Tool-error contract for `credentials_required` implemented across every execution tool
- [ ] Session-scoped credential store implemented with zero-persistence guarantee + a unit test proving it
- [ ] Unipile OAuth roundtrip tested for LinkedIn, Gmail, Outlook
- [ ] GHL credential validation flow tested
- [ ] Rate-limit defaults set on research tools (e.g. 100 web_search calls / install / day on the CAIS-hosted fallback — though research tools are BYOK and quota lives with the user's Brave/Hunter account, so this is belt-and-braces)
- [ ] Trust messaging in marketplace listing reviewed by CAIS Security (per `@caistech/security-gate` / `@caistech/agent-trust-score` standards)

---

## Why this MCP is Phase 3, not Phase 2

Three reasons:
1. **Higher install friction** — four credentials worst case. Phases 1–2 prove the funnel with low-friction installs; Phase 3 tests whether the funnel survives higher friction.
2. **Bigger tool catalog** — 13 tools. Phases 1–2 keep catalogs tight (8 tools each) so marketplace positioning is sharp. Phase 3 spreads wider deliberately because outreach is a workflow, not a query.
3. **Higher trust burden** — users are connecting their personal LinkedIn + Gmail. The credential-handling story has to be rock-solid before launch; Phases 1–2 buy the time and credibility to earn that trust.

---

## Open questions

1. **Unipile pricing pass-through** — Unipile charges per connected account per month. The MCP's `connect_*` tools should make this clear in the success response, with a link to Unipile pricing. Confirm Unipile's terms allow this pattern (not reselling — just enabling user-direct connection).
2. **GHL workflow ID discovery** — `trigger_ghl_workflow` requires a workflow ID. Add a `list_ghl_workflows` tool? Or rely on the calling agent's existing knowledge of the user's GHL setup? Default: add the discovery tool in v1.
3. **Compliance / consent for outreach** — LinkedIn ToS and email anti-spam laws (AU SPAM Act, CAN-SPAM, GDPR) are the user's responsibility, but the marketplace listing should say so explicitly.

---

## What's NOT in this MCP

- Email campaign management (sequences, drip flows) — not in `@caistech/*`; out of scope.
- Multi-channel orchestration logic (e.g. "if LinkedIn fails, try email") — that's the calling agent's job; the MCP exposes primitives.
- `nudge-core` — that's internal notification infra for CAIS's own portfolio, not an outreach primitive.
