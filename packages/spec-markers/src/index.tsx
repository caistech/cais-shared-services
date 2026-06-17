/**
 * @caistech/spec-markers — the survey-marker drop-in for EXTERNAL pre-built products.
 *
 * The methodology survey gate verdicts a product (RENOVATION / TEARDOWN / …) by GREPPING 14
 * `data-*` markers out of the product's served landing HTML — it does NOT execute JS, so the
 * markers MUST be server-rendered. A factory-GENERATED product gets them from its build; a
 * HAND-BUILT / pre-existing product has no generator and can't be safely regenerated, so it
 * wires them in instead (the "marker-pass").
 *
 * Products co-located on the pipeline instance use pipeline's own in-app <SpecMarkers/> (reads the
 * card from the DB directly). An EXTERNAL product lives in a separate codebase that can't reach the
 * pipeline DB — so it installs THIS package and drops <SpecMarkers slug="x"/> on its public landing.
 * The component fetches the PUBLIC endpoint `GET <pipeline>/api/public/spec-markers/<slug>` (which
 * returns the already-built `{ attrs }` map) and SSRs them. The marker MAPPING stays single-sourced
 * in pipeline — this package is a thin, decoupled renderer, so the 14 fields can evolve server-side
 * without re-publishing the package.
 *
 * Usage (a Next.js App Router SERVER component — e.g. the landing page):
 *   import { SpecMarkers } from '@caistech/spec-markers'
 *   export default function Landing() {
 *     return (<>
 *       … your landing …
 *       (then render) <SpecMarkers slug="my-product" />
 *     </>)
 *   }
 * Async Server Components type-check cleanly in modern Next; on older TS add a
 * `@ ts-expect-error Async Server Component` line above the tag (see the README for the exact form).
 *
 * Plus a `public/survey-manifest.json` listing the routes the survey should read (union with `/`):
 *   import { buildSurveyManifest } from '@caistech/spec-markers'
 *   write buildSurveyManifest(['/']) -> { "routes": ["/"] } to public/survey-manifest.json
 *
 * Requirements on the card side (or the survey still fails P3): the product's
 * product_validation_status row is filled by the intake coach, including `feasibility.why_now`
 * (P3 = distributor + distributor_outcomes + data-why-now). The endpoint emits data-why-now only
 * when why_now is set.
 */

import type { ReactElement } from 'react'

/** The canonical pipeline deployment that serves the public marker endpoint. Override per-call or
 *  via SPEC_MARKERS_ENDPOINT / NEXT_PUBLIC_PIPELINE_URL when pipeline moves to its own domain. */
export const DEFAULT_PIPELINE_URL = 'https://pipeline-nine-silk.vercel.app'

export interface FetchOpts {
  /** Pipeline base URL (default: DEFAULT_PIPELINE_URL or the SPEC_MARKERS_ENDPOINT / NEXT_PUBLIC_PIPELINE_URL env). */
  pipelineUrl?: string
  /** Full endpoint URL override (wins over pipelineUrl) — e.g. a mock in tests. */
  endpoint?: string
  /** Abort the fetch after this many ms so a slow pipeline never hangs the consumer's render. */
  timeoutMs?: number
}

function resolveEndpoint(slug: string, opts: FetchOpts): string {
  if (opts.endpoint) return opts.endpoint
  const envBase =
    typeof process !== 'undefined' && process.env
      ? process.env.SPEC_MARKERS_ENDPOINT || process.env.NEXT_PUBLIC_PIPELINE_URL || ''
      : ''
  const base = (opts.pipelineUrl || envBase || DEFAULT_PIPELINE_URL).replace(/\/+$/, '')
  return `${base}/api/public/spec-markers/${encodeURIComponent(slug)}`
}

/**
 * Fetch a product's survey marker attributes ({ "data-promise": "…", … }) from the pipeline public
 * endpoint. Degrade-don't-break: returns {} on any failure (network, 404, timeout) so the landing
 * still renders. Uses `cache: 'no-store'` so the markers always reflect the live card.
 */
export async function fetchSpecMarkers(slug: string, opts: FetchOpts = {}): Promise<Record<string, string>> {
  if (!slug || !slug.trim()) return {}
  const url = resolveEndpoint(slug.trim().toLowerCase(), opts)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) return {}
    const data = (await res.json()) as { attrs?: Record<string, string> }
    return data && data.attrs && typeof data.attrs === 'object' ? data.attrs : {}
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}

export interface SpecMarkersProps extends FetchOpts {
  /** The product's cockpit slug (= product_validation_status.product_slug). */
  slug: string
}

/**
 * Async Server Component: renders the product's survey markers as a hidden, content-free div in the
 * SSR'd HTML. Drop it on the public landing (a SERVER component, not a client one — client renders
 * don't reach the no-JS survey). Returns null when the product has no markers yet (degrade-don't-break).
 */
export async function SpecMarkers({ slug, ...opts }: SpecMarkersProps): Promise<ReactElement | null> {
  const attrs = await fetchSpecMarkers(slug, opts)
  if (!attrs || Object.keys(attrs).length === 0) return null
  return <div hidden data-spec-markers={slug} {...attrs} />
}

export default SpecMarkers

/**
 * Build the object to write to `public/survey-manifest.json`. The survey fetches
 * `<mvp_url>/survey-manifest.json`, takes its routes (∪ `/`), fetches each, and greps the markers.
 * Pass the public routes whose HTML carries <SpecMarkers/> (usually just the landing).
 */
export function buildSurveyManifest(routes: string[]): { routes: string[] } {
  const clean = Array.from(new Set((routes || []).map((r) => String(r).trim()).filter(Boolean)))
  return { routes: clean }
}
