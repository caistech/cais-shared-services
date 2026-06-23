/**
 * @caistech/portfolio-gate — Portfolio Standard enforcement layer.
 *
 * v0.1 ships four pieces:
 *   - errorResponse()   — sanitised API error helper        (R10)
 *   - runRouteSmoke()   — preview-deploy route smoke test   (R13)
 *   - runAuthSmoke()    — four-leg auth smoke test          (R1, R4)
 *   - templates/gate.yml — GitHub Action template
 *
 * See foundation/PORTFOLIO_STANDARD.md for the rules this package enforces.
 */

export { errorResponse } from './errors.js'
export type { ErrorResponseOptions, ErrorResponseBody } from './errors.js'

export {
  runRouteSmoke,
  loadRoutesConfigJson,
  formatRouteResult,
} from './smoke/routes.js'
export type {
  RouteSpec,
  RouteSmokeConfig,
  RouteSmokeResult,
  RouteFailure,
} from './smoke/routes.js'

export {
  runAuthSmoke,
  loadAuthConfigJson,
  formatAuthResult,
  formatComplianceIssuesMarkdown,
} from './smoke/auth.js'
export type {
  AuthLeg,
  AuthCheckType,
  AuthComplianceIssue,
  AuthFunctionalFailure,
  AuthSmokeConfig,
  AuthSmokeResult,
} from './smoke/auth.js'

export {
  runAuthSessionSmoke,
  loadSessionConfigJson,
  formatSessionResult,
} from './smoke/session.js'
export type {
  AuthSessionConfig,
  AuthSessionResult,
  SessionFailure,
} from './smoke/session.js'

// v0.2 + v0.3 static audits.
export { runRlsAudit } from './audit/rls.js'
export { runRlsLiveAudit } from './audit/rls-live.js'
export type { RlsLiveAuditConfig, RlsLiveAuditOptions } from './audit/rls-live.js'
export { runVendorLeakAudit } from './audit/vendor-leak.js'
export { runUnauthEndpointsAudit } from './audit/unauth-endpoints.js'
export { runSampleAudit } from './audit/sample.js'
export { runExplanatoryHeaderAudit } from './audit/explanatory-header.js'
export { runTrustPanelAudit } from './audit/trust-panel.js'
export { runResponsiveAudit } from './audit/responsive.js'
export { runCommitmentPanelAudit } from './audit/commitment-panel.js'
export { runVoiceAgentAudit } from './audit/voice-agent.js'
export { formatAuditResult } from './audit/shared.js'
export type { AuditResult, AuditFinding } from './audit/shared.js'
