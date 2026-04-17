# cais-shared-services

Shared services for Corporate AI Solutions projects. npm workspace monorepo.

## Packages

| Package | Description | Used by |
|---------|-------------|---------|
| `@cais/elevenlabs-convai` | ElevenLabs Conversational AI — agent CRUD, webhooks, persistent memory | Kira, MOVA Drive |
| `@cais/elevenlabs-voice` | ElevenLabs TTS + STT for one-shot voice operations | Mova, TourLingo |
| `@cais/openrouter-client` | OpenRouter LLM client with retry + streaming | Mova, DisasterSupport |
| `@cais/language-config` | 80+ language definitions, TTS provider mapping | Mova, TourLingo |
| `@cais/stt-noise-filter` | Filter ambient noise from STT transcriptions | Mova, TourLingo |
| `@cais/agents` | Agent provisioning, prompt templates, secure gateway (JS) | Corporate-AI-Solutions |
| `@cais/security` | Permissions, PII classifier, audit logger, consent, retention (JS) | Corporate-AI-Solutions |

## Consuming from a project

Add to your project's `package.json`:

```json
{
  "dependencies": {
    "@cais/elevenlabs-convai": "github:dennissolver/cais-shared-services#main:packages/elevenlabs-convai",
    "@cais/openrouter-client": "github:dennissolver/cais-shared-services#main:packages/openrouter-client"
  }
}
```

Or for simpler setup, copy the `packages/<name>/src/` directory into your project's `lib/` or `shared/`.

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

1. Create `packages/<name>/` with `package.json` (name: `@cais/<name>`) and `src/`
2. Add to workspace root `package.json` workspaces array (already `packages/*`)
3. For TypeScript packages, extend `tsconfig.base.json`
4. Commit and push — consumers update via git

## Principles

- Dependency injection — no hardcoded project references
- TypeScript strict for new packages, plain JS for legacy (`agents/`, `security/`)
- No build step required — consumers import source directly
- Private repo — not published to npm registry
