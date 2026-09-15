/**
 * @caistech/kira-testing — Centralised Kira Testing service.
 *
 * Provides two logical operations:
 *   - test()    — standard testing (used by naive-tester)
 *   - redTeam() — adversarial testing (used by red-team)
 *
 * Architecture:
 *   naive-tester/red-team → kira-testing-client → [this service] → resolver → OmniRoute → model
 *
 * This service owns:
 *   - Model resolution (logical "kira-testing" combo)
 *   - OmniRoute gateway integration
 *   - Request/response normalisation
 */

export { runTest, type RunTestOptions } from './api/test.js';
export { runRedTeamTest, type RunRedTeamTestOptions } from './api/redteam.js';
export { resolveTestingModel, isTestingModelConfigured, type ResolvedModel } from './resolver/testing-model.js';
export { invokeGateway, type GatewayRequest, type GatewayResponse } from './gateway/omniroute.js';

export type {
  TestRequest,
  RedTeamRequest,
  TestResult,
  TestStatus,
  TestError,
  ModelResolution,
  GatewayInfo,
} from './schemas/index.js';
