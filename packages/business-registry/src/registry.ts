/**
 * @caistech/business-registry — Multi-provider registry orchestrator.
 */

import type {
  BusinessLookupRequest,
  BusinessLookupResult,
  RegistryProvider,
  CountryCode,
} from './types';

export interface BusinessRegistry {
  lookup(req: BusinessLookupRequest): Promise<BusinessLookupResult>;
  hasProvider(country: CountryCode): boolean;
}

/**
 * Compose a registry from one or more country-specific providers.
 * Lookup dispatches to the matching provider by country code.
 *
 * If no provider exists for the requested country, returns a NOT_IMPLEMENTED
 * error rather than throwing — keeps callers' error handling uniform.
 */
export function createRegistry(providers: RegistryProvider[]): BusinessRegistry {
  const byCountry = new Map<CountryCode, RegistryProvider>();
  for (const p of providers) {
    byCountry.set(p.country, p);
  }

  return {
    hasProvider(country) {
      return byCountry.has(country);
    },
    async lookup(req) {
      const provider = byCountry.get(req.country);
      if (!provider) {
        return {
          found: false,
          matched: null,
          source: { provider: 'none', queried_at: new Date().toISOString() },
          warnings: [],
          error: {
            code: 'NOT_IMPLEMENTED',
            message: `No registry provider configured for country '${req.country}'`,
          },
        };
      }
      return provider.lookup(req);
    },
  };
}
