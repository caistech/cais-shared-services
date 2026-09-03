# scripts/agents — CI-native validation agents (LLD)

Shared driver: `lib.mjs` (Playwright drive + vision verdicts + gate-check recording).
Consumers: `naive-tester.mjs`, `admin-tester.mjs`, `auth-tester.mjs`, `user-tester.mjs`,
`voice-auditor.mjs`, `promise-judge.mjs` — all import from `lib.mjs`.

## Entry points

| Script | Command |
|---|---|
| naive-tester | `node naive-tester.mjs --slug <slug> --url <url> [--deployment <id>] [--shots <dir>] [--mock]` |
| others | same lib seam; see each script's header |

## Environment

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | unless local judge or `--mock` | paid vision judge |
| `AGENT_VISION_MODEL` | no | override Anthropic model (default `claude-sonnet-4-6`) |
| `LOCAL_VISION_MODEL` | no | **free mode**: route verdicts to a local model (e.g. `llava`) |
| `LOCAL_VISION_API` | no | local endpoint (default Ollama `http://localhost:11434/api/generate`) |
| `LOCAL_VISION_API_KEY` | no | **Bearer auth** for the local endpoint (required for OmniRoute/OpenAI-compatible gateways) |
| `TEST_USER_EMAIL` / `QA_USER_PASSWORD` | no | authed-surface capture |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | no | preview SSO bypass |

## Cost modes (avoid the paid Anthropic call per run)

1. **Pre-captured shots** — capture once, re-verdict offline:
   `node naive-tester.mjs --slug s --url U` (capture) → `node naive-tester.mjs --slug s --shots ./shots/`
   `.png`s in `<dir>`; filenames become labels; no browser, no login step.
2. **Local judge** — `LOCAL_VISION_MODEL=llava node naive-tester.mjs --slug s --url U`.
   Same prompt + JSON-array contract as Anthropic; parses Ollama `{response}` and
   OpenAI-compatible `{choices[]}` shapes; throws on failure (degrade-don't-fake preserved).

   For an **OmniRoute / OpenAI-compatible gateway** (authenticated), also set
   `LOCAL_VISION_API` to the gateway's `/v1/chat/completions` endpoint and
   `LOCAL_VISION_API_KEY` to the gateway key — the judge sends it as a `Bearer` token.
3. **Mock** — `--mock`: records hardcoded verdicts (codes 1–6 `pass`, rest `na`) with zero
   vision calls. For CI plumbing tests only.

## Honesty contract

A check the screenshots can't decide records `na` with a reason — never a guessed pass.
All three cost modes preserve this: local-judge failures throw (nothing recorded); mock is
explicitly synthetic evidence text.

## Dependencies

`playwright@^1.48.0` (`./package.json`), Node ≥ 18 (global fetch). Recording goes through
`../gate-check.mjs` → Supabase `readiness_results`.
