# Coordination service

This directory holds the **Supabase deployment assets** for the multi-party coordination service:

- `supabase/migrations/` — DB schema (tables, RLS policies, functions)
- `supabase/config.toml` — Supabase CLI configuration
- `scripts/seed-lot31.sql` — one-off seed data

## Relationship to packages

- The consumer-facing SDK lives at `packages/coordination-sdk/` (published as `@caistech/coordination-sdk`).
- Consumers (e.g. F2K-Checkpoint) import the SDK via npm and connect to the Supabase project deployed from this directory.

## History

Previously lived in a standalone repo at `C:/Users/denni/PycharmProjects/coordination/` (no remote). Moved here 2026-04-19 to match the pattern: all shared services live inside `cais-shared-services/`.

## Deploying

From this directory:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Env vars required at runtime (consumed by `@caistech/coordination-sdk`):

- `NEXT_PUBLIC_COORDINATION_URL` — Supabase project URL
- `NEXT_PUBLIC_COORDINATION_ANON_KEY` — anon key
- `COORDINATION_SERVICE_ROLE_KEY` — service role key (server-side only)
