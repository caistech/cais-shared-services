# Remote Validation + QA-Account Centralization — Handoff Brief

**For:** a cais-shared-services working session.
**Date:** 2026-06-15.
**Why this exists:** SayFix is the portfolio's **remote maintenance engine** — a user logs a ticket
→ the Claude assistant fixes it on a client-hosted runner → and *by dictate* the naive-tester + the
whole VT_ battery must run over that fix to validate it. **If the fix is remote, the validation must
be remote too.** So every credential must live in GitHub Actions secrets (not just on the operator's
machine), every tester must run in CI, and the QA accounts must be central. This brief finishes that
substrate so sayfix (and every product) validates green end-to-end, remotely, with no local machine.

---

## Canonical sources of truth (already on disk, local-only — must reach the cloud)
- **`.secrets/qa-secrets.json`** — the canonical §9.5 QA accounts:
  `QA_TEST_ADMIN_EMAIL=dennis+qaadmin@factory2key.com.au`, `QA_TEST_ADMIN_PASSWORD`,
  `QA_TEST_USER_EMAIL=dennis@factory2key.com.au`, `QA_TEST_USER_PASSWORD`.
- **`~/.supabase-token`** — portfolio-wide Supabase Management PAT (`sbp_…`, covers all 44 projects,
  incl. sayfix `vwvfmsuquohlgxcpzdjo` in org `slswtirckvqfcqrlgzgi`).
- **`~/.vercel-token`** — Vercel token.
- **`portfolio-manifest.yaml`** `shared.admin_users` / `shared.test_user` — RECONCILED to §9.5
  2026-06-19 (`dennis+qaadmin@factory2key.com.au` / `dennis@factory2key.com.au`). The
  test-accounts.config template + new-product default + config-fixer ADMIN_EMAILS now all map to the
  same canonical accounts, so the admin-agent is allowlisted everywhere (was the VT_A1 root cause).

---

## DONE this session (already committed/pushed to cais-shared-services main)
- `d0b64ea` design-build.yml: resolve repo owner (caistech→dennissolver), repos moved org.
- `6da3dc7` validation-run.yml: same owner fix for the repo-probe checkout.
- `d88d0c8` **VT_B (user-tester) + VT_C (auth-tester)** built + wired; `#35` probe false-positive
  fixed (stopped reading `ADMIN_EMAILS` as a sender).
- `b2b1fb6` **VT_D scaffold checks** in validation-probe (profiles table/trigger/RLS, ADMIN_EMAILS,
  email infra; D2/D3 na→cross-ref VT_B).
- `6c10bdc` `#39` (no committed secrets, repo-grep) + `#40` (na — Vercel API, via rescore).
- `883a0dc` Auto-provision step in validation-run (runs `provision-qa-accounts.mjs` before the
  testers) + `SUPABASE_MANAGEMENT_TOKEN` added to the job env.
- `6cc7ef1` validation-run + admin/user-tester read the canonical `QA_TEST_*` names (legacy fallback).
- **GitHub secrets SET on `caistech/cais-shared-services`:** `SUPABASE_MANAGEMENT_TOKEN`,
  `QA_TEST_ADMIN_EMAIL`, `QA_TEST_ADMIN_PASSWORD`, `QA_TEST_USER_EMAIL`, `QA_TEST_USER_PASSWORD`
  (piped from `.secrets/qa-secrets.json`).

**Net:** every gate now has a producer; the dual-portal battery is complete. VT_C verified PASS
on sayfix; VT_B ran but recorded `na` ("user-agent login failed") because the agent accounts aren't
provisioned on sayfix yet — which is the work below.

---

## TODO in this session (the remaining knots)

### 1. Fix `provision-qa-accounts.mjs` to read the CANONICAL agents (not per-product config)
The blocker: line 483 *requires* a per-product `test-accounts.config.json` (sayfix has none → agents
skipped), and line 495 generates a **random** password — which would never match the
`QA_TEST_*_PASSWORD` secret the testers log in with. Fix both:

- Add a `loadCanonicalAgents()` (prefer the `QA_TEST_*` env — set in CI from the secrets above — else
  read `.secrets/qa-secrets.json`):
  ```js
  function loadCanonicalAgents() {
    const e = process.env;
    if (e.QA_TEST_ADMIN_EMAIL && e.QA_TEST_USER_EMAIL)
      return { adminEmail: e.QA_TEST_ADMIN_EMAIL, adminPw: e.QA_TEST_ADMIN_PASSWORD,
               userEmail: e.QA_TEST_USER_EMAIL,  userPw: e.QA_TEST_USER_PASSWORD };
    try {
      const f = join(dirname(fileURLToPath(import.meta.url)), "..", ".secrets", "qa-secrets.json");
      if (existsSync(f)) { const d = JSON.parse(readFileSync(f, "utf-8"));
        if (d.QA_TEST_ADMIN_EMAIL && d.QA_TEST_USER_EMAIL)
          return { adminEmail: d.QA_TEST_ADMIN_EMAIL, adminPw: d.QA_TEST_ADMIN_PASSWORD,
                   userEmail: d.QA_TEST_USER_EMAIL,  userPw: d.QA_TEST_USER_PASSWORD }; }
    } catch {}
    return null;
  }
  ```
- Replace the `taConfig` agent block (~481–490): resolve `adminEmail/adminPw/userEmail/userPw` from
  `loadCanonicalAgents()` (fall back to `taConfig.adminAgentEmail/userAgentEmail`), set the agents'
  `emailVar/pwVar` to `QA_TEST_ADMIN_*` / `QA_TEST_USER_*`, and carry each agent's `pw`.
- In the create loop (~495): `const pw = agent.pw || generatePassword();` — use the **canonical**
  password when present so the account matches the secret.
- Update the ADMIN_EMAILS build (~530) `taConfig.adminAgentEmail` → the resolved `adminEmail`.

### 2. Provision the agents on sayfix (then `--all`)
After #1: `node scripts/provision-qa-accounts.mjs --slug sayfix` (the central token works once the
**local env override is cleared** — see #5). Then `--all` for the portfolio. Idempotent.

### 3. Add the admin-agent to each product's `ADMIN_EMAILS`
sayfix's `ADMIN_EMAILS` is operators-only (`dennis@corporateaisolutions.com,mcmdennis@gmail.com`).
VT_A needs `dennis+qaadmin@factory2key.com.au` in it (and the user-agent must NOT be — VT_B2). The
script's `--vercel` path handles this at scaffold but 409s on existing products → update sayfix's
Vercel env `ADMIN_EMAILS` directly (use `~/.vercel-token`), or via the config-fixer VT_D1 lane.

### 4. Centralize the remaining tokens + sync QA secrets portfolio-wide
- `VERCEL_TOKEN` as a GitHub secret if the Vercel-env (#40) checks need it remotely.
- `node scripts/sync-qa-secrets.mjs` (reads `.secrets/qa-secrets.json`) to push `QA_TEST_*` to the
  **per-product** repos too (I set them on cais-shared-services only; products that run their own CI
  need them). Confirm it reads `.secrets/qa-secrets.json`.

### 5. Clear the local env override (caused the 401)
The shell had a stale `SUPABASE_MANAGEMENT_TOKEN` / `SUPABASE_ACCESS_TOKEN` that overrode the good
`~/.supabase-token` (the provisioner prefers the env var → "JWT could not be decoded"). Unset them in
the profile, or make the script prefer the file. (Forcing the file value through env made it work.)

### 6. Reconcile the manifest account drift
`portfolio-manifest.yaml` `shared.admin_users` should reflect §9.5 (the two operators + the
admin-agent `dennis+qaadmin@factory2key.com.au`), and `shared.test_user` the user-agent — so the
provisioner + sync agree with `.secrets/qa-secrets.json` and the `QA_TEST_*` names.

---

## After the above: prove it green
Re-run the validation bound to the current build (or enqueue the Conductor), then confirm VT_A/VT_B
record real pass/fail (not `na`) and `gate1_ready` flips. The pipeline-side `#40` headless rescore +
the freshness-demotion ("(b)") are separate, on the **pipeline** repo, not here.

## Then: the remote maintenance loop (next phase)
Wire SayFix's fix-and-validate loop to trigger `validation-run.yml` (bound to the new deployment)
automatically after a client-runner fix lands — closing the ticket → remote fix → remote validation
→ verdict loop with zero local dependency.
