# ABN Lookup (Australian Business Register)

Company-name search + ABN lookup via the official ABR JSON API.

This directory is **split**: the route is a published export, the field is still
copy-paste. That split is deliberate — see below.

## The route — IMPORT IT, don't copy it

`route.ts` is published as `@caistech/corporate-components/abn-lookup`. It is
web-standard `Request`/`Response`, so the package needs no `next` dependency and
a Next.js App Router handler satisfies the signature directly.

```ts
// app/api/abn-lookup/route.ts
export { GET } from "@caistech/corporate-components/abn-lookup";

// REQUIRED. Route-segment config cannot travel through a re-export, and some
// Next versions prerender this handler as STATIC — which freezes one response
// and breaks every lookup. (Seen for real: BucketLyst built it `ƒ` dynamic,
// DealFindrs built the identical file `○` static.) Pin it per consumer.
export const dynamic = "force-dynamic";
```

Override the GUID (multi-tenant, tests):

```ts
import { createAbnLookupRoute } from "@caistech/corporate-components/abn-lookup";
export const { GET } = createAbnLookupRoute({ guid: process.env.TENANT_ABR_GUID });
```

### Response contract

| Case | Status | Body |
|---|---|---|
| No `ABR_GUID` configured | 200 | `{ configured: false }` |
| `?name=…` (min 2 chars) | 200 | `{ configured: true, results: [...] }` |
| `?abn=…` found | 200 | `{ configured: true, found: true, ...AbrLookupResult }` |
| `?abn=…` not found | 404 | `{ configured: true, found: false }` |
| ABR error / outage | 502 | `{ configured: true, error }` |
| Neither param | 400 | `{ error }` |

**The unconfigured case is a 200, not a 500** (the earlier `api-route.ts`
returned 500). A missing GUID is an operator configuration gap, not the
applicant's fault, and it must not break a form they are halfway through. The
caller checks `configured` and shows nothing extra — never a guessed entity
name (degrade-don't-fake).

## The field — still copy-paste

`AbnLookupField.tsx` imports the consumer's shadcn/ui components via their own
`@/` tsconfig paths (`@/components/ui/input`, `label`, `badge`), which cannot
resolve inside this package. It is excluded from the build for that reason. Copy
it to `src/components/common/abn-lookup-field.tsx` and point it at your
`/api/abn-lookup` route.

Promoting it properly means making those three inputs injectable or inlining
them — worth doing, not yet done.

## Dependencies

- Route: `@caistech/abn-lookup` + `ABR_GUID` env var (register free at
  abr.business.gov.au/Tools/WebServices). The GUID is a credential — server-side
  only, never `NEXT_PUBLIC_`.
- Field (copy-paste): the above, plus `lucide-react` and shadcn/ui
  `Input`/`Label`/`Badge`.

## Field features

- Search by company name (debounced 400ms, min 2 chars)
- Auto-detect 11-digit ABN input (debounced 300ms)
- ABN checksum validation (mod 89) + formatting (XX XXX XXX XXX)
- Active/inactive status badge
- Auto-populates hidden form fields (entity name, type, ACN, state, postcode)

## History

Extracted 2026-07-25 after the same route was found duplicated three times
(this package, DealFindrs, BucketLyst) — the "convergent shape, then extract"
trigger in `SHARED_SERVICES.md`.
