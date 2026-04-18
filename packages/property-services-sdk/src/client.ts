/**
 * Property Services API client.
 * Lightweight fetch-based client — no axios dependency.
 */
import type { PropertyProfile, SuitabilityAssessment, DeriveResponse, AssessResponse } from './types'

export interface PropertyServicesConfig {
  /** Supabase project URL for property-services */
  supabaseUrl: string
  /** Supabase anon key */
  supabaseAnonKey: string
  /** Which product is calling (for tailored AI assessment) */
  product?: 'f2k' | 'dealfindrs' | 'mmcbuild'
}

export class PropertyServicesClient {
  private baseUrl: string
  private headers: Record<string, string>
  private product?: string

  constructor(config: PropertyServicesConfig) {
    this.baseUrl = `${config.supabaseUrl}/functions/v1`
    this.product = config.product
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      apikey: config.supabaseAnonKey,
    }
  }

  /**
   * Derive full property profile from an address.
   * If lat/lng are known (from Mapbox autocomplete), pass them to skip re-geocoding.
   */
  async derive(params: {
    address: string
    lat?: number
    lng?: number
    suburb?: string
    state?: string
    postcode?: string
  }): Promise<DeriveResponse> {
    const res = await fetch(`${this.baseUrl}/derive`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(params),
    })
    return res.json()
  }

  /**
   * AI suitability assessment — check use case against property data.
   */
  async assess(params: {
    lookupId?: string
    profile?: PropertyProfile
    useCase: string
  }): Promise<AssessResponse> {
    const res = await fetch(`${this.baseUrl}/assess`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        ...params,
        product: this.product,
      }),
    })
    return res.json()
  }
}

/**
 * Create a configured client for a specific product.
 * Config is required — caller passes URL/key explicitly.
 */
export function createPropertyServices(
  config: PropertyServicesConfig
): PropertyServicesClient {
  return new PropertyServicesClient(config)
}
