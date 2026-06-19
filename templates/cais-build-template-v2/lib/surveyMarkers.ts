// Build-side survey-marker helper — the planting twin of the cockpit's survey-markers deriver.
// Contract: SURVEY_MARKER_CONTRACT.md. This file is the ONLY way markers get into a build.
//
// Why a helper instead of hand-written `data-*` attributes:
//   - Values come from the product card (_spec.json fields), so the marker and the visible copy
//     are two renderings of one source — they cannot drift (the original DealFindrs trap).
//   - A generic NAMED value (the `reseller` bug) or an off-enum stage THROWS at `next build` —
//     so an incoherent build fails BEFORE a PR can open. The helper is the coherence lint.
//   - The cockpit survey greps exactly these attribute names with the same banlist/enum, so a
//     build that compiles is a build the survey can score deterministically.
//
// Usage (the agent spreads the props onto the element that renders that field's visible copy):
//   import { markerProps, surveyManifest } from '@/lib/surveyMarkers'
//   <section {...markerProps('icp_partner_type', card.icp_partner_type)}>
//     For {card.icp_partner_type} …            // copy from the SAME card field
//   </section>
//
// Promote to @caistech/corporate-components later so it can't drift per-product.

export type SurveyMarkerField =
  | 'promise' | 'friction' | 'core_mechanism'
  | 'icp_geography' | 'icp_partner_type' | 'icp_buyer_title' | 'icp_verticals'
  | 'icp_company_size' | 'icp_stage' | 'exclusions'
  | 'distributor' | 'distributor_outcomes' | 'end_user' | 'end_user_outcomes'
  | 'why_now' // P3-only; not a scored field

const ATTR: Record<SurveyMarkerField, string> = {
  promise: 'data-promise',
  friction: 'data-friction',
  core_mechanism: 'data-core-mechanism',
  icp_geography: 'data-icp-geography',
  icp_partner_type: 'data-icp-partner-type',
  icp_buyer_title: 'data-icp-buyer-title',
  icp_verticals: 'data-icp-verticals',
  icp_company_size: 'data-icp-company-size',
  icp_stage: 'data-icp-stage',
  exclusions: 'data-exclusions',
  distributor: 'data-distributor',
  distributor_outcomes: 'data-distributor-outcomes',
  end_user: 'data-end-user',
  end_user_outcomes: 'data-end-user-outcomes',
  why_now: 'data-why-now',
}

// NAMED fields must carry a named archetype, never a generic category (the P2 standard).
const NAMED: ReadonlySet<SurveyMarkerField> = new Set<SurveyMarkerField>([
  'icp_partner_type', 'icp_buyer_title', 'icp_verticals', 'distributor', 'end_user',
])

// ENUM fields must be one of a closed set.
const ENUM: Partial<Record<SurveyMarkerField, readonly string[]>> = {
  icp_stage: ['seed', 'growth', 'scale', 'operating-business', 'enterprise'],
}

// Identical to the cockpit deriver's banlist — keep in lockstep (both trace to the contract §3).
const BANLIST: ReadonlySet<string> = new Set([
  'smbs', 'smb', 'sme', 'businesses', 'business', 'users', 'user',
  'customers', 'customer', 'companies', 'company', 'clients', 'client',
  'partners', 'partner', 'resellers', 'reseller', 'distributors', 'distributor',
  'buyers', 'sellers', 'any', 'any-industry', 'all-industries',
  'everyone', 'anyone', 'general', 'generic',
])

/** Deterministic slug — must match how the survey reads values (lowercase kebab). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Spreadable marker props for one field, derived from its card value. THROWS at build time if:
 *   - the value is empty (a field with no card content can't be marked),
 *   - a NAMED field's slug is in the banlist (generic — the `reseller` class), or
 *   - an ENUM field's slug is off-set.
 * A thrown error fails `next build`, so the PR never opens on an incoherent build.
 */
export function markerProps(
  field: SurveyMarkerField,
  value: string | null | undefined,
): Record<string, string> {
  const raw = (value ?? '').trim()
  if (!raw) {
    throw new Error(
      `[survey-marker] ${field}: empty card value — cannot plant ${ATTR[field]}. ` +
        `Fill this field on the card, or do not render a section claiming it.`,
    )
  }
  const slug = slugify(raw)

  if (NAMED.has(field) && BANLIST.has(slug)) {
    throw new Error(
      `[survey-marker] ${field}="${slug}" is a generic value (banlisted). ` +
        `Use the NAMED archetype from the card (e.g. "buyers-agent-firm", not "reseller"). ` +
        `This is the P2 standard — a generic value fails the survey deterministically.`,
    )
  }
  const set = ENUM[field]
  if (set && !set.includes(slug)) {
    throw new Error(
      `[survey-marker] ${field}="${slug}" is off-enum. Allowed: ${set.join(' | ')}.`,
    )
  }
  return { [ATTR[field]]: slug }
}

/**
 * Build the route manifest the survey fetches first (SURVEY_MARKER_CONTRACT §4). Write the
 * returned string to `public/survey-manifest.json`. List EVERY route that carries a marker —
 * the survey greps the union of their DOM, so a missing route hides its markers.
 *
 * CRITICAL: this manifest AND every route it lists must be PUBLICLY served (in the middleware
 * PUBLIC_PATHS / not behind the auth gate). The survey fetches them UNAUTHENTICATED — an auth
 * redirect makes it read redirect HTML instead of the markers, a false TEARDOWN below 14/14
 * (this capped executorai at 9/14 when /partners + this manifest were auth-redirected).
 */
export function surveyManifest(routes: string[]): string {
  const clean = Array.from(
    new Set(routes.map((r) => (r.startsWith('/') ? r : `/${r}`))),
  )
  if (!clean.includes('/')) clean.unshift('/')
  return JSON.stringify({ routes: clean }, null, 2) + '\n'
}