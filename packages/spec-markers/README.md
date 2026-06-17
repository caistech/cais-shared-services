# @caistech/spec-markers

Survey-marker drop-in for **external pre-built products** — products in their own codebase that
can't read the pipeline DB but still need to pass the methodology **survey gate**.

The survey verdicts a product (RENOVATION / TEARDOWN / INCOMPLETE-SPEC / UNREADABLE) by **grepping
14 `data-*` markers from the served landing HTML**. It does **not** run JS, so the markers must be
**server-rendered**. This package SSRs them, sourced live from the product's pipeline card via the
public endpoint `GET <pipeline>/api/public/spec-markers/<slug>`.

## Install

```bash
npm install @caistech/spec-markers
```

(GitHub Packages registry — `@caistech:registry=https://npm.pkg.github.com`, `NODE_AUTH_TOKEN`.)

## Use (Next.js App Router)

Drop the component on your **public landing** — it must be a **Server Component**:

```tsx
import { SpecMarkers } from '@caistech/spec-markers'

export default function Landing() {
  return (
    <>
      {/* …your landing… */}
      {/* @ts-expect-error Async Server Component */}
      <SpecMarkers slug="my-product" />
    </>
  )
}
```

Add `public/survey-manifest.json` listing the routes whose HTML carries the markers (the survey
reads these ∪ `/`):

```json
{ "routes": ["/"] }
```

(or generate it with `buildSurveyManifest(['/'])`).

## Configuration

- **slug** (required) — the product's cockpit slug (`product_validation_status.product_slug`).
- **pipelineUrl** / `SPEC_MARKERS_ENDPOINT` / `NEXT_PUBLIC_PIPELINE_URL` — override the pipeline base
  URL (default `https://pipeline-nine-silk.vercel.app`).
- **timeoutMs** — abort the fetch after N ms (default 4000) so a slow pipeline never hangs the render.

## Requirements on the card side

The product's `product_validation_status` row must be filled (by the intake coach), **including
`feasibility.why_now`** — the survey's PRE-HARD **P3** = distributor + distributor_outcomes +
`data-why-now`. The endpoint emits `data-why-now` only when `why_now` is set; without it P3 fails
and the product verdicts TEARDOWN despite an otherwise-complete spec.

## How it differs from pipeline's in-app `<SpecMarkers/>`

Pipeline's own component reads the card from the DB directly (same-instance). This package fetches
the **public endpoint** instead (external codebases can't reach the DB). Both render the identical
hidden marker div; the marker **mapping** stays single-sourced server-side in pipeline, so this
package is a thin renderer that never drifts.

## API

- `SpecMarkers({ slug, pipelineUrl?, endpoint?, timeoutMs? })` — async Server Component.
- `fetchSpecMarkers(slug, opts?)` → `Promise<Record<string,string>>` — the raw attrs (non-React use).
- `buildSurveyManifest(routes)` → `{ routes }` — for `public/survey-manifest.json`.
