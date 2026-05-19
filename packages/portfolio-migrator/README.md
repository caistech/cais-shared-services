# @caistech/portfolio-migrator

Dry-run-first CLI that backfills existing products onto the
[Corporate AI Solutions Portfolio Standard](../../foundation/PORTFOLIO_STANDARD.md).

> The migrator never modifies a working tree without `--yes`, and never
> pushes to a remote. It is a planner — it reads the target repo, writes
> proposed-change artefacts to `docs/`, and surfaces what's left for
> human review. Commits and pushes are yours.

## Install

```bash
# In a consumer repo with .npmrc already configured for @caistech:
npm install --save-dev @caistech/portfolio-migrator

# Or run without installing:
npx @caistech/portfolio-migrator inspect
```

## The four subcommands

| Command | What it does | Writes to disk? |
|---|---|---|
| `inspect` | Reads the target repo and writes a Portfolio Standard gap report | `docs/MIGRATION_REPORT_<date>.{md,json}` |
| `plan` | Inspects + synthesises the proposed-PR (patches + notes) | `docs/MIGRATION_PLAN_<date>.{md,patch,json}` |
| `apply` | Executes a previously-generated plan; `--yes` required to actually write | Whatever the plan specifies |
| `status` | One-screen compliance scorecard, CI-friendly | Nothing — stdout only |

## Workflow

```bash
# 1) Discover gaps. No writes outside docs/.
npx portfolio-migrator inspect --repo /path/to/your-product

# 2) Generate the plan. Still no writes outside docs/.
npx portfolio-migrator plan --repo /path/to/your-product

# 3) READ docs/MIGRATION_PLAN_<date>.md.
#    Decide if you want what the migrator proposes.

# 4) Apply patch steps. Note steps stay manual.
npx portfolio-migrator apply --repo /path/to/your-product \
  --plan /path/to/your-product/docs/MIGRATION_PLAN_<date>.json \
  --yes

# 5) Verify.
npx portfolio-migrator status --repo /path/to/your-product

# 6) Commit + open PR yourself. The migrator never touches git.
git diff
git checkout -b chore/portfolio-standard-migration
git add .
git commit -m "chore: migrate to Portfolio Standard v1.0"
gh pr create --draft
```

## What v0.1 migrates

| Migration | Rule | Kind | What happens |
|---|---|---|---|
| `install-portfolio-gate` | R13 | patch | Adds `@caistech/portfolio-gate ^0.2.0` to devDependencies |
| `upgrade-corporate-components` | R1 | patch | Bumps `@caistech/corporate-components` to `^0.2.0` (where AuthForm shipped) |
| `scaffold-routes-config` | R13 | patch | Creates `routes.config.json` with the default 9-route list |
| `scaffold-auth-config` | R1 | patch | Creates `auth.config.json` with the four-leg path map |
| `scaffold-gate-workflow` | R13 | patch | Creates `.github/workflows/gate.yml` from the template |
| `vendor-identity-scrub` | R11 | note | Reports occurrences of operator handle / mobile / Calendly / email — too judgment-heavy to auto-rewrite |
| `vendor-identity-env-defaults` | R11 | patch | Appends `NEXT_PUBLIC_VENDOR_*` placeholders to `.env.example` |
| `add-resend-from-email-example` | R6 | patch | Appends `RESEND_FROM_EMAIL=...` to `.env.example` if missing |
| `swap-auth-pages-to-authform` | R1 | note | Lists files containing raw `<input type="password">` and provides a canonical AuthForm replacement to adapt |
| `add-explanatory-header-note` | R3 | note | Lists `page.tsx` files missing `<ExplanatoryHeader/>` |
| `rls-using-true-note` | R9 | note | Lists migrations containing `USING (true)` — replacement column depends on tenancy model |

### Patch vs note

**Patch steps** are mechanical — drop in a file, bump a version, append a
block. The migrator applies these when you pass `--yes`.

**Note steps** require human judgment — replacing raw auth pages depends on
your existing branding / redirect URLs / analytics hooks; replacing
`USING (true)` policies depends on which column owns the row. The migrator
emits these for review and never auto-applies.

## Roadmap

v0.2+ will add:

- **TrustPanel migration (R15)** — when `<TrustPanel/>` ships in
  `@caistech/corporate-components`, scaffold the counterparty disclosure
  block on REGULATED-tier products.
- **ExplanatoryHeader auto-add** — when `<ExplanatoryHeader/>` ships in
  `@caistech/corporate-components`, generate per-page header content from
  heuristics (page slug + route hierarchy) and surface as a patch.
- **RLS auto-fix** — read the table definition, infer the owner column,
  generate the replacement migration. Currently note-only.
- **Supabase redirect allowlist scrub (R16)** — script-driven; requires
  Supabase Management API token at apply time.
- **Vercel custom-domain wiring (R17)** — wire `<product>.corporateaisolutions.com`
  for REGULATED + REVENUE tier.
- **errorResponse() refactor (R10)** — find `error.message` patterns in
  API routes and propose the sanitised replacement.
- **Sample artefact scaffold (R14)** — drop `app/sample/page.tsx` and the
  homepage link.
- **Public-API audit (R12)** — find data-bearing endpoints without auth
  middleware and propose the `getUser()` guard.

## Migration order (per Portfolio Standard)

Per the Portfolio Standard tier framework, migrate in this order:

1. **REGULATED first** — MMC Build, F2K-Checkpoint, F2K-Fund-Tokenisation,
   NDISSDA-Automate, R&D Tax, Platform Trust, Story-Verse, AIFTIS-Demo.
2. **REVENUE / CASE STUDY second** — InvestorPilot, DealFindrs,
   EasyClaudeCode, StorefrontMCP, LaunchReady, MMC Build webapp.
3. **STANDARD last** — everything else.

For the first run of v0.1, start with a small surface area. **LessonsLearned**
is the recommended pilot — single-purpose, no auth complexity, fast feedback
loop.

## Custom configuration

For products that diverge from the default route list / auth paths /
vendor patterns, drop a `migration.config.ts` at the repo root:

```ts
// migration.config.ts
import type { MigrationConfig } from '@caistech/portfolio-migrator';

const config: MigrationConfig = {
  routes: [
    { path: '/' },
    { path: '/dashboard' },
    { path: '/projects' },
    // …
  ],
  auth: {
    loginPath: '/sign-in',
    signupPath: '/sign-up',
    // …
  },
};

export default config;
```

> Note: v0.1 does not yet read `migration.config.ts` — the defaults work
> for every product currently in the portfolio. v0.2 will add this hook.

## License

PRIVATE — Corporate AI Solutions.
