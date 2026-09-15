/**
 * Kira Testing — Standard test request schema.
 * Used by naive-tester and any ordinary automated testing system.
 * Authoritative location: services/kira-testing/src/schemas/
 */

export interface TestRequest {
  /** Unique identifier for this test invocation. */
  requestId: string;
  /** Repository or product being tested. */
  repository: string;
  /** Test identifier within the repository. */
  testId: string;
  /** Type of test (e.g. "smoke", "integration", "e2e"). */
  testType: string;
  /** Target endpoint, component, or flow under test. */
  target: string;
  /** The prompt or input supplied to the testing model. */
  prompt: string;
  /** Additional context for the testing model. */
  context?: Record<string, unknown>;
  /** Expected behaviour the model should evaluate against. */
  expectedBehaviour?: string;
  /** Arbitrary metadata (test runner version, environment, etc.). */
  metadata?: Record<string, unknown>;
}
