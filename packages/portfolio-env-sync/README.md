# @caistech/portfolio-env-sync

Manifest-driven Vercel env audit for the Corporate AI Solutions portfolio.

> v0 = read-only audit. v0.5+ planned: `--apply` writes, Supabase Management
> API integration, `.env.local` generation, onboarding wizard. See **Roadmap**
> below.

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
```

Exit codes:

- `0` — every project clean
- `1` — drift detected (`missing` or `needs_attention` rows)
- `2` — config error (invalid manifest, missing `VERCEL_TOKEN`, project not found)

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

- **v0** (this release): manifest schema, Vercel env audit, drift report
- **v0.5**: `--apply` flag — push missing/wrong keys to Vercel via API
- **v0.6**: Supabase Management API — audit Edge Function secrets in
  `secrets:` block of project entries
- **v0.7**: `.env.local` generation — mirror Vercel state to local file with
  comment-preserving rewrite
- **v0.8**: `onboard <repo-name>` interactive wizard — pick Vercel project,
  pick Supabase project, generate manifest entry
- **v1**: 1Password CLI integration for `$secret:` resolution; CI weekly
  audit; pre-deploy gate

## Known limitations (v0)

- No Supabase audit. `supabase_project_ref` is parsed but unused.
- No value resolution. `ref`/`from_supabase` are parsed but ignored.
- No `.env.local` audit. Local file state isn't checked.
- No `--apply`. Read-only.
- No team/scope multi-tenancy. One manifest = one Vercel team.

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
