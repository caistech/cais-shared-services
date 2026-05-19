# CLAUDE.md — REPLACE_WITH_PRODUCT_NAME

> Extends the global Corporate AI Solutions guardrails at `~/.claude/CLAUDE.md`.
> Do not repeat global rules here. Add only what is product-specific.

## Risk Tier

REPLACE — choose one and delete the other two:

- **REGULATED / CONTRACTED** — zero tolerance for convention drift. Compliance logic must be correct, not convenient.
- **REVENUE / CASE STUDY** — high read:edit discipline. Shared module changes require review of all consumers.
- **STANDARD** — flag regressions; tolerate faster iteration.

---

## Portfolio Standard inheritance

This product was scaffolded from `cais-build-template-v2` and ships with all
applicable rules pre-wired. The standard lives at
`cais-shared-services/foundation/PORTFOLIO_STANDARD.md` — that is the source of
truth. Anything below is product-specific overlay only.

What is already wired (do not re-derive):

- **R1** — Auth four-leg pattern via `@caistech/corporate-components/auth` AuthForm
- **R6** — Resend sender pinned to `noreply@updates.corporateaisolutions.com`
- **R9** — RLS scaffolding in `supabase/migrations/0001_init_rls.sql`
- **R10** — `errorResponse()` helper in `lib/errors.ts` — every API route uses it
- **R11** — Vendor identity flows through `NEXT_PUBLIC_VENDOR_*` env vars
- **R12** — `/privacy` and `/terms` stubs at `app/privacy/page.tsx` + `app/terms/page.tsx`
- **R13** — `portfolio-gate` CI workflow at `.github/workflows/gate.yml`
- **R3** — `ExplanatoryHeader` from `@caistech/corporate-components` on every page-level surface

---

## Pre-commit / pre-PR checklist

1. Replace every `REPLACE_*` placeholder in this file, `package.json`, `app/layout.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`.
2. Update `routes.config.json` to your actual top-level routes before the smoke test will pass.
3. Update `auth.config.json` if your auth paths diverge from `/login`, `/signup`, `/forgot-password`.
4. Populate `.env.local` (use `scripts/setup.mjs` to scaffold).
5. Configure the GitHub repo:
   - **Secret** `CAISTECH_PACKAGES_TOKEN` — read:packages PAT (GitHub Actions reserves the `GITHUB_` prefix; the workflow remaps it to env var `GITHUB_PACKAGES_TOKEN` for `.npmrc`).
   - **Variable** `PORTFOLIO_GATE_PREVIEW_URL` — Vercel preview or production URL.
6. First push triggers `portfolio-gate`. A red workflow is a real failure — do not bypass.

---

## Product-specific conventions

REPLACE — add anything that is true for this product and not covered by the
global guardrails or the Portfolio Standard. Examples:

- Stripe webhook signature secret env var name
- Domain-specific naming patterns (e.g. F2K: "modules" vs "products")
- Data-residency requirement (Sydney region for AU customer data)
- Specific personas or user types this product serves
