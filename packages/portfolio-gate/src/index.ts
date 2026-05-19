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
} from './smoke/auth.js'
export type {
  AuthLeg,
  AuthSmokeConfig,
  AuthSmokeResult,
  AuthFailure,
} from './smoke/auth.js'
