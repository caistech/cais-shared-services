# New-Product Creator — Spec (template-agnostic infra creation)

> **Status:** v1 IMPLEMENTED — `scripts/new-product.mjs` (single file, validated via `--dry-run`
> 2026-05-26; not yet run live end-to-end). Authored from a step-by-step config interview with
> Dennis, prompted by the SayFix provisioning (the first product created by hand because no
> generic creator existed). **Still outstanding (see §6):** (a) the `dennissolver/cais-starter`
> template repo doesn't exist yet — until it does, run with `--no-template` (bespoke) or
> `--template <repo>`; (b) the ElevenLabs step is a stub pending a `@caistech/elevenlabs-convai`
> CLI entry; (c) no live end-to-end run yet (dry-run only).
>
> **The gap this closes:** the only end-to-end "create everything" automation in the portfolio
> is `RaiseReadyTemplate/app/api/setup/stream/route.ts` — and it is **welded to the
> `raiseready-core` template** (its `create-github` step clones that one repo). It produces
> *RaiseReady children*, not arbitrary new products. `cais-shared-services` has **no**
> from-scratch creator — `onboard-new-project.sh` explicitly "DOES NOT create the Vercel
> project / Supabase project" (it only configures + registers existing ones). So a genuinely
> new engine (SayFix) had no one-button path. This spec defines the **template-agnostic
> creator** that lifts RaiseReady's `create-*` sub-routes out of the template into a reusable
> `cais-shared-services` CLI.

---

## 0. The one principle that frames everything (key model)

**Everything runs on CAIS keys at creation.** Anthropic, Resend, ElevenLabs, OpenAI — all the
operator's (CAIS) keys, so every product can be built and tested end-to-end immediately. You
cannot test on a key that doesn't exist yet.

**BYOK is a later, per-product migration** — applied *only once a product is operational* **and**
only if its lane fits BYOK (lane-4 free self-host, or a distributor self-hosting). It is never the
starting state. This reconciles the portfolio's "BYOK everywhere" language: R10/BYOK governs the
*shipped BYOK-tier* products, not the build/test phase.

Implementation hook: every key the creator declares in the manifest carries `source: cais`,
leaving a clean spot to flip to `source: byok` in that later migration.

---

## 1. Ratified configuration (the interview answers)

| Step | Decision | Notes |
|---|---|---|
| **Scaffold model** | **Generic CAIS starter template**, cloned via GitHub "generate from template" | One canonical starter repo with the portfolio DNA prewired (see §2). New engines may diverge after. |
| **Entrypoint** | **One `cais-shared-services` CLI** | Lifts RaiseReady's `create-*` sub-routes into reusable functions; runnable from any terminal, no Next app needed. |
| **GitHub** | **Private, owner `dennissolver`, name = slug** | `main` default branch + a working branch. Private protects the moat (BUSINESS_MODEL §7); public/MIT is an explicit later opt-in. |
| **Supabase** | **`ap-southeast-2`, free plan, CAIS org (`slswtirckvqfcqrlgzgi`), name = slug** | CLI takes `--region` / `--plan` overrides for residency/load needs. |
| **Vercel** | **CAIS team (`team_hwN7IFtd2Fo3DCj9C67ZwI1t`), git-linked, `vercel.app` until Gate-1** | No custom domain until Gate-2 (domain spend is Gate-gated). `--team` override (e.g. MMC Build). |
| **Auth callback** | **Bare `/auth/callback`** is the portfolio-wide standard | Starter ships `app/auth/callback/route.ts` + the redirect allowlist wired to it. Supersedes the historical `/api/auth/callback` default for new builds. |
| **ElevenLabs** | **Provision on create, on the CAIS key**, via `@caistech/elevenlabs-convai` | Idempotent provision + workspace webhook bind + allowlist; wired to the starter's chrome voice widget. Per-product prompt/use-case tuned after. Re-points to a customer key in a later BYOK migration. |
| **Env + manifest** | **Auto-declare the full CAIS key set + `from_supabase` bindings** | Complete `portfolio-manifest.yaml` entry so `harvest-secrets` + `portfolio-env-sync` work with zero hand-editing (fixes the "nothing declared" gap SayFix hit). Secrets `sensitive`/prod+preview; `NEXT_PUBLIC` `plain`; per-key `source: cais`. |
| **Starter DNA migration** | **Full tenancy + auth spine** | organisations/members (or tenants/users) + `profiles` + `on_auth_user_created` + RLS on everything + auth-page pattern. Products add domain tables on top. |
| **Git behaviour** | **Commit + push branch, stop before PR** | Initial commit, push `main` + working branch; no PR/merge (you review + `/ship`). |
| **Portfolio registration** | **Auto-register, do NOT auto-commit the shared repo** | Append manifest + register platform-trust automatically, but leave the `cais-shared-services` changes UNCOMMITTED for review (shared repo, all-product blast radius). |
| **IDE / PyCharm** | **No IDE automation — print the path** | Clone into `~/PycharmProjects/<slug>` and print it; you open PyCharm yourself. Keeps the creator OS/IDE-agnostic. `.idea` stays gitignored. |

---

## 2. The CAIS starter template (prerequisite to build first)

A canonical private repo (e.g. `dennissolver/cais-starter`) the creator clones via GitHub's
generate-from-template. It ships the portfolio DNA so every product is standards-compliant from
line 1 (per `PRODUCT_STANDARDS.md`):

- Next.js (App Router) + TS + Tailwind, `src/`, real metadata (no "Create Next App").
- **Auth pages** (login/signup/forgot/reset) with the shared `PasswordInput` visibility toggle + magic-link; **`app/auth/callback/route.ts`** (bare path) + middleware allowlist.
- **Persistent left-nav + `/settings`** (lean) + Sign Out (authenticated layout).
- **Chrome voice widget** (`@caistech/elevenlabs-convai/react`), agent id via `voice.config.ts`.
- **Supabase** `client/server/admin` helpers; **base migration**: tenancy + `profiles` + `on_auth_user_created` + RLS (§1 Starter DNA).
- Explanatory-header layout primitive; responsive shell; `.npmrc` for `@caistech`.
- `feature-manifests/` dir; `.env.local.example`; `PROJECT_STATUS.md` stub.

> Until this template exists, the creator can run against any repo passed as `--template`, or fall
> back to `create-next-app` + the DNA modules (the SayFix path).

---

## 3. Proposed CLI

```
node scripts/new-product.mjs <slug> \
  [--template dennissolver/cais-starter] \
  [--region ap-southeast-2] [--plan free] \
  [--team team_hwN7IFtd2Fo3DCj9C67ZwI1t] \
  [--no-voice] [--public] [--dry-run]
```

**Steps (each idempotent; `--dry-run` prints the plan):**
1. **GitHub** — create `dennissolver/<slug>` private from `--template` (generate endpoint) — *lift from* `RaiseReadyTemplate/.../create-github`.
2. **Local clone** — into `~/PycharmProjects/<slug>`; print the path.
3. **Supabase** — `supabase projects create <slug> --org-id <CAIS> --region <region>` (Management API), poll `ACTIVE_HEALTHY`, capture ref + keys → write `.env.local` (never print secrets) — *lift from* `create-supabase`. Generate DB password (base64url, URL-safe for the pooler).
4. **Migrate** — `supabase link` (when healthy → IPv4) + `supabase db push` **via the session pooler** (`aws-?-<region>.pooler.supabase.com:5432`) because home networks lack IPv6. Verify seed via PostgREST.
5. **Vercel** — create under `--team`, framework nextjs, git-linked to the repo (`v9/projects`) — *lift from* `create-vercel`. Push env: `NEXT_PUBLIC_*` `plain`, secrets `sensitive`, target `production,preview` (never `development`) per the Vercel sensitive rule.
6. **Auth** — `onboard-new-project.sh <slug> <slug> <ref>` with `AUTH_CALLBACK_PATH=/auth/callback`: site URL + redirect allowlist + Resend SMTP + branded email templates (use the proper display-name casing, not the slug).
7. **ElevenLabs** — provision the agent on the CAIS key via `@caistech/elevenlabs-convai` (unless `--no-voice`); wire `voice.config.ts`.
8. **Secrets** — harvest the shared CAIS keys (ANTHROPIC/RESEND/OPENAI/ELEVENLABS) → `.env.local` + Vercel; propagate `GITHUB_PACKAGES_TOKEN` (`set-caistech-token.sh`).
9. **Register** — complete manifest entry (bindings + `source: cais` keys) + platform-trust (`register-platform-trust-projects.mjs`). Leave `cais-shared-services` changes UNCOMMITTED.
10. **Git** — initial commit in the new repo, push `main` + working branch, **stop before PR**.
11. **Report** — print the local path, URLs, refs, and the remaining manual steps (review + commit the shared-repo diff; `/ship` when ready).

**Tokens** (already on disk): `~/.supabase-token`, `~/.vercel-token`. Needs: `SUPABASE_ORG_ID` (or read CAIS default `slswtirckvqfcqrlgzgi`), `GITHUB_PACKAGES_TOKEN` (currently no `~/.github-token`), `ELEVENLABS_API_KEY`.

---

## 4. What to lift from RaiseReady (decouple from `raiseready-core`)

`RaiseReadyTemplate/app/api/setup/`: `create-supabase`, `create-github` (parameterise the
template repo, default `--template`), `create-vercel`, `create-elevenlabs`,
`configure-supabase-auth`. Convert the Next route handlers into plain async functions in a
`cais-shared-services` module (`packages/product-creator/` or `scripts/lib/`) so they run from the
CLI without a Next server. Reuse the existing `onboard-new-project.sh`, `harvest-secrets.mjs`,
`register-platform-trust-projects.mjs`, `portfolio-env-sync` as the post-create steps.

---

## 5. Known portfolio issues surfaced during SayFix provisioning

- **Pre-existing manifest error (not SayFix):** `community-question-responder` inherits
  `RESEND_API_KEY` but it's not in `shared` — the manifest audit flags it. Fix the CQR entry
  separately.
- **No `~/.github-token`** on disk — `GITHUB_PACKAGES_TOKEN` propagation step needs it.
- **IPv6:** `supabase db push` direct host is IPv6-only; home network needs the IPv4 **session
  pooler** (creator must default to the pooler, not the direct host).
