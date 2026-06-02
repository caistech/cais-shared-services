# Promote recurring compliance issues UPSTREAM — placement guide (2026-06-03)

These make the three recurring validation findings stop appearing on NEW products by building the
requirement into the template + design-build standards. After this, a freshly scaffolded product
starts compliant and the Metadata / Security Headers / GTM checks pass on first survey.

## 1. OG image metadata  → template `app/layout.tsx`  (Class A)
Replace `templates/cais-build-template-v2/app/layout.tsx` with **template-layout.tsx**.
- Adds `openGraph` + `twitter` + `icons` to the exported metadata, and `metadataBase` from
  `NEXT_PUBLIC_SITE_URL` (per-product env; falls back safely if unset).
- **Also add two placeholder assets to the template `/public`** so the references resolve:
  - `public/og-image.png` (1200x630 — a neutral placeholder; replaced per product)
  - `public/favicon.ico`
  (If `/public` doesn't exist in the template yet, create it. Without og-image.png present the
  tag points at a 404 — still passes the "tag exists" check, but ship a real placeholder.)

## 2. Security headers  → template `next.config.js`  (Class A)
Replace `templates/cais-build-template-v2/next.config.js` with **template-next.config.js**.
- Adds a `headers()` block: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS,
  Permissions-Policy, and a baseline Content-Security-Policy.
- Preserves the existing `reactStrictMode` + `transpilePackages` config.
- ⚠️ **VERIFY the CSP against a real product build** before locking it: deploy a scaffolded product,
  open the console, confirm no CSP violations break images/fonts/Supabase. The baseline permits
  `self`, data/blob images, https img, Supabase ws/https, and the unsafe-inline/eval Next needs.
  Too strict = breaks the app (a NEW recurring failure); too loose = fails the check. Tune carefully.

## 3. Distribution loop  → design-build standard  (Class B)  ✅ DONE in design-build.yml
Already added to `design-build.yml` (the staged copy) as a hard rule: "DISTRIBUTION LOOP REQUIRED".
- It's node 7 of the Ideation Chain (the channel); the GTM auditor checks for it.
- This is generative (the agent builds an appropriate loop per product), not a config patch — so it
  lives in the design-build standards, not the template. Commit the updated design-build.yml.
- Consider also making it a derived spec requirement once the Ideation Chain layer exists.

## After placing
- Scaffold/build a test product (or re-survey an existing fresh one) and confirm Metadata +
  Security Headers pass without a Fix, and GTM finds a distribution loop.
- That makes the assumption "we shouldn't see these issues anymore" actually TRUE — they're now in
  the build inputs, not discovered downstream.
- Remaining recurring-issue promotions follow the same pattern as they're found (the self-healing
  classify-on-card loop automates this once Track B builds it).
