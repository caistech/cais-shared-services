# @caistech/portfolio-gate

Portfolio Standard enforcement layer for the Corporate AI Solutions portfolio.

> Closes the gap between rules-in-text and pipeline gates that actually fail
> the deploy. The naive-tester sweep on 2026-05-19 found 17 of 28 products
> violating the auth pattern rule alone, despite it being NON-NEGOTIABLE in
> global memory. This package is the executable enforcement layer described
> in [`foundation/PORTFOLIO_STANDARD.md`](../../foundation/PORTFOLIO_STANDARD.md).

## What v0.1 ships

| Piece | Closes rule | What it does |
|---|---|---|
| `errorResponse()` | R10 | Sanitises arbitrary backend errors into `{ error, request_id }` — no `error.message` from Postgres / Stripe / Supabase ever reaches the client |
| `runRouteSmoke()` / `portfolio-gate-smoke-routes` | R13 | Curls the product's top routes against the preview deploy; fails the build on any unexpected non-2xx |
| `runAuthSmoke()` / `portfolio-gate-smoke-auth` | R1, R4 | Verifies all four auth legs (login, signup, forgot-password, magic-link) — page renders + form action doesn't 5xx |
| `templates/.github/workflows/gate.yml` | R1, R10, R13 | GitHub Action that wires typecheck + lint + build + both smoke tests on every PR + push to main |

## Install

```bash
# In a consumer repo with .npmrc already configured for @caistech (see hub README):
npm install @caistech/portfolio-gate --save-dev
```

> The package is not yet published. While in v0.1, consume via `npm link` or a
> file-relative `"file:../cais-shared-services/packages/portfolio-gate"` dep.

## Use the error helper (R10)

Drop `errorResponse()` into every `app/api/**/route.ts` catch block. Raw
`error.message` from Postgres / Stripe / Supabase MUST NOT reach the client.

```ts
// app/api/audit/route.ts
import { errorResponse } from '@caistech/portfolio-gate/errors'

export async function GET(req: Request) {
  try {
    const { data, error } = await supabase.from('audit_log').select('*')
    if (error) throw error
    return Response.json({ data })
  } catch (err) {
    return errorResponse(err) // logs full error server-side, returns { error, request_id }
  }
}
```

Status code, public message, and the logger are all overridable:

```ts
return errorResponse(err, {
  status: 502,
  publicMessage: 'Upstream provider failed',
  logger: (msg, ctx) => pino.error(ctx, msg),
})
```

## Use the route smoke test (R13)

Add a `routes.config.json` to the repo root:

```json
{
  "baseUrl": "https://my-product.vercel.app",
  "routes": [
    { "path": "/" },
    { "path": "/pricing" },
    { "path": "/login" },
    { "path": "/signup" },
    { "path": "/forgot-password" },
    { "path": "/privacy" },
    { "path": "/terms" },
    { "path": "/api/health", "expectedStatus": 200 },
    { "path": "/dashboard", "expectedStatus": 401, "requiresAuth": true }
  ]
}
```

Or a TypeScript version (loaded via dynamic import):

```ts
// routes.config.ts
import type { RouteSmokeConfig } from '@caistech/portfolio-gate/smoke/routes'

const config: RouteSmokeConfig = {
  baseUrl: process.env.PORTFOLIO_GATE_PREVIEW_URL ?? 'http://localhost:3000',
  routes: [
    { path: '/' },
    { path: '/pricing' },
    { path: '/login' },
  ],
}

export default config
```

Run it:

```bash
npx portfolio-gate-smoke-routes --config routes.config.json
# or override baseUrl from the CI preview URL:
npx portfolio-gate-smoke-routes --config routes.config.json \
  --base-url https://my-product-git-pr-123.vercel.app
```

Exit codes: `0` pass, `1` fail, `2` config error.

## Use the auth smoke test (R1, R4)

Add an `auth.config.json` to the repo root:

```json
{
  "baseUrl": "https://my-product.vercel.app",
  "loginPath": "/login",
  "signupPath": "/signup",
  "forgotPasswordPath": "/forgot-password",
  "magicLinkPath": "/login",
  "loginActionPath": "/api/auth/login",
  "signupActionPath": "/api/auth/signup",
  "forgotPasswordActionPath": "/api/auth/forgot",
  "magicLinkActionPath": "/api/auth/magic-link"
}
```

Run it:

```bash
npx portfolio-gate-smoke-auth --config auth.config.json
```

What it checks (per leg):

1. **GET the page** → must respond 2xx or 3xx. (A 4xx/5xx means the page is
   missing or broken — the route doesn't even render.)
2. **POST the action endpoint** (if `*ActionPath` is in config) with a throwaway
   probe email → must respond `< 500`. A 4xx is a PASS because that means the
   validation layer is alive; a 5xx is a FAIL because the form is exploding.

The smoke test does NOT attempt to create real accounts or send real emails.
That's an end-to-end concern. The gate here is: "do the four legs exist, and do
their handlers refuse bad input gracefully rather than 500ing?"

## Wire the CI gate

Copy `templates/.github/workflows/gate.yml` to your repo's `.github/workflows/gate.yml`:

```bash
mkdir -p .github/workflows
cp node_modules/@caistech/portfolio-gate/templates/.github/workflows/gate.yml \
   .github/workflows/gate.yml
```

The template runs typecheck + lint + build, then both smoke tests against the
URL in `vars.PORTFOLIO_GATE_PREVIEW_URL` (set via GitHub repo settings → Actions
→ Variables) or whatever you wire from your preview-deploy step.

You'll also need the `GITHUB_PACKAGES_TOKEN` secret on the repo so `@caistech/*`
packages can install.

## Rules this package enforces

| Rule | Source | Mechanism |
|---|---|---|
| **R1** — Auth pages have all four legs | [Portfolio Standard](../../foundation/PORTFOLIO_STANDARD.md#r1--auth-pages-must-implement-all-four-legs) | `runAuthSmoke()` + `gate.yml` |
| **R4** — Auth smoke-test on every memory save | [Portfolio Standard](../../foundation/PORTFOLIO_STANDARD.md#r4--every-memory-save-triggers-an-auth-smoke-test) | `runAuthSmoke()` (also fires from the `PostToolUse` hook in `~/.claude/settings.json`) |
| **R10** — No verbatim Postgres errors in API responses | [Portfolio Standard](../../foundation/PORTFOLIO_STANDARD.md#r10--no-verbatim-postgres-errors-in-api-responses--new-2026-05-19) | `errorResponse()` |
| **R13** — Route smoke test on every deploy | [Portfolio Standard](../../foundation/PORTFOLIO_STANDARD.md#r13--route-smoke-test-on-every-deploy--new-2026-05-19) | `runRouteSmoke()` + `gate.yml` |

## Roadmap

v0.2 (planned) extends enforcement to the rest of the Portfolio Standard:

- **R2 — Responsive snapshot gate.** Playwright run at 375px + 1440px against
  the preview URL; fails on horizontal-scroll, < 16px text, tap-target collisions.
- **R3 — Explanatory header presence check.** Greps every `app/**/page.tsx` for
  `<ExplanatoryHeader>` (from `@caistech/corporate-components`).
- **R9 — RLS audit.** Scans `supabase/migrations/*.sql` for `USING (true)`
  policies on data-bearing tables; fails the build.
- **R10 follow-up — Vendor-leak audit.** Greps for `error.message`,
  `pgerror.detail`, etc. in `app/api/**/*.ts` return statements (pairs with
  the runtime helper).
- **R11 — Vendor identity leak audit.** Greps committed code for personal
  identifiers (mobile, Calendly handle, personal Instagram) outside the
  marketing repo.
- **R12 — Unauth endpoint audit.** Curls every `/api/*` route anonymously on
  the preview and fails the build if any returns data without auth.
- **R14 — Sample artefact presence.** Greps for `<SampleArtefact>` import on
  the homepage of products in REGULATED + REVENUE tiers.
- **R15 — Trust panel presence on REGULATED products.** Reads tier from
  `portfolio-manifest.yaml`; fails if landing lacks `<TrustPanel>`.
- **R16 — Supabase allowlist drift audit.** Compares each project's redirect
  allowlist against the canonical hostname.
- **R17 — Vercel alias / custom domain audit.** Resolves each canonical
  hostname and asserts the right project answers.
- **Pre-commit hook bundle.** Local-only mirror of the CI gates — same
  scripts, same exit codes, same rules.

## Why this package exists

Read [`foundation/PORTFOLIO_STANDARD.md`](../../foundation/PORTFOLIO_STANDARD.md)
for the full rationale. The TL;DR:

> Across 30+ products the portfolio accumulated rules in CLAUDE.md (text) that
> depended on Claude — or Dennis — remembering them. The naive-tester sweep on
> 2026-05-19 found 17 of 28 products violated the auth pattern rule alone,
> despite it being NON-NEGOTIABLE in global memory. **Writing the rule down
> didn't enforce it.** This package is the executable enforcement.

## License

PRIVATE — Corporate AI Solutions.
