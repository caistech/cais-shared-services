/**
 * @caistech/business-registry — Public surface.
 */

export { createRegistry } from './registry';
export type { BusinessRegistry } from './registry';
export { createStubProvider, createTianyanchaProvider } from './providers';
export {
  validateRegistrationNumber,
  validateUSCC,
  validateMST,
  validateSSM,
  validateABN,
  validateNIB,
} from './validators';
export type {
  CountryCode,
  RegistryStatus,
  BusinessLookupRequest,
  BusinessLookupMatch,
  BusinessLookupResult,
  RegistryProvider,
  ValidatorResult,
} from './types';
