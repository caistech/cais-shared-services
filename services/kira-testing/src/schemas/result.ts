/**
 * Kira Testing — Stable result contract.
 * Provider-independent — never exposes raw provider response structures.
 * Authoritative location: services/kira-testing/src/schemas/
 */

export type TestStatus = 'success' | 'failure' | 'error' | 'inconclusive';

export interface ModelResolution {
  /** Logical service name (always "kira-testing"). */
  logicalService: string;
  /** Resolved model/combo identifier (from configuration). */
  resolvedModel: string;
  /** Resolution method (e.g. "env-config", "combo-config"). */
  method: string;
}

export interface GatewayInfo {
  /** Gateway used (always "omniroute"). */
  gateway: string;
  /** HTTP status code from the gateway, if available. */
  httpStatus?: number;
  /** Provider-specific request ID, if available. */
  providerRequestId?: string;
}

export interface TestResult {
  /** Correlation ID for this test invocation. */
  requestId: string;
  /** Test identifier. */
  testId: string;
  /** Test type ("standard" or "red-team"). */
  testType: string;
  /** Outcome status. */
  status: TestStatus;
  /** The model's output/evaluation text. */
  output: string;
  /** Structured evaluation result, if available. */
  evaluation?: Record<string, unknown>;
  /** Model resolution details — which model was actually used. */
  modelResolution: ModelResolution;
  /** Gateway details — which gateway handled the request. */
  gateway: GatewayInfo;
  /** End-to-end latency in milliseconds. */
  latencyMs: number;
  /** Error details, present when status is failure/error. */
  error?: TestError;
  /** Arbitrary metadata (token counts, model version, etc.). */
  metadata?: Record<string, unknown>;
}

export interface TestError {
  /** Error category: "validation", "resolution", "gateway", "model", "normalisation". */
  category: 'validation' | 'resolution' | 'gateway' | 'model' | 'normalisation';
  /** Human-readable error message. */
  message: string;
  /** Underlying error details, if available. */
  cause?: string;
  /** Correlation/request ID for debugging. */
  correlationId?: string;
}
