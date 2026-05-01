# @caistech/portfolio-env-sync

Manifest-driven Vercel env audit + apply for the Corporate AI Solutions portfolio.

> **v0.5** ships `--apply` (create missing keys, PATCH targets for partials)
> and **v0.6** ships Supabase Management API resolution for `from_supabase:`
> bindings. v0.7 (`.env.local` generation) and v0.8 (onboard wizard) are
> tracked in [Issues #5](https://github.com/caistech/cais-shared-services/issues/5)
> and [#6](https://github.com/caistech/cais-shared-services/issues/6).

## Why

The portfolio has 13+ Vercel projects, each with overlapping env-var
requirements (`PLATFORM_TRUST_*`, `NEXT_PUBLIC_SUPABASE_*`, `GITHUB_PACKAGES_TOKEN`,
etc.). Drift between what *should* be set and what *is* set has caused
multiple deploy outages. v0 catches that drift in one command.

## Setup

```bash
npm install --workspace=@caistech/portfolio-env-sync
npm run build --workspace=@caistech/portfolio-env-sync

# Generate a Vercel personal token: https://vercel.com/account/tokens
# Scope: full account, or per-team. The team_id in manifest.yaml is checked.
# Provide it one of two ways:
#   (a) export VERCEL_TOKEN=...                    # per-shell
#   (b) echo 'TOKEN' > ~/.vercel-token && chmod 600 ~/.vercel-token   # persistent

# Copy the example manifest and customise
cp packages/portfolio-env-sync/manifest.yaml.example portfolio-manifest.yaml
```

## Usage

```bash
# Audit every project in the manifest
node packages/portfolio-env-sync/dist/index.js \
  --manifest portfolio-manifest.yaml

# Audit one project
node packages/portfolio-env-sync/dist/index.js \
  --manifest portfolio-manifest.yaml \
  --repo f2k-checkpoint-new

# JSON output for piping into other tools
node packages/portfolio-env-sync/dist/index.js \
  --manifest portfolio-manifest.yaml --json

# Apply: create missing keys; PATCH targets for partials
node packages/portfolio-env-sync/dist/index.js \
  --manifest portfolio-manifest.yaml \
  --repo hair-stylist-ai \
  --apply
```

Exit codes:

- `0` — every project clean (or every action successful in apply mode)
- `1` — drift detected, OR any apply action errored
- `2` — config error (invalid manifest, missing token, project not found)

### `--apply` behaviour

For each `missing` row, the apply step CREATES a new env entry on the
manifest's expected targets. For each `needs_attention` row (key set on
some targets, missing on others), it PATCHes the existing entry to add
the missing targets without touching the value.

`ok` and `extra` rows are no-ops.

Resolution order for the value sent to Vercel:

1. `value: "literal"` — literal value
2. `from_supabase: "url" | "anon_key" | "service_role_key"` — resolved
   via Supabase Management API (requires `SUPABASE_MANAGEMENT_TOKEN`)
3. `ref: "$secret:..."` — currently SKIPPED with a clear reason
   (secret-store integration is tracked in a future release)

If a binding can't be resolved, the row is reported as `skipped` and
the apply continues. Re-running the audit afterward shows whether any
resolvable drift remains.

### Supabase Management API resolution

Add `supabase_project_ref:` to a project entry, then declare bindings
with `from_supabase:`:

```yaml
- name: hair-stylist-ai
  vercel_project_id: "prj_..."
  supabase_project_ref: "pkzbpzzgrxjebdmwfsmg"
  envs:
    NEXT_PUBLIC_SUPABASE_URL:       { from_supabase: "url" }
    NEXT_PUBLIC_SUPABASE_ANON_KEY:  { from_supabase: "anon_key" }
    SUPABASE_SERVICE_ROLE_KEY:      { from_supabase: "service_role_key" }
```

When `--apply` encounters one of these on a `missing` row, it queries
`https://api.supabase.com/v1/projects/<ref>/api-keys` to resolve the
value. The Supabase client is constructed lazily — projects whose
`from_supabase:` bindings are already satisfied won't require
`SUPABASE_MANAGEMENT_TOKEN` to be set.

Generate a Supabase token at https://supabase.com/dashboard/account/tokens
(scope: projects:read minimum). Provide it via `SUPABASE_MANAGEMENT_TOKEN`
env var or `~/.supabase-token` file.

## Output

```
Auditing 5 project(s)
────────────────────────────────────────────────────────────

f2k-checkpoint-new  (prj_XPELCzoIwOY5NoHGJxd4Ah6w59G9)
  ✓ PLATFORM_TRUST_SUPABASE_URL          (production, preview, development)
  ⚠ PLATFORM_TRUST_SERVICE_KEY           present in [development], missing [production, preview]
  ⚠ STOREFRONT_MCP_TOKEN                 present in [development], missing [production, preview]
  ✗ ANTHROPIC_API_KEY                    MISSING
  · OLD_VAR_THAT_NOBODY_REMEMBERS        (extra: production)
  ─ 1 ok, 2 needs attention, 1 missing, 1 extra
```

Symbols:

- `✓ ok` — present on all expected targets
- `⚠ needs attention` — present on some targets but not others (Vercel UI shows
  "Needs Attention" badge in this case)
- `✗ missing` — declared in manifest, not present on Vercel
- `· extra` — present on Vercel, not declared in manifest (informational only)

## Manifest schema

See `manifest.yaml.example` for a working starting point. Each project
declares:

- `name`: human-readable identifier (used by `--repo`)
- `vercel_project_id`: starts with `prj_`
- `supabase_project_ref`: optional; reserved for v0.5 Supabase audit
- `inherit_shared`: list of names from the top-level `shared:` block
- `envs`: project-specific bindings; override inherited ones with the same name

A binding is either:

```yaml
KEY: "literal value"           # shorthand
KEY:
  value: "literal value"        # long-form (same effect)
  targets: [production, preview]  # which Vercel envs (default: all 3)
KEY:
  ref: "$secret:secret_name"    # v0 ignores; v0.5 uses for apply
KEY:
  from_supabase: "service_role_key"   # v0 ignores; v0.5 uses for apply
```

For v0 audit-only mode, **only the *key name* is checked** — values are not
read from Vercel (they're encrypted) and `ref`/`from_supabase`/`value` are
ignored. The audit answers "is this key set on these targets?", not
"is the value correct?".

## Roadmap

- **v0** — manifest schema, Vercel env audit, drift report
- **v0.5** ✓ shipped — `--apply` flag (create + PATCH)
- **v0.6** ✓ shipped — Supabase Management API for `from_supabase:` bindings
- **v0.7** — `.env.local` generation from Vercel state
  ([Issue #5](https://github.com/caistech/cais-shared-services/issues/5))
- **v0.8** — `onboard <repo>` interactive wizard
  ([Issue #6](https://github.com/caistech/cais-shared-services/issues/6))
- **v1** — secret-store integration (1Password / vault) for `$secret:` refs;
  CI weekly audit; pre-deploy gate

## Known limitations (v0.6)

- `ref: "$secret:..."` bindings are skipped during apply. A real secret-store
  integration is the v1 milestone.
- `--apply` only acts on `missing` and `needs_attention` rows. Divergent
  values on `ok` rows aren't detected (audit only checks key presence,
  not value equality).
- No `.env.local` audit. Local file state isn't checked.
- One manifest = one Vercel team. No team multi-tenancy.

## Testing locally

```bash
# From cais-shared-services root
npm install
npm run build --workspace=@caistech/portfolio-env-sync

export VERCEL_TOKEN=<your token>
node packages/portfolio-env-sync/dist/index.js \
  --manifest packages/portfolio-env-sync/manifest.yaml.example \
  --repo f2k-checkpoint-new
```

Expected: a 5-row audit of f2k-checkpoint-new's env vars vs the example
manifest. Exit code reflects whether everything's set.
