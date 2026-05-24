# Client Handover Kit — the key/env self-serve standard (canonical)

> **What this is.** The canonical standard for how every product hands its
> environment + API keys to **whoever runs it** — a client we hand a build to, a
> distributor who self-hosts, or a BYOK-free operator standing up their own
> instance. The recipient populates **their own** keys via a self-serve kit; the
> operator never emails credentials around and never leaves the recipient
> guessing which keys are needed.
>
> Companion to `BUSINESS_MODEL.md` (BYOK lane + distributor self-host vs hosted),
> `MONETISATION_RULES.md` (R10 every key user-provided, R12 no uncovered cost
> exposure), and `PRODUCT_STANDARDS.md` (the pre-ship checklist points here).
> Auth-pattern severity: a product handed over without this kit strands the
> recipient at the door.
>
> **Last updated:** 2026-05-25.

---

## 0. Why this exists

Across the portfolio the single largest tax on a handover is env/keys: the
recipient hits a wall, one missing key at a time — "what key is this, where do I
get it, what format, is it required?" — and the operator ends up drip-feeding
credentials over email (insecure) or walking them through dashboards (slow). The
mmcbuild CAS → MMC Build handover (2026-05-25) crystallised the fix: ship a
**manifest-driven, self-serve kit** so the recipient sets up their own accounts
and pushes their own keys in one pass, and the operator's only job is to hand
over the *shape*, not the secrets.

This is also the consumer-facing half of the **PROJECT BOOTSTRAP AUTOMATION**
rule (CLAUDE.md): bootstrap automates *our* env setup; the handover kit automates
*theirs*.

## 1. The kit — three artifacts + one doc (ship all four)

| Artifact | Role |
|---|---|
| **`byok.config.json`** (repo root) | Machine-readable manifest — the source of truth. One entry per env var: `provider`, `envVar`, `required`, `scope` (public/secret/config), `phase` (build/runtime/post-deploy), `secretClass` (provider-paste / create-then-copy), `signup` + `keyPage` URLs, step-by-step `instructions`, `keyFormat` (regex), `costNote`. |
| **`.env.restore.local.example`** | The human fill-in file, **generated from** the manifest. Grouped by provider, `[R]`/`[O]` flags, dashboard URL per key, `...` placeholders. Recipient copies → `.env.restore.local`, fills their half. |
| **`scripts/vercel-env-restore.mjs`** (or platform equivalent) | One-command push. Dry-run by default; `--apply` pushes to prod/preview/dev. Pipes values via stdin (**never logs them**), skips any line still ending in `...` (safe partial re-runs), idempotent (skips keys already set). |
| **`docs/env-cutover-template.md`** | The **who-fills-what** split (see §3). Resolves "is this mine or theirs?" for every key. |

The recipient's whole flow: `cp .env.restore.local.example .env.restore.local`
→ fill their half → `node scripts/vercel-env-restore.mjs` (dry-run) → `--apply`
→ **delete `.env.restore.local`**.

## 2. Security rails (non-negotiable — cross-refs PRODUCT_STANDARDS §9)

- **No secrets in any committed artifact.** `byok.config.json` and
  `.env.restore.local.example` carry only key *names*, formats, URLs, and
  instructions — never values.
- **`.env.restore.local` is gitignored and deleted after the push** (it holds
  plaintext secrets). Same discipline as DB dumps.
- **Live credentials are exchanged over a secure channel** (password manager /
  WhatsApp / encrypted), never plain email.
- **Pushed secrets are marked `sensitive`, prod+preview only** (never
  `development`) per the Vercel sensitive-env rule.

## 3. The who-fills-what split (the cutover doc)

`docs/env-cutover-template.md` divides every env var into two columns so nobody
guesses:

- **Recipient fills** — their own accounts: auth/DB (Supabase), LLM (Anthropic /
  OpenAI), email (Resend), payments (Stripe), jobs (Inngest), maps (Mapbox), etc.
  Clean billing boundary from day one — usage lands on *their* account (R10).
- **Operator pastes** — only the **shared-services backends we host on their
  behalf** (e.g. `platform-trust`, `property-services`). These are
  feature-gated, so the product runs without them initially.

Each key names its source URL and whether it's required or feature-gated. The
recipient sets up each provider account once, grabs all its keys together.

## 4. When it applies

- **Every product handed to a client** (e.g. mmcbuild → MMC Build).
- **Every product a distributor self-hosts** (BYOK deployment path — they run on
  their own keys; we clip nothing; lane-4 shape per `BUSINESS_MODEL.md`).
- **Every BYOK-free open release** — the kit *is* the "stand up your own
  instance" on-ramp.
- A **hosted** distributor deployment (we run it, we clip per active end-user)
  still uses the manifest to provision, but the keys are ours — the cutover doc
  marks them "operator-managed".

## 5. Verification heuristic before claiming a handover is ready

- Does `byok.config.json` list **every** env var the app reads? (Grep the code
  for `process.env.*`; reconcile against the manifest — gaps are the bug.)
- Does `.env.restore.local.example` regenerate from it, grouped by provider with
  `[R]`/`[O]` flags and a dashboard URL per key?
- Does the push script dry-run cleanly, skip `...` placeholders, and never log a
  value?
- Does `docs/env-cutover-template.md` assign **every** key to recipient-fills or
  operator-pastes — with no key unaccounted for?
- Are there **zero** secrets in any committed file?

If any answer is no, the handover kit is not done.

## 6. Reference implementation

mmcbuild (2026-05-25): `byok.config.json` + `.env.restore.local.example` +
`scripts/vercel-env-restore.mjs` + `docs/env-cutover-template.md`. ~25 services
covered; recipient (MMC Build) self-serves Supabase/Anthropic/OpenAI/HF/Stripe/
Resend/Inngest/Mapbox; operator pastes only the platform-trust + property-services
backends.

## 7. Shared-services target

The wizard generator (manifest → `.env.restore.local.example`) and the push
script are the same in every repo — extract them into `@caistech` (a
`@caistech/handover-kit` or fold into `portfolio-env-sync`) the second a third
product needs them, per the `@caistech` shared-services-first rule. Until then,
the mmcbuild trio is the reference to copy.
