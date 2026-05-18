/**
 * @caistech/business-registry — Public surface.
 */

export { createRegistry } from './registry.js';
export type { BusinessRegistry } from './registry.js';
export { createStubProvider, createTianyanchaProvider } from './providers.js';
export {
  validateRegistrationNumber,
  validateUSCC,
  validateMST,
  validateSSM,
  validateABN,
  validateNIB,
} from './validators.js';
export type {
  CountryCode,
  RegistryStatus,
  BusinessLookupRequest,
  BusinessLookupMatch,
  BusinessLookupResult,
  RegistryProvider,
  ValidatorResult,
} from './types.js';
