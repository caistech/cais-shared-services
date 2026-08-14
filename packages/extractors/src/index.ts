export {
  extractProfile,
  stripHtmlToText,
  isExtractionError,
  fetchPage,
  isFetchPageError,
} from './profile-extractor.js';
export type {
  BusinessProfile,
  ServiceInfo,
  SocialLinks,
  ProfileExtractorOptions,
  ExtractionError,
  FetchPageOptions,
  FetchedPage,
  FetchPageError,
} from './profile-extractor.js';

export { extractSocialProfiles } from './social-extractor.js';
export type {
  SocialProfile,
  SocialExtractionResult,
  SocialExtractorOptions,
} from './social-extractor.js';

export {
  describeProductForSupport,
  isProductExtractionError,
} from './product-extractor.js';
export type {
  ProductSupportProfile,
  ProductKeyFeature,
  ProductFile,
  ProductExtractorInput,
  ProductExtractorOptions,
} from './product-extractor.js';
