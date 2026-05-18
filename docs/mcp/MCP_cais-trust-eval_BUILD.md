# Build Plan: `cais-trust-eval` MCP (Phase 4)

**Parent docs:** [`MCP_BUILD_BRIEF.md`](../MCP_BUILD_BRIEF.md) (v1.0) + [`MCP_BUILD_BRIEF_v1.1_AMENDMENT.md`](./MCP_BUILD_BRIEF_v1.1_AMENDMENT.md)
**Inherits shared infra from:** [`MCP_cais-au-compliance_BUILD.md`](./MCP_cais-au-compliance_BUILD.md) (Phase 1)
**Phase:** 4 — fourth MCP, optional, gated on the first three validating
**Date:** 2026-05-18
**Estimated effort:** 3–5 days (smallest catalog of the four)
**Status:** FROZEN FOR BUILD (conditional — build only if Phase 1–3 funnel mechanics confirm the model)

---

## Audience and positioning

Builders evaluating their own AI agents. Security-conscious engineering leads who need to show stakeholders that the agent they're building meets a defensible bar. Compliance / governance teams sizing up vendor agents. **The most direct funnel into Connexions Platform Trust Sprint** of any MCP in the portfolio — the score *is* the conversation starter.

**One-line marketplace pitch:** *"Score your AI agent project across security, correctness, observability, and reliability. Get a graded PDF report you can hand to your boss or your auditor."*

This MCP is **niche by design**. Install volume will be low compared to the others; lead quality will be the highest. The funnel pitch writes itself: "You scored 6/10 on security — Connexions Platform Trust Sprint takes you to 9/10 in two weeks."

---

## Tool catalog (4 tools across 2 packages)

| Tool name | Backing package + function | Cost class | BYOK? | Description |
|---|---|---|---|---|
| `scan_agent_repo` | `@caistech/agent-trust-score` → `scanProject` | Variable (depends on repo size; static + LLM-aided checks) | Optional Anthropic key for deeper LLM-class checks; free tier runs static-only | Scan a public Git URL or zip and return a `TrustScoreReport` (per-dimension scores + findings). |
| `get_score_criteria` | `@caistech/agent-trust-score` → `getCriteria` / `CRITERIA` | Utility | No | Return the rubric — what's being graded and how. Useful for agents that want to explain the score to the user. |
| `get_dimension_score` | `@caistech/agent-trust-score` → consumer of `TrustScoreReport` | Utility | No | Given a prior `scan_id`, return the score for a single dimension (security / correctness / observability / reliability) with findings. |
| `generate_score_pdf` | `@caistech/agent-trust-score` → `renderBadge` + `@caistech/report-generator` → `renderPdf` | Variable (PDF render) | No | Take a `scan_id` and return a branded PDF report with badge + findings + recommendations. Routes to Connexions Sprint at the bottom. |

**Resources:**
- `cais://trust-eval/version`
- `cais://trust-eval/criteria` — the full rubric as a JSON resource (snapshot of `CRITERIA` from the package)

---

## The "how do we scan code that lives on the user's machine?" problem

`@caistech/agent-trust-score.scanProject(path)` expects a filesystem path. The MCP server runs on Vercel — it can't see the user's local code. Three options considered:

| Option | Trade-off |
|---|---|
| **A. Scan via uploaded zip** | Requires multipart upload UX in MCP; bandwidth + storage cost on Vercel; PII / IP leak risk for proprietary code |
| **B. Scan a public Git URL** | Lowest friction, no upload UX, no IP leak (user explicitly published the repo); excludes private repos |
| **C. Scan via per-session GitHub App OAuth** | Best privacy posture (private repos supported, scoped to the repo only); highest implementation cost |

**Recommendation: Option B for v1**, Option C as a fast-follow if Phase 4 traction warrants it.

Phase 4 v1 tool signature:

```
scan_agent_repo({
  git_url: "https://github.com/owner/repo",
  ref?: "main" | <commit-sha>,
  include_llm_checks?: boolean   // requires anthropic_api_key in session config
})
```

The MCP server:
1. Clones the public repo into a tmpdir (Vercel ephemeral storage; clean up after).
2. Runs `scanProject(tmpdir)`.
3. Returns a `scan_id` plus the full `TrustScoreReport`.
4. Caches results in Supabase keyed by `(git_url, ref)` for 24 hours — `generate_score_pdf` and `get_dimension_score` resolve `scan_id` from the cache, no rescan needed.

**Vercel ephemeral storage caveat:** Vercel functions have 512MB tmpdir cap. Reject repos over a size limit (~250MB cloned) with a tool error pointing at Connexions Sprint for in-person review of larger codebases.

---

## Source-of-truth posture

Same single-source-of-truth model. The MCP server is a thin adapter:
- `agent-trust-score`'s scanner / grader / criteria / badge live in the package
- `report-generator`'s PDF rendering lives in the package
- The MCP adds: Git-clone orchestration, scan-result caching, PDF assembly (combining badge + findings + Connexions footer)

Updates to either package → MCP redeploy → users see the new behaviour.

---

## Server architecture

```
cais-shared-services/
└── apps/
    └── cais-trust-eval-mcp/
        ├── package.json
        ├── src/
        │   ├── server.ts
        │   ├── tools/
        │   │   ├── scan.ts            ← scan_agent_repo
        │   │   ├── criteria.ts        ← get_score_criteria
        │   │   ├── dimension.ts       ← get_dimension_score
        │   │   ├── pdf.ts             ← generate_score_pdf
        │   │   └── index.ts
        │   ├── repo-clone.ts          ← git clone into tmpdir with size cap + cleanup
        │   ├── scan-cache.ts          ← Supabase-backed scan result cache (24h TTL)
        │   ├── telemetry.ts           ← reuses Phase 1
        │   ├── interview.ts           ← reuses Phase 1, with score-aware pre-prompt
        │   └── auth.ts                ← @caistech/api-key-auth
        └── api/mcp/[transport].ts
```

**Workspace dependencies:**

```json
{
  "name": "@caistech/cais-trust-eval-mcp",
  "private": true,
  "dependencies": {
    "@caistech/agent-trust-score": "workspace:*",
    "@caistech/report-generator": "workspace:*",
    "@caistech/api-key-auth": "workspace:*",
    "@modelcontextprotocol/sdk": "^latest",
    "@vercel/mcp-adapter": "^latest",
    "simple-git": "^latest"
  }
}
```

---

## Hosting

**Vercel project:** `cais-trust-eval-mcp`
**Production URL:** `https://mcp.cais.au/trust-eval`
**Env vars (on top of Phase 1's shared set):**
- `SCAN_CACHE_TTL_HOURS` — default 24
- `MAX_REPO_SIZE_MB` — default 250
- `CONNEXIONS_SPRINT_URL` — URL embedded in the PDF report footer

---

## Funnel routing — score-aware interview pre-prompt

This MCP's funnel hook is **score-conditioned**. When the threshold prompt fires (or when `generate_score_pdf` is called), the interview agent's opening question is tailored to the lowest-scoring dimension:

| Lowest dimension | Interview pre-prompt |
|---|---|
| Security | *"Your agent scored low on security — what's the deployment context? Connexions Sprint runs a security-focused hardening engagement that gets most projects from your current score to 9/10 in two weeks."* |
| Correctness | *"Your agent scored low on correctness — what does 'correct' mean for your use case? Connexions Sprint includes a correctness audit that surfaces hidden failure modes."* |
| Observability | *"Your agent scored low on observability — do you have logging and tracing in place? Connexions Sprint installs the observability layer your future-self will thank you for."* |
| Reliability | *"Your agent scored low on reliability — what happens when an LLM call fails or rate-limits? Connexions Sprint walks you through reliability patterns CAIS uses in production."* |

All four route to the Connexions Sprint intake form (`CONNEXIONS_INTAKE_URL`) with the score payload pre-filled. Conversation starts with full context.

The standard prelabz-vs-Connexions triage still applies but is secondary — most Phase 4 users are building agents for an employer / client (Connexions), not selling agents-as-a-product (prelabz).

---

## Marketplace listing (draft)

**Title:** CAIS Trust Eval — Score Your AI Agent

**Short description:** Static + dynamic analysis of your agent project across security, correctness, observability, and reliability. Get a graded PDF you can hand to your boss, your auditor, or your customer.

**Trust signals:** *"The same rubric Corporate AI Solutions uses to gate production deployment across the CAIS portfolio. The findings list maps to fixes — including the option to run Connexions Platform Trust Sprint if you want CAIS to do the fixing."*

---

## Pre-launch checklist (Phase 4 specifics)

Phase 1's shared infra checklist applies. Additionally:

- [ ] `@caistech/agent-trust-score` published at latest version with all four dimension checkers wired
- [ ] `@caistech/report-generator` published at latest version with a "trust score" brand template
- [ ] Repo-clone tmpdir + size cap + cleanup tested under Vercel function limits
- [ ] Supabase `mcp_scan_cache` table provisioned via migration
- [ ] PDF report template designed and reviewed (badge + per-dimension scores + findings list + Connexions Sprint footer)
- [ ] Score-aware interview pre-prompts wired to interview agent for all four lowest-dimension cases
- [ ] Connexions Sprint intake form accepts `score_payload` query param and renders pre-filled context
- [ ] Marketplace listing includes a sample PDF (anonymised) so users can preview the deliverable before installing
- [ ] Trust framing: "we scan public repos only in v1; private-repo support coming with GitHub App OAuth"

---

## Open questions

1. **Private repo support timing** — Option C (GitHub App OAuth) is a Phase 4.5 fast-follow if Phase 4 v1 converts. Estimate: +5–7 days.
2. **PDF branding** — share a single CAIS brand across all PDFs from this MCP, or per-customer branding (white-label) for Managed Tier? Default v1: CAIS-branded only. Revisit if Managed Tier customers request white-label.
3. **Score versioning** — the rubric will evolve. PDFs should embed rubric version + scan timestamp so historical scores remain interpretable. Add to PDF metadata in build.
4. **Repo-size hard cap** — 250MB is a guess. Tune after first 20 scans.

---

## Why this is Phase 4, not Phase 2

The brief's Appendix B identifies four plugin destinations, with **CAIS Trust → Connexions Sprint** as the cleanest direct-conversion fit. Logically that makes it a candidate for Phase 1 (highest-value lead per install). It's deferred to Phase 4 because:

1. **Install volume will be lowest.** A "score your agent" tool is niche; AU compliance and property intelligence have broader audiences. Phases 1–2 prove out the marketplace funnel mechanics at higher install volume; Phase 4 piggybacks on validated infra.
2. **Phase 1's shared telemetry + interview infra has to be in production already.** Building Phase 4 first would mean building the funnel infra for the lowest-volume product — wrong order.
3. **The Connexions Platform Trust Sprint product itself needs to be productised** (intake form, scoping doc, fixed-fee tiers). Phases 1–3 give the time to lock that in.

---

## What's NOT in this MCP

- `@caistech/security-gate` exposure — it's internal infra the MCP server uses to gate its own behaviour, not a tool users call. Same exclusion as Phase 1.
- Project-wide vulnerability scanning (Snyk-style) — `agent-trust-score` is specifically agent-focused (prompt-injection resistance, LLM cost governance, etc.); general dep-scanning is out of scope and well-served by existing tools.
- Continuous monitoring / "watch this repo" — v1 is one-shot scans only. Continuous monitoring is a Managed Tier product, not a free MCP tool.
