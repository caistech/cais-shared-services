/**
 * @caistech/property-services-sdk
 *
 * Shared property intelligence for F2K-Checkpoint, DealFindrs, MMC Build.
 */

// Types
export type {
  PropertyProfile,
  NormalisedAddress,
  LotInfo,
  ZoningInfo,
  EnvironmentInfo,
  PlanningOverlay,
  SubdivisionAnalysis,
  ProfileMetadata,
  SuitabilityAssessment,
  DeriveResponse,
  AssessResponse,
  PriceEstimate,
  ComparableSale,
  PriceComparison,
  ComparablesResponse,
  PlannerReviewItem,
  Contribution,
  SiteDossier,
  DossierResponse,
  ContributionsResponse,
  AddressSuggestion,
  SuggestResponse,
  ContributeInput,
  ContributionRecord,
  ContributeResponse,
  ServicingType,
  ServicingAuthorityKind,
  ServicingCoverage,
  ServicingRequirement,
  ServicingDetermination,
} from './types.js'

// Client
export { PropertyServicesClient, PropertyServicesError, createPropertyServices } from './client.js'
export type { PropertyServicesConfig } from './client.js'

// React hook
export { usePropertyOnboarding } from './usePropertyOnboarding.js'
export type { UsePropertyOnboardingReturn, OnboardingStage } from './usePropertyOnboarding.js'

// Components
export { PropertyAssessment } from './PropertyAssessment.js'
