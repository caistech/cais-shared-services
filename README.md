# cais-shared-services

Shared services for Corporate AI Solutions projects. npm workspace monorepo.

## Packages

| Package | Description | Used by |
|---------|-------------|---------|
| `@caistech/elevenlabs-convai` | ElevenLabs Conversational AI — agent CRUD, webhooks, persistent memory | Kira, MOVA Drive |
| `@caistech/elevenlabs-voice` | ElevenLabs TTS + STT for one-shot voice operations | Mova, TourLingo |
| `@caistech/openrouter-client` | OpenRouter LLM client with retry + streaming | Mova, DisasterSupport |
| `@caistech/language-config` | 80+ language definitions, TTS provider mapping | Mova, TourLingo |
| `@caistech/stt-noise-filter` | Filter ambient noise from STT transcriptions | Mova, TourLingo |
| `@caistech/agents` | Agent provisioning, prompt templates, secure gateway (JS) | Corporate-AI-Solutions |
| `@caistech/security` | Permissions, PII classifier, audit logger, consent, retention (JS) | Corporate-AI-Solutions |

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
├── package.json              # workspace root
├── tsconfig.base.json        # shared TypeScript config
├── packages/
│   ├── elevenlabs-convai/    # ConvAI agents, webhooks, memory
│   ├── elevenlabs-voice/     # TTS + STT wrappers
│   ├── openrouter-client/    # LLM client with retry
│   ├── language-config/      # 80+ languages, provider mapping
│   ├── stt-noise-filter/     # Noise removal from transcriptions
│   ├── agents/               # Agent provisioning (JS)
│   └── security/             # Security primitives (JS)
├── components/               # React: CorporateHeader, Footer, ABN lookup
├── styles/                   # Corporate CSS
├── integrations/             # GHL CRM client
└── migrations/               # SQL templates
```

## Adding a new package

1. Create `packages/<name>/` with `package.json` (name: `@caistech/<name>`) and `src/`
2. Add to workspace root `package.json` workspaces array (already `packages/*`)
3. For TypeScript packages, extend `tsconfig.base.json`
4. Commit and push — consumers update via git

## Principles

- Dependency injection — no hardcoded project references
- TypeScript strict for new packages, plain JS for legacy (`agents/`, `security/`)
- No build step required — consumers import source directly
- Private repo — not published to npm registry
