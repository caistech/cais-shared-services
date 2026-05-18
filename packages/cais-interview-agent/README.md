# `@caistech/cais-interview-agent`

Single-page interview that captures the funnel response after an MCP install crosses the 10-call threshold. Triggered by the prompt appendix surfaced by the `cais-au-compliance-mcp` (and, eventually, every other CAIS MCP).

## What it does

1. User clicks the prompt URL inside an MCP client — lands on `/interview?install_id=<uuid>&mcp=au-compliance&trigger=<tool>`.
2. Form captures: email, triage (for-someone-else vs for-yourself), and a free-text "what are you building?".
3. On submit:
   - Upserts the `mcp_engagement` row with `interview_started_at`, `interview_completed_at`, `routing`, and `routing_payload` (JSONB) in the same Supabase project the MCP writes to.
   - Sends a Resend welcome email from `noreply@updates.corporateaisolutions.com`.
   - For-someone-else → redirects to the Connexions Platform Trust Sprint intake (`CONNEXIONS_INTAKE_URL`).
   - For-yourself → redirects to `/thank-you` (Path C: captured data-only, no public productisation intake).

## URL contract with the MCP

The funnel prompt URL the MCP server builds (see `cais-au-compliance-mcp/src/interview.ts`):

```
https://<this-app>/interview
  ?mcp=au-compliance
  &install_id=<uuid>
  &trigger=<tool_name>
```

`install_id` is the same UUID the MCP stamps onto `mcp_install` and `mcp_call` rows — that's the joining key. If the URL is opened without a valid UUID, the page renders an error explaining how to re-open from the MCP client.

## Env vars (production)

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes | Same project ref as the MCP server (`ixtspznygmnlathhsrjn` for v1). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only. Never exposed to client components. |
| `RESEND_API_KEY` | Yes | Welcome email sender. Sender domain must be `updates.corporateaisolutions.com`. |
| `CONNEXIONS_INTAKE_URL` | No | Fallback to the production Connexions intake URL. |

## Local dev

```bash
cp .env.local.example .env.local
# Fill in SUPABASE_SERVICE_ROLE_KEY + RESEND_API_KEY
npm install --legacy-peer-deps    # from the monorepo root
npm run dev --workspace @caistech/cais-interview-agent
# Then visit http://localhost:3010/interview?install_id=<paste any uuid>&mcp=au-compliance
```

## Deploy

Deployed to its own Vercel project (e.g. `cais-interview-agent`). The MCP server's `INTERVIEW_AGENT_URL` env var must be updated to point at this URL once deployed.

## What's NOT here (v1)

- No email sequencer (Day 3/7/30 follow-ups) — that lives in a separate `@caistech/nudge-core` consumer.
- No "resume incomplete interview" — `interview_started_at` is recorded on page load so we can measure drop-off, but there's no public flow to come back later.
- No auth — anonymous, single-page form per the build plan auth-pattern carve-out.
