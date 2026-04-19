# CLAUDE.md — @caistech/coordination (service) + @caistech/coordination-sdk (published SDK)

## Global Standards Reference
This project follows Corporate AI Solutions global guardrails defined at `~/.claude/CLAUDE.md`.
All rules in that file apply here without repetition. This file adds project-specific context only.

---

## Risk Tier: REVENUE

This package is consumed by client-facing Next.js applications handling real construction project data
(participant PII, issue records, documents). Convention drift here propagates to all consumers.
Apply REVENUE-tier discipline: high read:edit ratio, no shortcuts on security logic.

---

## Project Architecture

### What this is
This repo is the **deployed service** (Supabase schema + edge functions + ops scripts). The consumer-facing SDK has been extracted to `@caistech/coordination-sdk` in `cais-shared-services` (published to GitHub Packages).

Historically this repo also held the SDK source under `sdk/` — that directory is now a reference/archive; canonical SDK source lives in the hub. New SDK features should be made in `cais-shared-services/packages/coordination-sdk/` and republished there.

The SDK provides:
- **Supabase data layer** — projects, participants, issues, comments, documents, magic links
- **Server-side actions** (`./server` entry only) — all mutations via service role client
- **Client-side React hooks** — read-only, anon-key client, realtime subscriptions
- **AI pipeline** — Claude Haiku generates role-tailored emails per participant
- **Nudge evaluators** — 6 evaluators (COORD-01 to COORD-06) integrating with `@caistech/nudge-core`
- **Platform Trust integration** — `src/lib/platform-trust.ts` for governance, rate limiting, metering
- **Security gate** — `src/lib/security-gate.ts` for prompt injection detection and output validation

### Entry points — never mix these
| Entry | Key | Usage |
|---|---|---|
| `@caistech/coordination-sdk` | anon key | Client components, hooks only |
| `@caistech/coordination-sdk/server` | service role key | Server actions, API routes, Next.js server components |

`getCoordinationServiceClient` MUST NOT appear in the root `index.ts` exports.
`getCoordinationClient` (anon) MUST NOT appear in any server action.

---

## Security Rules (project-specific)

### Anon RLS Policies
- `participants` table: NEVER grant anon SELECT with `USING (true)` — it exposes email, phone, name
- Magic link anon access: use token-hash-gated policies, not open reads
- Any migration adding `TO anon USING (true)` requires explicit review comment justifying scope

### Prompt Injection
- ALL user-provided strings entering the AI pipeline MUST pass through `sanitize()` from `src/lib/security-gate.ts` first
- This includes: `customMessage`, issue `description`, issue `next_action`, comment content
- If `sanitize()` returns `flagged: true`, log to `issue_activity_log` before proceeding
- ALL Claude output MUST pass through `validateOutput()` before being stored or sent

### Platform Trust (mandatory for AI calls)
Every call to `callClaude()` must be preceded by `trustGate()` and followed by `trustMeter()`.
Every call to `sendViaResend()` must be logged via `trustLog()`.
Skipping trust calls must be documented with a code comment explaining why.

### Service Role Key
- Never import `getCoordinationServiceClient` from a client component or hook
- The function name `getCoordinationServiceClient` must not appear in any file under `sdk/src/hooks/`
- Grep for this on any PR touching the hooks or client entry

---

## Anthropic SDK Standard
Use `@anthropic-ai/sdk` — NOT raw `fetch()` to `api.anthropic.com`.
Reason: prompt caching, type safety, error normalisation, and retry logic are built in.

```ts
// CORRECT
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic()
const response = await client.messages.create({ ... })

// WRONG — violates global standards
await fetch('https://api.anthropic.com/v1/messages', { ... })
```

Always include prompt caching headers on system prompts longer than 1024 tokens.

---

## Error Handling Patterns

### Database operations
Every Supabase call must check `error` before proceeding:
```ts
const { data, error } = await db().from('table').select('*')
if (error) throw new Error(`Context: ${error.message}`)
```

### Fire-and-forget log inserts (activity log, ai_communications)
These MUST NOT be awaited in a way that blocks the happy path.
Wrap in try/catch and log failures to console.error — do not silently discard:
```ts
try {
  await db().from('issue_activity_log').insert(...)
} catch (err) {
  console.error('[coordination] Activity log insert failed:', err)
}
```

### Email send failures
`sendViaResend` failures must set `status = "failed"` AND log the error to console.error.
The current catch block discards the error — this must be fixed.

### Magic link resolution
`last_used_at` update failures must be caught and logged — currently unhandled.

---

## Supabase / Database Rules

- Migrations must be idempotent — wrap DDL in `IF NOT EXISTS` / exception handlers where possible
- Never use `USING (true)` on tables containing PII without an explicit security review comment
- The `user_has_project_access()` SECURITY DEFINER function is the approved pattern for multi-table RLS — use it
- Storage bucket `coordination-documents` — signed URLs only (1hr expiry) — no public URLs

---

## Known Architecture Decisions

- **Stats duplication**: Dashboard stats are computed both server-side (`getDashboardStats`) and
  client-side in `useCoordinationDashboard`. This is intentional for offline-first feel.
  If the active/overdue definition changes, update BOTH locations.
- **No service-role singleton reset**: `_serviceClient` is a module-level singleton.
  In test environments, call the client factory directly to avoid state leakage between tests.
- **Magic link expiry**: 7 days, not configurable per-call. Change `MAGIC_LINK_EXPIRY_DAYS`
  constant and re-deploy if business requirements change.
- **Retry sleep in AI pipeline**: 30-second retry sleep (`setTimeout(r, 30000)`) is intentional
  to respect Claude API rate limits. Do not remove or reduce without confirming rate limit budget.

---

## Test Coverage

Target: 30% minimum (global standard).
Current: 0% — no test files exist yet. Prioritise:
1. `magic-links.ts` — `resolveToken` expiry/revocation logic
2. `actions.ts` — `updateIssue` status transition validation
3. `security-gate.ts` — sanitizer pattern coverage
4. `ai-pipeline.ts` — fallback behaviour on Claude failure

Run: `npm test` (vitest)

---

## Commit Discipline

- Do not commit untracked migrations without testing against a local Supabase instance first
- Migrations 002 and 003 are currently untracked — commit only after verifying anon policy scope
- Prefer one migration per concern — migration 003 was correctly isolated as a fix

---

## Session Startup for this Project

1. Read this file
2. Check git status — are there untracked migration files?
3. Check `sdk/src/index.ts` — does it export `getCoordinationServiceClient`? (it must not)
4. Check `sdk/src/server/ai-pipeline.ts` — is `sanitize()` called before `buildIssueContext`?
5. State your reading plan before any edits
