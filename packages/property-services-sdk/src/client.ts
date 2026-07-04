/**
 * Property Services API client.
 * Lightweight fetch-based client — no axios dependency.
 */
import type {
  PropertyProfile,
  SuitabilityAssessment,
  DeriveResponse,
  AssessResponse,
  ComparablesResponse,
  DossierResponse,
  SuggestResponse,
  ContributeInput,
  ContributeResponse,
} from './types'

export interface PropertyServicesConfig {
  /** Supabase project URL for property-services */
  supabaseUrl: string
  /**
   * Property-services API key (issued from the property-services Supabase
   * `api_keys` table). Required for any function deployed with
   * `--no-verify-jwt` (i.e. all functions from 2026-04-30 onward). Sent as
   * the `X-API-Key` header.
   */
  apiKey?: string
  /**
   * Supabase anon key. Optional — only needed for legacy deployments where
   * `verify_jwt = true`. From the 2026-04-30 release onward, functions are
   * deployed `--no-verify-jwt` and authenticate via `apiKey` instead.
   * Kept for backwards compatibility during transition.
   */
  supabaseAnonKey?: string
  /** Which product is calling (for tailored AI assessment) */
  product?: 'f2k' | 'dealfindrs' | 'mmcbuild'
}

export class PropertyServicesError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'PropertyServicesError'
    this.status = status
    this.body = body
  }
}

export class PropertyServicesClient {
  private baseUrl: string
  private headers: Record<string, string>
  private product?: string

  constructor(config: PropertyServicesConfig) {
    this.baseUrl = `${config.supabaseUrl}/functions/v1`
    this.product = config.product

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey
    }
    if (config.supabaseAnonKey) {
      headers['Authorization'] = `Bearer ${config.supabaseAnonKey}`
      headers['apikey'] = config.supabaseAnonKey
    }
    this.headers = headers
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
    return this.request<DeriveResponse>('/derive', params)
  }

  /**
   * AI suitability assessment — check use case against property data.
   */
  async assess(params: {
    lookupId?: string
    profile?: PropertyProfile
    useCase: string
  }): Promise<AssessResponse> {
    return this.request<AssessResponse>('/assess', {
      ...params,
      product: this.product,
    })
  }

  /**
   * Address-driven price comparison — Domain AVM estimate for the subject
   * property (+ a comparables list when the data source's sold-listings tier
   * is available). Resolves the propertyId server-side; pass the same address
   * string you used for `derive`.
   */
  async comparables(params: {
    address: string
    suburb?: string
    state?: string
    postcode?: string
  }): Promise<ComparablesResponse> {
    return this.request<ComparablesResponse>('/comparables', params)
  }

  /**
   * The consolidated site dossier — ONE call returns profile + AI assessment + price
   * position + the panel-review checklist + any prior write-backs. Every section is
   * fail-open (a failing leg leaves its section null; the dossier still returns), so
   * prefer this over stitching `derive` + `assess` + `comparables` yourself.
   */
  async dossier(params: {
    address: string
    lat?: number
    lng?: number
    suburb?: string
    state?: string
    postcode?: string
    useCase?: string
  }): Promise<DossierResponse> {
    return this.request<DossierResponse>('/dossier', {
      ...params,
      product: this.product,
    })
  }

  /**
   * AU address autocomplete — up to 6 suggestions for a partial address. Wire this to
   * any address input to kill wrong-locality geocodes at the source. Returns an empty
   * list for queries shorter than 3 characters.
   */
  async suggest(query: string): Promise<SuggestResponse> {
    return this.request<SuggestResponse>('/suggest', { q: query })
  }

  /**
   * Professional write-back — persist a completed field (title, contamination,
   * servicing, native title, on-site survey) or an engine-value correction to the
   * parcel, so the next `dossier()` for that property surfaces it instead of asking
   * again. Pass either `parcelId` or `address`.
   */
  async contribute(params: ContributeInput): Promise<ContributeResponse> {
    return this.request<ContributeResponse>('/contribute', params)
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      let parsed: unknown = null
      let raw = ''
      try {
        raw = await res.text()
        parsed = raw ? JSON.parse(raw) : null
      } catch {
        parsed = raw
      }
      const message = extractMessage(parsed) ?? `${res.status} ${res.statusText}`
      throw new PropertyServicesError(res.status, message, parsed)
    }

    return (await res.json()) as T
  }
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.message === 'string') return b.message
  if (typeof b.error === 'string') return b.error
  return null
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
