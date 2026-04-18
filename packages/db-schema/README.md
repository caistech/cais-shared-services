# @caistech/db-schema

Cross-cutting Supabase schema migrations shared across Corporate AI Solutions projects.

This package contains SQL only — no runtime code. Consumers run these migrations against their own Supabase project to set up the foundational multi-tenancy, agent, audit, and storefront tables that `@caistech/agents`, `@caistech/security`, and related packages depend on.

## Migration order

Apply in sequence:

1. **`migrations/001-create-tables.sql`** — base tables (profiles, conversations, etc.)
2. **`migrations/002-org-multi-agent.sql`** — multi-tenancy, agents, activity tracking, audit, consent
3. **`migrations/003-storefront-tables.sql`** — storefront/product surfaces

Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`, guarded column additions).

## Usage

```bash
# Via Supabase CLI
supabase db push --db-url "$SUPABASE_DB_URL"

# Or paste each file into the Supabase SQL editor in order
```

Migrations are not auto-applied on `npm install`. Consumers decide when and where to run them.

## Provenance

- `001-create-tables.sql` + `003-storefront-tables.sql` were previously only tracked in `gbta-openclaw/infrastructure/db/migrations/`. Copied into this package 2026-04-18 as part of the shared-services consolidation.
- `002-org-multi-agent.sql` was previously at `cais-shared-services/migrations/org-multi-agent.sql`.
