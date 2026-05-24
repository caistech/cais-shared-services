# Supabase Migration Playbook — moving a project between orgs (canonical)

> **What this is.** The operational runbook for migrating a Supabase project's
> data + schema from one org/account to another (e.g. our build account → a
> client's own org), when the **source must be retained** (we keep our dev/sandbox
> copy). It is the runbook the `PRODUCT_STANDARDS.md` §9 "DB dumps" codicil points
> to. First derived from the mmcbuild CAS → MMC Build migration (2026-05-25).
>
> Companion to `CLIENT_HANDOVER_KIT.md` (the keys/env half of a handover — this
> doc is the data half).
>
> **Last updated:** 2026-05-25.

---

## 0. Decision first — copy, don't transfer

- Supabase's **"Transfer project to another organization" moves the whole
  project** (DB, auth, storage, ref/URL, billing) out of the source org. Use it
  **only** if you're giving the project up entirely.
- If you must **keep** the source (it's your dev/sandbox), **`pg_dump` → restore
  a copy** into a fresh destination project the recipient created in their own
  org. The source stays yours; the recipient gets an independent prod copy with a
  clean billing boundary.

## 1. Pre-flight

1. **Identify the true source project.** Orgs accumulate near-duplicate projects
   (mmcbuild had two: "MMC Build" Mumbai *with the data* + an empty "MMC Build Web
   App" Sydney). Confirm which one the live app actually uses (linked CLI / the
   deployed `NEXT_PUBLIC_SUPABASE_URL`) before dumping.
2. **Confirm the source holds only this product's data.** Run the foreign-data
   check (table inventory + `auth.users` email-domain breakdown + storage
   buckets). If clean → a full dump is safe; if mixed → scope the dump to the
   product's tables. (Each portfolio product *should* have its own project, so a
   clean result is expected — verify, don't assume.)
3. **Check the destination region** against the product's data-residency
   commitment (e.g. AU products → `ap-southeast-2` Sydney). A migration is a good
   moment to *correct* residency drift.
4. **Tooling.** `supabase` CLI handles the dumps and pulls a matching
   `postgres:<version>` Docker image — so **no local `psql` needed** for dumping;
   use that same Docker image's `psql` for the restore if none is installed.

## 2. Pull the dumps (source side — needs only your creds)

The dump only needs the *source* credentials (cached in the linked project's
`pooler-url`); the recipient's password is needed **only for the restore**. Pull
four artifacts:

| Dump | Command | Notes |
|---|---|---|
| Schema | `supabase db dump --linked -f schema.sql` | DDL only, 0 data. Triggers appear as `CREATE OR REPLACE TRIGGER` (don't grep for bare `CREATE TRIGGER`). Extensions use `CREATE EXTENSION IF NOT EXISTS` (pgvector self-provisions on restore). |
| Data | `supabase db dump --linked --data-only -f data.sql` | One multi-row `INSERT` per table (not `COPY`). Includes `storage.buckets`/`storage.objects` **metadata rows** only. **PII** — gitignore + delete after. |
| Roles | `supabase db dump --linked --role-only -f roles.sql` | Custom roles/grants. |
| Auth | `supabase db dump --linked --data-only --schema auth -f auth.sql` | `auth.users` + `auth.identities` are the durable rows. The transient tables (`sessions`, `refresh_tokens`, `one_time_tokens`, `flow_state`) can be skipped — users just re-login. |

All dump files are gitignored (`dump-*.sql`) and **deleted after the restore
verifies** (PRODUCT_STANDARDS §9). Never print dump contents (PII / password
hashes); inspect with counts only.

## 3. Restore (destination side — needs the recipient's DB password)

Get the destination DB password over a **secure channel** (password manager /
WhatsApp), never email. Then, against the destination connection string:

1. **roles → schema → data**, in that order. The schema file self-provisions
   pgvector via `CREATE EXTENSION IF NOT EXISTS`; if a managed extension needs
   enabling first, do it in the dashboard.
2. **auth** — load `auth.users` + `auth.identities`. (Gotrue manages the auth
   schema structure on the destination; you're loading rows, not recreating the
   schema.)
3. **Storage files** — the dumps carry only `storage.objects`/`buckets`
   *metadata*; the **actual files** live in object storage, not Postgres. Copy
   them via the Storage API (download from source bucket → upload to destination),
   or the metadata rows are dangling references.
4. If no local `psql`: `docker run --rm -i postgres:<version> psql "<dest-conn>" -f -`
   (the `supabase` CLI already pulled a matching image during the dump).

## 4. Verify, then cut over

- Row counts per table match source ↔ destination.
- A real end-to-end flow works against the destination (e.g. log in, run a core
  action).
- `auth` login works for a migrated user.
- Storage assets resolve (not 404).
- Recipient pulls the real `NEXT_PUBLIC_SUPABASE_URL` / anon / service-role keys
  from *their* project into their hosting env (see `CLIENT_HANDOVER_KIT.md`).
- **Delete the local dump files.**

## 5. Gotchas (learned mmcbuild 2026-05-25)

- `--data-only` emits `INSERT`s, not `COPY` — don't conclude "no data" from a
  zero `COPY` count.
- Triggers are `CREATE OR REPLACE TRIGGER` in the dump — a `grep "CREATE TRIGGER"`
  falsely reports zero.
- The `auth` schema is **excluded** from a default `supabase db dump` — auth users
  need their own `--schema auth` pull or they silently don't migrate.
- Storage **files** never come through pg_dump — separate Storage-API step.
- Two same-named projects in one org → dump the wrong one and you migrate stale
  data. Confirm the live source first (§1.1).
