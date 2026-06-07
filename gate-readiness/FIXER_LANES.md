# Fixer Lanes — how a surfaced finding gets fixed (or surfaced for you to act)

> **The foundation the "Fix these" loop builds on.** Every readiness check
> (`gate-readiness/criteria.json` + the VT_ plan) now carries a **`fixer`** lane that says *who
> can resolve it and how*. The card routes each finding to its lane. Companion to
> `THIN_MVP_RUBRIC.md` (the rubric), `BUSINESS_MODEL.md` §4 (the pipeline), and the validation
> orchestrator (`scripts/validate.mjs`, which surfaces the findings this routes).
>
> **Last updated:** 2026-06-07.

---

## 0. THE GOLDEN RULE (non-negotiable)

**Nothing ever fails silently.** Every surfaced finding resolves to exactly one of:

1. **fixed** (a fixer made it pass, re-verified), or
2. **must-fix** (a real, unresolved fail — shown red, blocks per its tier), or
3. **needs-you** (a fixer that the machine *cannot* complete — e.g. a missing third-party API
   key, a domain purchase — surfaced **on the card with explicit instructions** for exactly
   what you must do, where, and why), or
4. **waived** (your deliberate, logged decision not to fix — see `WAIVER` below).

A finding the machine can't auto-fix is **never** dropped, hidden, or recorded as a silent
`na`/`unknown`. It is shown on the card as **"needs-you"** with step-by-step instructions. The
absence of a fixer is a *display obligation*, not an excuse to go quiet. (This is the inverse of
the fake-green failure the readiness scorer already guards against — see `score.ts`.)

---

## 1. The three fixer lanes

Each criterion's `fixer` field is one of:

| `fixer` | What it means | Who acts | Mechanism |
|---|---|---|---|
| **`code`** | A repo/app change (UI, copy, route, auth page, product-specific migration, voice integration code) | the **design-build** agent | rebuilds the product repo on a branch, opens a PR; merge → deploy → re-verify |
| **`config`** | An idempotent infra op the machine *can* do with a management token (Vercel project/env settings, standard Supabase scaffolding, account/agent provisioning) | the **config-fixer** | dispatches an idempotent remediation script against the provider's management API |
| **`operator-input`** | A value or decision the machine **cannot generate** (a BYOK third-party key, a domain purchase, a destructive verification) | **you** — the machine detects, guides, validates | surfaced on the card with instructions; you supply/decide; the machine validates + records |

A **waiver** (§5) is an overlay on *any* lane: "I deliberately choose not to fix this, because…".

---

## 2. Lane `code` — design-build (already built)

The existing flow. The card's "Fix these" folds the failing `code` findings into the
design-build work order (`_teardown_brief.md`); the agent rebuilds to spec + standards and opens
one PR. Owns the bulk of the rubric: every UI/UX/responsive/voice-integration/auth-page/content
check, and **product-specific** schema/RLS (written as a repo migration, applied on deploy).

**Boundary:** product-specific migrations are `code` (repo, versioned, reviewable). Only the
*standard, identical-across-products scaffolding* (the §9.5 `profiles` table/trigger/RLS) is
`config`.

---

## 3. Lane `config` — the config-fixer (to build)

A dispatcher over **idempotent** remediation scripts (most already exist), shaped like
design-build (a workflow or cockpit route that reports a verdict back to `readiness_results`).

### Finding → script map (the scripts mostly exist already)

| Codes | Script |
|---|---|
| **#40** Vercel env sensitive/targets | the env-harden pass (`set-vercel-env*` + encrypted→sensitive convert, drop `development`) |
| **VT_D1** `ADMIN_EMAILS` / env presence | `vercel env` set (sensitive, prod+preview) |
| **VT_D2 / VT_D3** QA accounts | §9.5 `admin.createUser` provisioning |
| **#28 / VT_D4 / VT_D5 / VT_D6** standard `profiles` table + trigger + RLS | the canonical scaffolding migration |
| **#35 / VT_D7** email sender + infra | `configure-email-templates.sh` + `onboard-new-project.sh` (Resend SMTP + templates) |
| **#18 / #19** voice agent allowlist + workspace webhook bind | `provision-*-agent.ts` (ElevenLabs) |

### The contract every `config` script MUST honour
1. **Idempotent** — safe to re-run; converges to the desired state.
2. **Dry-run → confirm → execute** for any live/outward mutation. (The #40 remediation on
   2026-06-07 planned all 35 vars before touching one — that is the required discipline.)
3. **Verify the target ref first.** The portfolio runs **multiple live DBs / projects** — confirm
   the Supabase ref / Vercel project is the *intended* one before applying (the 2026-06-07
   deal-findrs case: the real instance was `obakurzlpzisflnnjzzo`, not the first ref tried). Print
   the ref as part of the pause.
4. **Additive + non-destructive by default.** `CREATE … IF NOT EXISTS`, guarded `CREATE POLICY`,
   `PATCH`/recreate env. **Never a silent `DROP`/`ALTER`/delete** that can lock out or expose —
   those require an explicit type-to-confirm.
5. **Never pipes secret *values* through chat/logs.** Reads from `vercel env pull` / the product's
   `.env` / operator-supplied; only the management *token* is handled, and that is rotated after.
6. **Reports a verdict** to `readiness_results` via `gate-check record-readiness` (source `auto`),
   bound to the live deployment — so the card reflects the fix.

### Why `config` is *required*, not polish
A **HARD** check whose only fixer is `config` (e.g. **#40**) makes the gate **unsatisfiable** via
"Fix these" until this lane exists — the product sits permanently blocked. Wiring it is what makes
the HARD gate both honest *and* closeable.

---

## 4. Lane `operator-input` — guided, never silent (to build)

The machine **cannot** generate these. It must **surface them on the card with instructions** (the
golden rule), then validate what you supply.

### What lands here
- **Missing third-party API keys** (BYOK — Rule 10): `RESEND_API_KEY`, Mapbox, any provider key.
  The machine cannot invent a secret tied to your account + billing.
- **Domain purchase** (Gate-2-gated spend per `BUSINESS_MODEL.md`).
- **Destructive verifications**: **VT_A5** (Sign Out Everywhere), **VT_A6** (Delete Account) —
  operator-verified by design (§9.5); never agent-run.

### The required card treatment (the golden rule, concretely)
A `needs-you` finding renders on the card with:
1. **What's missing** — the exact key/decision and which surface/env it blocks.
2. **Where to get it** — the provider console URL / the exact action.
3. **How to supply it securely** — a paste/`!` path that never puts the secret in a report; the
   machine then stores it correctly (sensitive, prod+preview) via the `config` lane.
4. **Validation before pass** — the machine makes a real test call with the supplied key and only
   records `pass` if it works (a present-but-invalid key fails — no fake-green).
5. **Or waive** — if you deliberately don't want it wired, waive with a reason.

### Secondary dependencies
Some `code` checks have a `config`/`operator-input` *secondary* dependency captured in the
`needs` field of `fixer-lanes.json` (e.g. magic-link #24/VT_C4 is a `code` fix for the page, but
delivery `needs` the email infra #35/VT_D7; Mapbox #34 is `code` but `needs` the operator's Mapbox
key). The card shows the secondary so a "fixed the page but the key's missing" state is never
silently green.

---

## 5. The per-check waiver (overlay on any lane)

Every finding must end **fixed / must-fix / needs-you / waived** — never ambiguous. A **waiver** is
your deliberate, logged choice not to fix ("a good spot for a second voice agent, but I chose not
to, because <reason>"). **A waiver is not a fail** — it does not block or drag the score.

- **Storage:** a `readiness_waivers` overlay — `(product_slug, check_code, reason [required],
  waived_by, waived_at, revoked_at)`; reuses the reasoned-+-logged override ledger.
- **Scorer (`score.ts`):** a WEIGHTED waiver leaves the score math entirely (operator-chosen N/A —
  neither earns nor counts against). A CONDITIONAL-HARD / HARD waiver **lifts the block** but
  renders prominently + logged, and requires **type-to-confirm** ("I understand #X is unmet and I'm
  shipping anyway because…") — the §6 HARD-override severity.
- **UI:** a "Waive" action per finding; waived findings render neutral (not red) with who/when/why
  + an Un-waive. Re-runs don't clobber a waiver; if the underlying verdict later passes, the waiver
  is moot/auto-archived.

This is the line between *the machine deciding* and *you deciding*: the machine surfaces
rigorously; **you adjudicate** — fix, supply, or waive.

---

## 6. Where the data lives

- **`gate-readiness/fixer-lanes.json`** — the canonical `code → { fixer, needs?, instructions? }`
  map for all 67 checks (the 45 rubric + the 22 VT_). The source of truth for the column.
- **`readiness_criteria.fixer`** — the runtime column the cockpit/scorer read (added by migration
  `…_readiness_fixer_lane.sql`, backfilled from `fixer-lanes.json`).
- **`criteria.json`** — the 45-check rubric; carries `fixer` per criterion for the base set.

When `fixer-lanes.json` changes, re-apply the backfill (the migration's UPDATEs are idempotent).

---

## 7. How the card uses it (the routing, made real)

1. Orchestrator (`validate.mjs`) surfaces findings → `readiness_results`.
2. The card groups failing findings by `readiness_criteria.fixer`:
   - **code** → "Fix these" → design-build PR.
   - **config** → "Fix these" → config-fixer dispatch.
   - **operator-input** → **"Needs you"** panel with instructions (never a silent gap).
3. Each finding also offers **Waive** (with reason).
4. Nothing is left ambiguous — the card can surface *"N findings awaiting your decision."*
