/**
 * @caistech/property-services-sdk types.
 * Mirror of the edge function types for TypeScript consumers.
 */

export interface PropertyProfile {
  address: NormalisedAddress
  lot: LotInfo | null
  zoning: ZoningInfo | null
  environment: EnvironmentInfo
  terrain: TerrainInfo | null
  overlays: PlanningOverlay[]
  subdivision: SubdivisionAnalysis | null
  summary: string
  metadata: ProfileMetadata
}

export interface NormalisedAddress {
  full: string
  streetNumber: string
  streetName: string
  suburb: string
  state: string
  postcode: string
  lat: number
  lng: number
}

export interface LotInfo {
  lotSize: number | null
  lotNumber: string | null
  planNumber: string | null
  parcelId: string | null
}

export interface ZoningInfo {
  code: string
  name: string
  description: string | null
  minimumLotSize: number | null
  maximumHeight: number | null
  maximumHeightStoreys: number | null
  setbacks: {
    front: number | null
    side: number | null
    rear: number | null
    notes: string | null
  } | null
  permittedUses: string[]
  subdivisionPermitted: boolean
  modularProvisions: string | null
}

export interface EnvironmentInfo {
  windRegion: string | null
  windSpeed: number | null
  climateZone: string | null
  climateZoneNumber: number | null
  climateDescription: string | null
  bal: string | null
  balInOverlay: boolean
}

export interface TerrainInfo {
  elevationM: number | null    // ground elevation at the parcel (m AHD)
  slopePercent: number | null  // finite-difference slope from the DEM
  fallMeters: number | null    // total fall across the ~60 m sample window
  buildability: string | null  // FLAT / GENTLE / MODERATE / STEEP band + implication
  source: string               // dataset the values came from (e.g. "qld_dem")
}

export interface PlanningOverlay {
  type: string
  name: string
  requirements: string[]
  requiresReport: boolean
}

export interface SubdivisionAnalysis {
  torrens: {
    feasible: boolean
    maxLots: number | null
    minLotSize: number | null
    lotSizeEach: number | null
  }
  strata: {
    feasible: boolean
    minLotSize: number | null
    notes: string
  }
  recommendations: string[]
  warnings: string[]
}

export interface ProfileMetadata {
  sourceApis: string[]
  lgaCode: string | null
  lgaName: string | null
  lgaCoverage: 'full' | 'partial' | 'none'
  cached: boolean
  derivedAt: string
  expiresAt: string
  availableZones?: Array<{ code: string; name: string }>
  /** Present when zoning is null — how the operator looks the zone up by hand. */
  zoningManualLookup?: {
    source: string
    url: string
    instructions: string
  }
}

export interface SuitabilityAssessment {
  suitable: boolean
  confidence: 'high' | 'medium' | 'low'
  verdict: string
  zoningCompatibility: {
    compatible: boolean
    details: string
    permittedAs: string | null
  }
  overlayImpacts: Array<{
    overlay: string
    impact: 'blocking' | 'requires_action' | 'minor' | 'none'
    detail: string
  }>
  requirements: string[]
  risks: string[]
  recommendations: string[]
  nextSteps: string[]
}

export interface DeriveResponse {
  success: boolean
  data?: PropertyProfile
  lookupId?: string
  error?: string
}

export interface AssessResponse {
  success: boolean
  data?: SuitabilityAssessment
  error?: string
}

// ─── Price comparison (Domain-backed) ───────────────────────────

export interface PriceEstimate {
  lower: number | null
  mid: number | null
  upper: number | null
  /**
   * The source's confidence descriptor, carried raw. For Domain this is
   * `priceConfidence` — a descriptive enum (e.g. 'confident', 'recentlySold',
   * 'historic', 'notAvailable'), NOT a high/med/low scale. The UI maps it to a
   * friendly label/colour.
   */
  confidence: string | null
  estimateDate: string | null
  propertyId: string | null
  source: 'domain'
}

export interface ComparableSale {
  address: string
  suburb: string
  salePrice: number
  saleDate: string
  landAreaSqm: number | null
  floorAreaSqm: number | null
  bedrooms: number | null
  bathrooms: number | null
  parking: number | null
  distanceKm: number | null
  pricePerSqm: number | null
}

export interface PriceComparison {
  estimate: PriceEstimate | null
  comparables: ComparableSale[]
  stats: {
    median: number | null
    medianPricePerSqm: number | null
    count: number
  } | null
  unavailableReason?: string
}

export interface ComparablesResponse {
  success: boolean
  data?: PriceComparison
  error?: string
}

// ─── Site dossier (one-call aggregate) ──────────────────────────

/**
 * A field the engine cannot auto-source (title, contamination, servicing, native
 * title, on-site survey) — carried in the dossier as a disciplined placeholder for
 * the responsible panel professional. Once someone writes it back via `/contribute`,
 * `status` flips to `completed` and `completed` is populated.
 */
export interface PlannerReviewItem {
  key: string        // stable field key a contribution is matched on
  field: string      // display label
  discipline: string
  status: 'for_panel_review' | 'completed'
  note: string
  completed?: {
    summary: string
    contributor: string | null
    source: string | null
    date: string
    value?: unknown
  }
}

/** A field written back for a parcel by a panel professional (as surfaced in a dossier). */
export interface Contribution {
  field: string
  summary: string
  contributor: string | null
  discipline: string | null
  source: string | null
  value?: unknown
  createdAt: string
  expiresAt: string | null
}

// ─── Servicing requirement set (derived on read) ────────────────

/**
 * The servicing (utility-connection) requirement set for a lot, DERIVED ON READ from the
 * human-attested `servicing_type` (sewered / unsewered) + the canonical `servicing_requirements`
 * mapping in property-services. The human attests only the circumstance; property-services expands
 * it into the authority applications the lot must lodge. Because it's derived (not snapshotted), a
 * REGULATED lodgement requirement can never silently expire.
 *
 * Consumers (F2K-Checkpoint, DealFindrs) READ this — they never hardcode the sewered/unsewered ⇒
 * authorities mapping themselves.
 */
export type ServicingType = 'sewered' | 'unsewered'
export type ServicingAuthorityKind = 'state_fixed' | 'lga_env_health'
export type ServicingCoverage = 'covered' | 'state_not_covered' | 'council_unresolved'

/** One authority application a lot must lodge, resolved for the specific site. */
export interface ServicingRequirement {
  /** stable key, e.g. 'water_corp' | 'western_power' | 'nbn' | 'council_env_health' */
  authority: string
  /** state_fixed = a state-level authority; lga_env_health = resolved to the lot's council */
  authorityKind: ServicingAuthorityKind
  /** display label; the actual council name is substituted for lga_env_health authorities */
  authorityLabel: string
  applicationType: string
  /** what the lodgement gates, e.g. 'building_permit' | 'construction' */
  blocks: string | null
}

/** The full determination: the attested circumstance + its expanded requirement set. */
export interface ServicingDetermination {
  servicingType: ServicingType
  attestedBy: string | null
  attestedAt: string
  state: string | null
  requirements: ServicingRequirement[]
  /** covered = fully resolved; state_not_covered / council_unresolved = honest degrade (see note) */
  coverage: ServicingCoverage
  note: string | null
}

/**
 * The consolidated site dossier — one call aggregates profile + AI assessment + price
 * position + the panel-review checklist + any prior write-backs. Every section is
 * fail-open: a leg that errors leaves its section `null` and the dossier still returns.
 */
export interface SiteDossier {
  address: string
  generatedAt: string
  profile: PropertyProfile | null
  assessment: SuitabilityAssessment | null
  price: PriceComparison | null
  plannerReview: PlannerReviewItem[]
  contributions: Contribution[]
  /** The servicing requirement set derived from the attested servicing_type; null/absent until the
   *  panel answers "sewered / unsewered". Present from SDK 0.8.0 + the servicing_requirements engine. */
  servicing?: ServicingDetermination | null
  meta: {
    useCase: string | null
    sources: string[]
    engineFieldsFilled: number
    reviewCompleted: number
  }
}

export interface DossierResponse {
  success: boolean
  data?: SiteDossier
  error?: string
}

/**
 * Response of the lightweight `contributions()` read — the panel-review checklist (merged with any
 * write-backs → completed) + the raw contributions, WITHOUT the derive/assess/AVM legs that
 * `dossier()` runs. Prefer this when you only need the panel review + write-backs.
 */
export interface ContributionsResponse {
  success: boolean
  plannerReview: PlannerReviewItem[]
  contributions: Contribution[]
  /** Servicing requirement set derived on read. In this lightweight endpoint the LGA isn't
   *  resolved, so an unsewered lot's council authority reads as "council TBD"
   *  (coverage: 'council_unresolved'); use `dossier()` for the council-resolved determination.
   *  Present from SDK 0.8.0 + the servicing_requirements engine. */
  servicing?: ServicingDetermination | null
  error?: string
}

// ─── Address autocomplete ───────────────────────────────────────

export interface AddressSuggestion {
  label: string
  lat: number
  lng: number
  suburb: string
  state: string
  postcode: string
}

export interface SuggestResponse {
  success: boolean
  suggestions: AddressSuggestion[]
  error?: string
}

// ─── Professional write-back (/contribute) ──────────────────────

/**
 * A completed field written back to the parcel. Either `parcelId` OR `address` is
 * required (the parcel key is preferred; address is the fallback). `field` must be one
 * of the known keys: title · contamination · servicing · native_title · survey_geotech,
 * or an engine-value correction: zoning · lot_size · flood · bushfire · heritage ·
 * character · other.
 */
export interface ContributeInput {
  field: string
  summary: string
  parcelId?: string
  address?: string
  lat?: number
  lng?: number
  state?: string
  value?: unknown
  contributor?: string
  discipline?: string
  source?: string
  /** ISO timestamp after which this write-back should stop resolving (optional TTL). */
  expiresAt?: string
}

/** The stored contribution row returned by `/contribute` (DB shape, snake_case). */
export interface ContributionRecord {
  id: string
  parcel_id: string | null
  address_normalised: string | null
  lat: number | null
  lng: number | null
  state: string | null
  field: string
  value: unknown
  summary: string
  contributor: string | null
  discipline: string | null
  source: string | null
  status: string
  created_at: string
  expires_at: string | null
}

export interface ContributeResponse {
  success: boolean
  contribution?: ContributionRecord
  error?: string
}
