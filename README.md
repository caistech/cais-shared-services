# cais-shared-services

Shared services hub for the Corporate AI Solutions portfolio. npm workspace monorepo of `@caistech/*` packages plus portfolio-wide operational tooling.

## Packages

**Trust & security**
| Package | Purpose |
|---------|---------|
| `@caistech/platform-trust-middleware` | Project-scoped audit, eval, security scan, metering, permissions middleware |
| `@caistech/security-gate` | Pre-action permission checks against platform-trust |
| `@caistech/agent-trust-score` | Agent reliability scoring from eval-run history |
| `@caistech/api-key-auth` | Stripe-customer-keyed API auth for hub-published APIs |
| `@caistech/security` | Legacy JS: permissions, PII classifier, audit logger, consent, retention |

**AI & models**
| Package | Purpose |
|---------|---------|
| `@caistech/openrouter-client` | OpenRouter LLM client with retry + streaming |
| `@caistech/agents` | Legacy JS: agent provisioning, prompt templates, secure gateway |

**Voice & language**
| Package | Purpose |
|---------|---------|
| `@caistech/elevenlabs-convai` | Conversational AI — agent CRUD, webhooks, persistent memory |
| `@caistech/elevenlabs-voice` | TTS + STT wrappers for one-shot voice operations |
| `@caistech/language-config` | 80+ language definitions, TTS provider mapping |
| `@caistech/stt-noise-filter` | Ambient-noise removal from STT transcriptions |

**Data & geography**
| Package | Purpose |
|---------|---------|
| `@caistech/abn-lookup` | Australian Business Number lookup (ABR API) |
| `@caistech/mapbox` | Mapbox geocoding + routing client |
| `@caistech/extractors` | Structured-data extraction primitives |
| `@caistech/db-schema` | Shared Postgres schema fragments |

**Domain SDKs**
| Package | Purpose |
|---------|---------|
| `@caistech/property-services-sdk` | Property domain helpers |
| `@caistech/coordination-sdk` | Multi-agent coordination primitives |

**Agent infrastructure**
| Package | Purpose |
|---------|---------|
| `@caistech/nudge-core` | Cross-channel nudge orchestration |
| `@caistech/ghl-client` | GoHighLevel CRM client |

**UI & operations**
| Package | Purpose |
|---------|---------|
| `@caistech/corporate-components` | Shared React: CorporateHeader, Footer, ABN form |
| `@caistech/portfolio-env-sync` | Manifest-driven Vercel env audit + apply (this hub's operational tool) |
| `@caistech/report-generator` | Markdown → branded PDF renderer |

## Portfolio operations

`portfolio-manifest.yaml` at the hub root is the **single source of truth** for what env vars must exist on each Vercel deploy target across the 15 actively-managed projects, plus the resolution sources for shared secrets.

### Audit + apply

```bash
# Audit all projects (read-only)
export VERCEL_TOKEN=$(cat ~/.vercel-token)
node packages/portfolio-env-sync/dist/index.js --manifest portfolio-manifest.yaml

# Apply: create missing keys, PATCH partial-target keys
node packages/portfolio-env-sync/dist/index.js --manifest portfolio-manifest.yaml --apply

# Single project
node packages/portfolio-env-sync/dist/index.js --manifest portfolio-manifest.yaml --repo hair-stylist-ai --apply
```

`--apply` resolves three kinds of bindings:
- Literal `value: "..."` — pushed verbatim
- `from_supabase: { project_ref, field }` — resolved via Supabase Management API
- `ref: "$secret:NAME"` — looked up in the manifest's top-level `secrets:` block

Bindings without a resolvable value are reported as `skipped` with a clear reason; the apply continues.

### Onboarding a new project

```bash
# 1. Append project to manifest + bash script lists; verify Vercel project exists
bash scripts/onboard-new-project.sh <github-repo> <vercel-slug> [supabase-project-ref]

# 2. Harvest shared keys (OPENAI/ANTHROPIC/RESEND) from existing siblings
node scripts/harvest-secrets.mjs

# 3. Register with platform-trust to provision PROJECT_ID UUID
node scripts/register-platform-trust-projects.mjs

# 4. Resolve $secret refs + push to Vercel
node packages/portfolio-env-sync/dist/index.js --manifest portfolio-manifest.yaml --apply
```

Each step is idempotent — re-running on an already-onboarded project is safe.

### Secrets resolution

The manifest's `secrets:` block maps `$secret:NAME` refs to resolution sources. Currently supports `from_supabase`:

```yaml
secrets:
  platform_trust_service_key:
    from_supabase:
      project_ref: "ggwveltavnvvscgqekhy"
      field: "service_role_key"
```

Required tokens (file fallbacks at `~/.<name>-token`):
- `VERCEL_TOKEN` — generate at https://vercel.com/account/tokens
- `SUPABASE_ACCESS_TOKEN` — generate at https://supabase.com/dashboard/account/tokens (`projects:read` scope)
- `GITHUB_PACKAGES_TOKEN` — for npm install of `@caistech/*` deps

## Consuming from a project

Packages publish to **GitHub Packages** (private npm registry). Install is a standard `pnpm add` / `npm install` once the registry is configured.

### One-time setup per consumer repo

1. Create a GitHub Personal Access Token with `read:packages` scope: https://github.com/settings/tokens
2. Add `.npmrc` to the consumer repo root (do NOT commit a token — use env var):

   ```
   @caistech:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
   ```

3. Export the token locally: `export GITHUB_PACKAGES_TOKEN=ghp_...`
4. In CI (Vercel, GitHub Actions, etc.) set `GITHUB_PACKAGES_TOKEN` as a secret env var.

### Installing

```bash
pnpm add @caistech/elevenlabs-convai
pnpm add @caistech/openrouter-client
```

Then import as usual:

```ts
import { createAgent, defaultVoiceModelFor } from '@caistech/elevenlabs-convai';
```

### Publishing a new version

- Bump the relevant `packages/<name>/package.json` version (stay on `0.x.y` while pre-1.0 — break freely).
- Commit, push, then tag: `git tag v0.1.1 && git push origin v0.1.1`
- GitHub Actions publishes all workspaces on tag push (see `.github/workflows/publish.yml`).

## Structure

```
cais-shared-services/
├── packages/                       # @caistech/* package sources
├── scripts/                        # Portfolio operations (onboard, harvest, register, redeploy, republish)
├── foundation/                     # Brand + GTM substrate (loaded on demand by content skills)
├── portfolio-manifest.yaml         # Single source of truth: env vars per project
├── package.json                    # Workspace root (packages/*)
└── tsconfig.base.json              # Shared TypeScript config
```

## Adding a new package

1. Create `packages/<name>/` with `package.json` (name: `@caistech/<name>`) and `src/`
2. The workspace already globs `packages/*` — no root edit needed
3. For TypeScript packages, extend `tsconfig.base.json` and produce `dist/`
4. Bump version, commit, run `npm publish --userconfig <temp-npmrc>` from the package dir (mirrors `scripts/republish-all.sh`)

## Principles

- TypeScript strict for new packages; legacy plain JS where pre-existing
- Compiled `dist/` is what's published — consumers don't import source
- Manifest-driven operations: changes to `portfolio-manifest.yaml` are the canonical record of what should exist; the apply step makes it so
- Idempotent everywhere: every script can be re-run safely
