# The Auto-Fix Loop — architecture, patterns, and how to port it (e.g. to SayFix)

> **What this is.** The portable write-up of the validation→fix→re-run loop built for the
> methodology cockpit (Corporate-AI-Solutions) + the shared harness (cais-shared-services), so the
> *same* self/auto-fix machinery can be dropped onto another product — specifically **SayFix**, to
> turn its bug-finders into an autonomous fix loop. Read this before copying pieces across.
>
> **Last updated:** 2026-06-08.

---

## 0. The loop in one picture

```
  FIND ─────────────► INGEST ───────► SCORE/ROUTE ───────► FIX ───────────► VERIFY ──► (loop)
  producers           one seam        a finding gets       3 lanes          re-run the
  surface findings    (record API)    a fixer lane         resolve it       producers,
  (tests/probes/                      + a status                            verdicts move
   agents)
```

The whole thing is: **a finding never dies in limbo.** It ends **fixed**, **must-fix** (real, shown
red), **needs-you** (machine can't — surfaced with instructions), or **waived** (logged operator
choice). That invariant — the **golden rule** — is what makes an auto-fix loop trustworthy instead
of a fake-green generator.

---

## 1. The six components (and the files that implement them)

| # | Component | Job | In this codebase |
|---|---|---|---|
| 1 | **Producers** | Generate findings against a live target | headless probes (`survey`, `auto-probes`), repo greps (`validation-probe.mjs`), CI-native browser agents (`scripts/agents/{naive-tester,voice-auditor,admin-tester}.mjs`) |
| 2 | **Ingest seam** | ONE function every producer records through | `scripts/gate-check.mjs` → `recordReadiness()` / `record-readiness` CLI → a results table |
| 3 | **Scorer** | Pure function: findings → a transparent score + per-check state | `src/lib/methodology/score.ts` (`scoreCard`) |
| 4 | **Fixer-lane router** | Each finding carries *who fixes it and how* | `readiness_criteria.fixer` column + `gate-readiness/fixer-lanes.json` |
| 5 | **The three fixers** | Actually resolve findings | **code**→`design-build.yml` (builder) · **config**→`scripts/config-fixer.mjs` · **operator-input**→surfaced on the card |
| 6 | **Dispatch + UI** | Operator triggers a fix; results render | cockpit routes `…/design-build/kickoff`, `…/config-fix`, `…/run-full-validation` + the findings card (`ValidationFindings.tsx`) |

---

## 2. The non-negotiable patterns (these are why it works — copy these, not just the code)

1. **Golden rule — nothing fails silently.** Every finding resolves to fixed / must-fix /
   needs-you / waived. A machine that can't fix something records a **`needs-you` with explicit
   instructions**, never a silent skip and never a fake pass.
2. **Degrade-don't-fake.** A producer that can't decide records `na`/`needs-you` with the *reason*,
   not a guessed verdict. (We caught a real fake-green where a child script exited 0 with
   "Errors: 4" — the wrapper now inspects output, not just the exit code.)
3. **One ingest seam.** Every producer — headless, repo, browser-agent — writes through the *same*
   record function. New producers are trivial; the scorer/UI never change.
4. **Pure scorer.** Score is a pure function over (criteria, features, latest verdicts). The route
   fetches; the function computes. Easy to test, identical everywhere it's read.
5. **Lane routing.** Every finding declares its fixer lane (code/config/operator-input). The UI
   groups by lane and sends each to the right fixer. Don't send a config problem to the code
   builder.
6. **Idempotent + dry-run→apply.** Every config remediation is safe to re-run and plans before it
   mutates. Never a silent destructive op; verify the target ref/project FIRST and print it.
7. **Bind verdicts to the live deployment.** A pass is bound to the deployment id production is
   *actually serving* — a later deploy invalidates a stale pass (catches env-only regressions).
8. **Cred resolution that works in the cloud.** Resolve a product's secrets from where they live:
   product `.env.local` locally; **`vercel env pull`-style** pull of PLAIN vars + the **Supabase
   Management API** for the live service key in CI. Sensitive vars are non-readable by design — get
   those from a workspace secret or surface needs-you.
9. **Self-diagnosing agents.** On failure, an agent logs what it *saw* (field counts, button labels,
   error text), so the next iteration knows WHY instead of guessing.
10. **Upsert + freshness.** Recording the same check twice UPSERTs the latest verdict (no 409s); the
    scorer takes the newest per code.

---

## 3. The gotchas we hit (so the next port skips them)

- **`NEXT_PUBLIC_*` is baked at BUILD time.** Changing it in Vercel needs a **redeploy** to reach
  the live client — an env change alone doesn't.
- **A `'use client'` component can't read server-only env** (`process.env.FOO` is `undefined` in the
  browser unless `NEXT_PUBLIC_`). deal-findrs's admin login read `ADMIN_EMAILS` client-side → fell
  back to a default → signed out valid admins. (Enforce authz **server-side** in middleware; don't
  duplicate it client-side.)
- **Disabled legacy Supabase keys.** A project migrated to `sb_publishable_`/`sb_secret_` keys has
  its old anon/service JWTs disabled. Tooling reading the old keys 401s on the *key*, masking
  whether creds are valid. Put the new keys in BOTH `.env.local` and Vercel (correct var names) +
  redeploy.
- **Login forms defeat naive fills.** Tabbed/dual-auth pages render hidden fields; target `:visible`
  only, submit via **Enter** then a button fallback, treat an **auth cookie** as success, and
  **poll** (slow server-side auth + hard-redirect flows outlast a fixed wait).
- **Builder/model billing.** The code builder runs on a model provider with its own balance —
  "agent produced no changes" in ~2s = out of credit. Prefer a provider whose key you already hold
  (e.g. Anthropic-direct) so a dead balance can't silently stall a build.
- **CI runner has no product `.env.local`** (git-ignored). Resolve product secrets from Vercel/the
  Management API/workspace secrets, or the agent walks unauthed and honestly degrades.
- **One shared QA-account set, provisioned everywhere.** The CI testers use ONE credential set;
  every product must have those accounts (manifest `shared:` + `provision-qa-accounts.mjs`), or
  per-product logins fail.

---

## 4. Porting to SayFix — auto-fix for bug-finders

SayFix already does step 1 (FIND): its widget + testers capture bug tickets (the SayFix `tickets`
table, `fix_attempts` column, `@caistech/sayfix-embed`). The loop above turns those tickets into an
autonomous fix loop. Map each component:

| Loop component | SayFix equivalent to build |
|---|---|
| **Producers (FIND)** | Already there: the SayFix widget + reporters create tickets. (Optionally add the CI browser-agents as a producer that *files* tickets.) |
| **Ingest seam** | A single `recordTicket()` / status-update function every reporter writes through. Mirror `gate-check.mjs`. |
| **Scorer/state** | Per-ticket status: `open / fixing / fixed / needs-you / wont-fix(waived)`. The golden rule applies per ticket. |
| **Fixer-lane router** | Triage each ticket to a lane: **code** (a repo bug → the builder), **config** (infra/env), **operator-input** (needs a human value/decision). Store `fixer` on the ticket. |
| **The fixers** | **code** → dispatch the SAME `design-build`-style builder on the *affected product repo* with the ticket (repro + stack + bug-knowledge match) as the binding work order → it opens a PR. **config** → reuse `config-fixer.mjs`. **operator-input** → surface on the ticket. |
| **Verify** | Re-run the producer that found it (or a targeted repro) against the new deploy; only then mark `fixed`. Bind to the deployment. |
| **Dispatch + UI** | A "Fix this" button per ticket → the right lane; a "Needs you" panel; a "Won't fix" (waiver) with a logged reason. |

**Reuse directly, don't re-fork:**
- `scripts/gate-check.mjs` (record seam) · `scripts/config-fixer.mjs` (config lane) ·
  `.github/workflows/design-build.yml` (the code builder — dispatch it per ticket with the ticket as
  the work order) · `scripts/agents/*` (browser producers that can both *find* and *verify*).
- The **BUG KNOWLEDGE BASE PROTOCOL** (CLAUDE.md): the SayFix fixer MUST check
  `bug-knowledge.json` + prior `fix_attempts` before trying, and record every attempt after — this
  prevents the auto-fixer repeating failed approaches (it's the loop's memory).

**SayFix-specific must-haves (from §2/§3):**
- Every ticket ends fixed/must-fix/needs-you/won't-fix — never silently closed (golden rule).
- The builder bills a key you hold (Anthropic-direct), so a dead balance can't stall auto-fix.
- Verify the fix on the **live redeployed** build (not just "PR merged") before closing — bind to
  the deployment.
- The fixer opens a **PR, never auto-merges** — the PR is the human checkpoint; forks it couldn't
  resolve get logged into the PR body.
- `@caistech`-first: the fixer consumes the hub, never re-forks helpers.

---

## 5. Where the pieces live (canonical, for copy)

- **Ingest:** `cais-shared-services/scripts/gate-check.mjs`
- **Config fixer:** `cais-shared-services/scripts/config-fixer.mjs`
- **Browser agents (find + verify):** `cais-shared-services/scripts/agents/{lib,naive-tester,voice-auditor,admin-tester}.mjs`
- **Repo producer:** `cais-shared-services/scripts/validation-probe.mjs`
- **Code builder:** `cais-shared-services/.github/workflows/design-build.yml` (+ `validation-run.yml`, `config-fix.yml`)
- **Scorer + fixer lanes:** `Corporate-AI-Solutions/src/lib/methodology/score.ts`, `gate-readiness/fixer-lanes.json`
- **Card UI (lane grouping + waiver):** `Corporate-AI-Solutions/src/components/admin/ValidationFindings.tsx`
- **QA-account provisioning:** `cais-shared-services/scripts/provision-qa-accounts.mjs` + manifest `shared:`

The loop is provider-agnostic and product-agnostic: a producer writes a finding through one seam, a
lane routes it to a fixer, a fixer resolves it (or surfaces needs-you), and a re-run proves it. Drop
those five seams onto SayFix and its bug-finders become a self-fixing loop.
