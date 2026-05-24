# @caistech/byok-setup

BYOK key-onboarding wizard. A product ships a `byok.config.json` declaring every
key it needs; this reads it, shows the operator each key with how-to-get
instructions, validates pasted values, generates secrets, and distributes the
values to their destinations (`.env.local`, Vercel).

CLI today; a React `<ByokSetupWizard>` reuses the same core later.

## Manifest

See [`SCHEMA.md`](./SCHEMA.md) for the full schema. A product puts `byok.config.json`
at its repo root. Reference manifests: `preflight/byok.config.json`,
`mmc-application/byok.config.json`.

## CLI

```bash
# from a product repo that has a byok.config.json
npx byok-setup                 # dry-run, pre-deploy keys (build + runtime)
npx byok-setup --apply         # write .env.local + push to Vercel
npx byok-setup --phase=post-deploy --apply   # second pass: webhook secrets etc.
npx byok-setup --force         # overwrite existing values instead of keeping them
npx byok-setup --manifest=path/to/byok.config.json
```

Flow:
1. Groups keys by `provider` so you set up each account once.
2. Two passes by `phase`: pre-deploy (build+runtime) first; `post-deploy` for keys
   that need the live URL (e.g. `STRIPE_WEBHOOK_SECRET` — it prints the endpoint to
   create first).
3. Validates each paste against `keyFormat` (+ a JWT role check so a Supabase
   service-role key can't be pasted into the anon slot).
4. Distributes: `env-file` (gitignore-guarded, atomic, keep-existing by default) and
   `vercel` (value via stdin, never argv).

## Library

```ts
import { loadManifest, validateValue, generateSecret, writeEnvFile, vercelPush } from "@caistech/byok-setup";
```

The validation/secret/distribution core is exported so the web wizard reuses it
rather than re-implementing it.

## Security

- Secrets go to Vercel via **stdin, never argv** (no leak to process list / CI logs).
- The env-file adapter **refuses to write** unless the target is gitignored.
- `secretClass: "external-match"` secrets are auto-generated AND the wizard tells you
  to paste the same value into the external sender (so webhooks don't 401 silently).

## Status

v0.1 — core + CLI + env-file/vercel adapters. Deferred: React web wizard, Supabase
config adapter, `feature-preflight` convergence (needs semantic regression tests).
