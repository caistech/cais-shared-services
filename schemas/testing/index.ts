/**
 * Shared Kira Testing schemas — re-exported from the authoritative source.
 *
 * Authoritative contract: services/kira-testing/src/schemas/
 * This directory is the documented shared area for consumers that want the
 * contract without importing service internals.
 */
export type { TestRequest } from '../../services/kira-testing/src/schemas/test';
export type { RedTeamRequest } from '../../services/kira-testing/src/schemas/redteam';
export type {
  TestResult,
  TestStatus,
  TestError,
  ModelResolution,
  GatewayInfo,
} from '../../services/kira-testing/src/schemas/result';
