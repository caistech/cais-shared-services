/**
 * @caistech/business-registry — Types.
 */

export type CountryCode = 'CN' | 'VN' | 'MY' | 'AU' | 'ID' | 'TH' | 'PH';

export type RegistryStatus =
  | 'active'
  | 'inactive'
  | 'deregistered'
  | 'in_liquidation'
  | 'abnormal'
  | 'suspended'
  | 'unknown';

export interface BusinessLookupRequest {
  country: CountryCode;
  /** The registration number in the country's native format. */
  registrationNumber: string;
  /** Optional name for cross-checking. If provided, lookup result includes name match score. */
  legalName?: string;
}

export interface BusinessLookupMatch {
  legal_name: string;
  /** Native-script name (e.g. simplified Chinese). */
  legal_name_native: string | null;
  registration_number: string;
  status: RegistryStatus;
  established_date: string | null;
  registered_address: string | null;
  business_scope: string | null;
  legal_representative: string | null;
  registered_capital: { amount: number; currency: string } | null;
  /** 0-1 — how well the legalName field in the request matches the registry record. */
  name_match_score: number | null;
}

export interface BusinessLookupResult {
  /** True when the registration number exists in the registry. */
  found: boolean;
  /** Populated when found===true. */
  matched: BusinessLookupMatch | null;
  /** Provider metadata. */
  source: {
    provider: string;
    queried_at: string;
    /** Reference to raw provider response, stored separately for audit. */
    raw_response_ref?: string;
  };
  /** Format / data quality warnings. */
  warnings: string[];
  /** When the provider could not reach the registry, this carries the error. */
  error?: {
    code: 'PROVIDER_UNAVAILABLE' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'NOT_IMPLEMENTED' | 'INVALID_FORMAT';
    message: string;
  };
}

export interface RegistryProvider {
  /** ISO country code this provider handles. */
  country: CountryCode;
  /** Human-readable provider name (for source attribution). */
  name: string;
  lookup(req: BusinessLookupRequest): Promise<BusinessLookupResult>;
}

export interface ValidatorResult {
  valid: boolean;
  /** When invalid: short reason. */
  reason?: string;
  /** Parsed components when format is recognised. */
  parsed?: Record<string, string>;
}
