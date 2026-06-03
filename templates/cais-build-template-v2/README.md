# cais-build-template-v2

Corporate AI Solutions new-product scaffold. Inherits Portfolio Standard v1.0
out of the box — every rule that can be enforced at scaffold time is wired in.

## What you get on day one

| Rule | Pre-wired in |
|---|---|
| R1 — Auth four-leg pattern | `app/(auth)/{login,signup,forgot-password,reset-password}/page.tsx` using `@caistech/corporate-components/auth` |
| R3 — Explanatory header on every page | `<ExplanatoryHeader/>` in `app/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx` |
| R6 — Resend sender canonicalised | `.env.example` pins `RESEND_FROM_EMAIL=noreply@updates.corporateaisolutions.com` |
| R9 — RLS-on-by-default | `supabase/migrations/0001_init_rls.sql` with the canonical pattern + audit |
| R10 — No verbatim Postgres errors | `lib/errors.ts` `errorResponse()` helper |
| R11 — No vendor-identity leak | `.env.example` `NEXT_PUBLIC_VENDOR_*` placeholders; defaults vendor-neutral |
| R12 — Privacy + Terms pages | `/privacy`, `/terms` with the full eight-section structure |
| R13 — CI smoke + audits | `.github/workflows/gate.yml` + `routes.config.json` + `auth.config.json` |
| R14 — Security headers (CSP/HSTS/X-Frame-Options) | next.config.js headers() block — passes the Security Headers compliance check on first survey |
| R15 — OG / Twitter / favicon metadata | app/layout.tsx metadata (openGraph + twitter + icons), env-driven via NEXT_PUBLIC_SITE_URL — passes the Metadata compliance check on first survey |

Security headers & the expected vercel.live console warning
next.config.js ships a strict Content-Security-Policy (see the headers() block): script-src
allows only 'self' plus the inline/eval Next needs. Every product inherits it, which is why new
products pass the Security Headers compliance check on first survey.
On Vercel deployments you will see this console warning — it is expected and harmless:

Loading the script 'https://vercel.live/_next-live/feedback/feedback.js' violates … CSP directive:
"script-src 'self' …". The action has been blocked.

vercel.live is Vercel's own preview/feedback widget, injected by the platform — not your app. The
CSP is correctly blocking a third-party script; your pages, images, fonts, and Supabase all work
under the policy, and real users on a custom domain never see the warning. Do not loosen the CSP to
silence it. If you specifically want the widget on previews, add https://vercel.live to
script-src — but leaving it blocked is the recommended default.
## Bootstrap a new product

```bash
# 1. Copy the template (adjust the destination)
cp -R cais-shared-services/templates/cais-build-template-v2 ../my-new-product
cd ../my-new-product

# 2. Run the setup helper
node scripts/setup.mjs

# 3. Install + dev
export GITHUB_PACKAGES_TOKEN=<your-ghp-or-pat>
npm install
npm run dev
```

Then:

- Replace every `REPLACE_*` placeholder.
- Configure repo secret + variable (see `CLAUDE.md` checklist).
- Wire `portfolio-gate-audit-rls` + `audit-vendor-leak` into your local
  pre-commit if you want them firing before push, not only in CI.

## What you still need to do

Things that can't be scaffolded because they're product-specific:

- The actual product surfaces (`app/dashboard/...`, business logic, etc).
- Real privacy + terms copy (the stubs name the operator as `REPLACE`).
- Tables in `supabase/migrations/` with RLS scoped to the owner.
- ICP / persona docs under `docs/`.
- Brand assets — REQUIRED:replace the placeholder public/og-image.png (1200x630) and
public/favicon.ico. app/layout.tsx references both; if they're missing the OG/favicon
tags resolve to 404s. (Logo + other brand art as needed.) 
