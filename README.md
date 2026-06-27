# cais-shared-services — Operator Core

> The shared substrate every product in the Corporate AI Solutions portfolio consumes
> instead of re-implementing. **44 `@caistech/*` packages** — voice, AI clients, auth,
> trust/security, compliance, enrichment, billing/metering — plus the portfolio-wide
> operational tooling that keeps ~38 products on one set of rails.

**What this proves:** the products aren't 38 one-off codebases. They're thin verticals on
one engineered substrate. This repo is the single best evidence for that architecture —
read it and you can see exactly which capabilities are built once and reused everywhere.

**Status:** Live, actively maintained · **License:** Source-available (read it; consumption
is via the private `@caistech` registry — see [License](#license)) · **Catalog:**
[`SHARED_SERVICES.md`](./SHARED_SERVICES.md)

---

## What this is (and isn't)

- **Real and in production today:** the packages listed below are published to the private
  `@caistech` GitHub Packages registry and consumed by live products. The voice stack
  (`elevenlabs-convai`), the canonical auth surface (`corporate-components`), the LLM clients
  (`ai-client`, `openrouter-client`), usage metering (`usage-meter`), Australian compliance
  (`abn-lookup`, `email-compliance`, `sanctions-screen`), and the trust middleware
  (`platform-trust-middleware`) are all wired into shipping apps — not demos.
- **Scaffolded / WIP (by design):** `@caistech/db-schema` and `@caistech/site-intelligence`
  are not yet published (no migrations dir / private WIP). They appear in `packages/` but are
  not part of the consumable surface — the [`SHARED_SERVICES.md`](./SHARED_SERVICES.md)
  catalog is the authoritative list of what's actually consumable.
- **Not in this repo (by design):** the per-product business logic, the proprietary
  match/enrichment/ETL pipelines, and the trust *scanning engine* live in their own repos.
  This hub is the **reusable substrate**, not the moat logic that sits on top of it.

## The substrate at a glance

> The complete, canonical capability catalog — every package, what it offers, and when to
> reach for it — is **[`SHARED_SERVICES.md`](./SHARED_SERVICES.md)**. The tables below are a
> human-readable subset; if they disagree, the catalog wins.

**Trust, security & compliance**
| Package | What it provides |
|---------|------------------|
| `@caistech/platform-trust-middleware` | `withTrust` wrapper: rate limiting, permission checks, audit logging, metering |
| `@caistech/security-gate` | Prompt-injection guardrails, red-team probes, kill switch for agentic systems |
| `@caistech/agent-trust-score` | Static + behavioural agent trust scanner / grader / badge |
| `@caistech/portfolio-gate` | Portfolio-standard enforcement incl. a live RLS audit against the running DB |
| `@caistech/email-compliance` | Australian Spam Act 2003 footer + `assertCompliant()` send-path guard |
| `@caistech/sanctions-screen` | Multi-list sanctions screening (OFAC, UN, AU DFAT, UK, EU) |
| `@caistech/api-key-auth` | B2B public-API auth: opaque keys, quota, rate-limit headers, Stripe billing |

**AI, models & extraction**
| Package | What it provides |
|---------|------------------|
| `@caistech/ai-client` | Consistent Anthropic + OpenRouter client init across the portfolio |
| `@caistech/openrouter-client` | OpenRouter LLM client with retry, streaming, auto usage metering |
| `@caistech/usage-meter` | Per-product token/cost meter feeding the cost dashboard |
| `@caistech/extractors` | LLM content extractors (business profile from a site, social signals) |
| `@caistech/cert-extractor` | OCR + structured entity extraction for certs/licences |

**Voice & language**
| Package | What it provides |
|---------|------------------|
| `@caistech/elevenlabs-convai` | The portfolio voice stack — agent CRUD, webhooks, persistent-memory loop, React `VoiceWidget` |
| `@caistech/elevenlabs-voice` | TTS + STT wrappers for one-shot voice operations |
| `@caistech/language-config` | 80+ language definitions with TTS provider mapping |
| `@caistech/stt-noise-filter` | Ambient-noise removal from STT transcriptions |

**Discovery, enrichment & outreach**
| Package | What it provides |
|---------|------------------|
| `@caistech/email-finder` | Multi-provider contact/email cascade (Hunter → Apollo) |
| `@caistech/hunter-email` · `@caistech/apollo-people` | Hunter.io / Apollo.io wrappers |
| `@caistech/brave-search` | Brave Search API wrapper for prospect discovery |
| `@caistech/unipile-channels` | LinkedIn + Gmail/Outlook via Unipile |
| `@caistech/ghl-client` · `@caistech/nudge-core` | GoHighLevel CRM client · nudge/notification infra |

**Data, geography & domain SDKs**
| Package | What it provides |
|---------|------------------|
| `@caistech/abn-lookup` | Australian Business Number validation + ABR lookup |
| `@caistech/mapbox` | Mapbox geocoding (forward/reverse, static maps) |
| `@caistech/property-services-sdk` | Property intelligence — derive / assess / onboard |
| `@caistech/coordination-sdk` | Cross-project issue tracking + multi-party coordination |

**UI, reporting & embeds**
| Package | What it provides |
|---------|------------------|
| `@caistech/corporate-components` | The canonical auth surface (`AuthForm`), header/footer, ABN + address inputs |
| `@caistech/report-generator` | Markdown → branded PDF (disclaimer, watermark, page numbers) |
| `@caistech/sayfix-embed` | In-app bug-reporting widget |
| `@caistech/byok-setup` | BYOK key-onboarding wizard |

**Portfolio operations (hub tooling, not product deps)**
| Package | What it provides |
|---------|------------------|
| `@caistech/portfolio-env-sync` | Manifest-driven Vercel env audit + apply across all projects |
| `@caistech/portfolio-migrator` | Dry-run-first backfill of existing products onto the portfolio standard |

## Architecture (how products consume it)

A product repo declares the substrate as dependencies and imports the compiled `dist/` —
it never forks a generic helper. Example, a voice vertical:

```ts
import { createAgent, handleStartConversation } from '@caistech/elevenlabs-convai';
import { AuthForm } from '@caistech/corporate-components';
import { meterAnthropic } from '@caistech/usage-meter';
import { withComplianceFooter, assertCompliant } from '@caistech/email-compliance';
```

That's the thesis in four lines: voice, auth, metering, and AU email-compliance are all
*consumed*, not rebuilt. A new vertical inherits them on day one. A fork-check guard
(`scripts/check-shared-forks.mjs`) fails CI when a product re-implements something the hub
already provides — the architecture is enforced, not just documented.

## Verify it's real

- **Read the source you're looking at** — every package under `packages/` is here.
- **See it consumed:** the live products in the [marketplace](https://corporate-ai-solutions.vercel.app/marketplace)
  import these packages; their `package.json` shows the `@caistech/*` dependencies.
- **Trust state:** per-product security/compliance scan records are published at
  [platform-trust.vercel.app](https://platform-trust.vercel.app) (scan date + findings, honest about staleness).
- **Catalog:** [`SHARED_SERVICES.md`](./SHARED_SERVICES.md) is regenerated from each package's own `package.json`.

---

## Consuming from a project

Packages publish to **GitHub Packages** (private `@caistech` registry).

### One-time setup per consumer repo

1. Create a GitHub Personal Access Token with `read:packages` scope.
2. Add `.npmrc` to the consumer repo root (do **not** commit a token — use an env var):

   ```
   @caistech:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
   ```

3. Export the token locally: `export GITHUB_PACKAGES_TOKEN=ghp_...`
4. In CI (Vercel, GitHub Actions) set `GITHUB_PACKAGES_TOKEN` as a secret env var.

### Installing

```bash
pnpm add @caistech/elevenlabs-convai
pnpm add @caistech/openrouter-client
```

```ts
import { createAgent, defaultVoiceModelFor } from '@caistech/elevenlabs-convai';
```

### Publishing a new version

- Bump the relevant `packages/<name>/package.json` version (stay on `0.x.y` pre-1.0).
- Commit, push, then tag: `git tag v0.1.1 && git push origin v0.1.1`
- GitHub Actions publishes all workspaces on tag push (`.github/workflows/publish.yml`).

## Portfolio operations

`portfolio-manifest.yaml` at the hub root is the **single source of truth** for what env
vars must exist on each Vercel deploy target across the actively-managed projects, plus the
resolution sources for shared secrets.

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
- `from_supabase: { project_ref, field }` — resolved via the Supabase Management API
- `ref: "$secret:NAME"` — looked up in the manifest's top-level `secrets:` block

Bindings without a resolvable value are reported as `skipped` with a reason; the apply continues.

### Onboarding a new project

```bash
# 1. Append project to manifest + script lists; verify the Vercel project exists
bash scripts/onboard-new-project.sh <github-repo> <vercel-slug> [supabase-project-ref]
# 2. Harvest shared keys (OPENAI/ANTHROPIC/RESEND) from existing siblings
node scripts/harvest-secrets.mjs
# 3. Register with platform-trust to provision a PROJECT_ID UUID
node scripts/register-platform-trust-projects.mjs
# 4. Resolve $secret refs + push to Vercel
node packages/portfolio-env-sync/dist/index.js --manifest portfolio-manifest.yaml --apply
```

Each step is idempotent — re-running on an already-onboarded project is safe.

Required tokens (file fallbacks at `~/.<name>-token`):
- `VERCEL_TOKEN` — https://vercel.com/account/tokens
- `SUPABASE_ACCESS_TOKEN` — https://supabase.com/dashboard/account/tokens (`projects:read`)
- `GITHUB_PACKAGES_TOKEN` — for npm install of `@caistech/*` deps

## Structure

```
cais-shared-services/
├── packages/                 # @caistech/* package sources (44)
├── scripts/                  # Portfolio ops (onboard, harvest, register, redeploy, republish)
├── foundation/               # Brand + GTM substrate (loaded on demand by content skills)
├── portfolio-manifest.yaml   # Single source of truth: env vars per project
├── SHARED_SERVICES.md        # Canonical capability catalog
├── package.json              # Workspace root (packages/*)
└── tsconfig.base.json        # Shared TypeScript config
```

## Principles

- TypeScript strict for new packages; legacy plain JS where pre-existing.
- Compiled `dist/` is what's published — consumers never import source.
- Manifest-driven operations: `portfolio-manifest.yaml` is the canonical record of what
  should exist; the apply step makes it so.
- Idempotent everywhere: every script can be re-run safely.
- `@caistech`-first: if the hub provides it, products consume it — the fork-check guard enforces this.

## License

**Source-available, not open-source.** You're welcome to read this repository to understand
how the portfolio is built — that transparency is the point. It is **not** MIT-licensed and
is **not** offered for redistribution or reuse: the packages are consumed only through the
private `@caistech` registry by Corporate AI Solutions products. The runnable, MIT-licensed
proof artifacts are the standalone BYOK products (e.g.
[community-question-responder](https://github.com/caistech/community-question-responder)).

---

*Built and maintained by **Dennis McMahon** / Corporate AI Solutions (Brisbane, AU). This
substrate is how one operator ships and maintains ~38 products. **Available for contract
builds** — [corporate-ai-solutions.vercel.app](https://corporate-ai-solutions.vercel.app) ·
hello@corporateaisolutions.com.*
