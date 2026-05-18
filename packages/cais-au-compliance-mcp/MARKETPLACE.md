# Marketplace listing — `cais-au-compliance`

Submission-ready copy for the Anthropic MCP marketplace and Smithery. Paste-and-go format. Update via PR; treat this file as the source of truth.

---

## Title

**CAIS AU Compliance — Australian Business + Sanctions + Certificate Intelligence**

## Short description (≤ 160 chars)

> Validate ABNs, screen sanctions lists, extract data from compliance certificates. Australian-first regulatory plumbing for any Claude or MCP-compatible agent.

## Categories

Compliance · Australian Business · Sanctions Screening · KYC · Document Intelligence

## Canonical install URL

`https://cais-au-compliance-mcp.vercel.app/api/mcp`

Also reachable at `/` and `/mcp` on the same host.

## Long description (≤ 300 words)

**Building a fintech KYC flow, marketplace seller onboarding, or any AU-touching agent?** This MCP gives your agent the regulatory plumbing that's otherwise a week of API integrations.

Eight tools, four backing packages, one install:

- **ABN handling** — checksum validation, live ABR lookup, business-name search. The basic, repetitive Australian-Business-Register calls every AU compliance flow ends up writing.
- **Sanctions screening** — query OFAC SDN, UN consolidated, AU DFAT, UK HM Treasury, and EU consolidated lists in one call. Fuzzy name matching, cached server-side.
- **Certificate extraction** — OCR + structured extraction for ISO 9001, business licences, CodeMark, JAS-ANZ, and mill certs. Returns original + English translation. Uses Claude vision — bring your own Anthropic API key so usage runs on your existing credit (no markup from us).
- **Multi-country registry validation** — deterministic format check for CN (USCC), VN (MST), MY (SSM), AU (ABN), HK (NIB).

**Free tier:** 100 calls/install/day per tool. Most tools are free forever (CAIS-hosted lookups). Heavy or sensitive tools accept your own API keys via session headers — never logged, never persisted.

**Privacy posture:** Anonymous install ID; we record per-tool call counts to size demand. No request arguments or results are stored. Your BYOK keys live in request headers only — they never touch our database.

Built by Corporate AI Solutions (Sydney) on the same `@caistech/*` packages running in production for F2K Tokenisation's CMPP gates and the Australian R&D Tax Tracker. MCP-spec compliant, deployed on Vercel.

## Trust signals

- Made by **Corporate AI Solutions** (Sydney, AU)
- Tools wrap audited `@caistech/*` packages used in production for **F2K Tokenisation (CMPP G1/G6)** and the **R&D Tax Tracker**
- BYOK posture for LLM-class tools — your Anthropic credit, never marked up
- Anonymous telemetry only; PII captured only after explicit user opt-in
- RLS enabled on all telemetry tables; service-role-only writes

## Install — Claude Code

Add to your MCP client config (e.g. `claude_desktop_config.json` or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "cais-au-compliance": {
      "url": "https://cais-au-compliance-mcp.vercel.app/api/mcp",
      "headers": {
        "X-Anthropic-Api-Key": "${ANTHROPIC_API_KEY}",
        "X-CAIS-Install-Id": "${CAIS_INSTALL_ID}"
      }
    }
  }
}
```

`X-Anthropic-Api-Key` is **only required for `extract_cert`** (vision LLM call) — all other tools work without it.

`X-CAIS-Install-Id` is optional but recommended: generate one UUID per workspace (`uuidgen` or `python -c "import uuid; print(uuid.uuid4())"`) so your usage rolls up into a single identity instead of fragmenting per request.

## Install — Smithery

Listed in parallel under the same name; install URL identical.

## Tool catalogue

| Tool | What it does | BYOK? |
|---|---|---|
| `validate_abn` | Deterministic ABN checksum + formatting | No |
| `lookup_abn` | Live ABR lookup — entity name, status, GST, ACN | No |
| `search_business_by_name` | Free-text business name search against ABR | No |
| `validate_registration_number` | Format check for CN/VN/MY/AU/HK registration numbers | No |
| `lookup_business` | Multi-country live registry lookup (provider key needed for non-AU) | Optional |
| `screen_subject` | Sanctions screening across OFAC/UN/DFAT/HMT/EU | No |
| `extract_cert` | OCR + structured extraction for compliance certificates | **Yes** (Anthropic key) |
| `list_supported_cert_types` | Enum of certificate types `extract_cert` supports | No |

## Support + feedback

- Maintainer: Dennis McMahon, Corporate AI Solutions
- Contact email: `mcmdennis@gmail.com`
- Issue intake: built into the funnel — after ~10 calls the MCP will prompt you to share what you're building; that routes straight to us
- Health probe: call any tool and inspect `X-CAIS-Install-Id` in the response — its echo confirms identity continuity

## Licence + distribution

Closed-source for v1. The MCP server itself is hosted by Corporate AI Solutions — no redistribution is required to use it. May open the source post-v1 once funnel data justifies the maintenance commitment.

---

**Maintainer note (not for marketplace):** when submitting, paste the Long description into the rich-text body, the Title + Short description into their respective fields, and use the install JSON block verbatim. The Trust signals and Install URL are typically rendered as sidebar metadata. Smithery's submission form takes the same fields with slightly different naming (e.g. "Tagline" = Short description).
