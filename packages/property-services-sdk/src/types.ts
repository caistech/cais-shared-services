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
