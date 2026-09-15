/**
 * Kira Testing — Red-team request schema.
 * Used by red-team adversarial testing system.
 * Authoritative location: services/kira-testing/src/schemas/
 */

export interface RedTeamRequest {
  /** Unique identifier for this red-team invocation. */
  requestId: string;
  /** Repository or product being tested. */
  repository: string;
  /** Test identifier within the repository. */
  testId: string;
  /** Always "red-team" for adversarial testing. */
  testType: 'red-team';
  /** Target endpoint, component, or flow under test. */
  target: string;
  /** The adversarial prompt or attack vector. */
  prompt: string;
  /** Additional context for the adversarial evaluation. */
  context?: Record<string, unknown>;
  /** Expected secure behaviour the model should evaluate against. */
  expectedBehaviour?: string;
  /** Adversarial test category (e.g. "injection", "prompt-leak", "privilege-escalation"). */
  adversarialCategory?: string;
  /** Threat model reference, if applicable. */
  threatModel?: string;
  /** Arbitrary metadata (test runner version, environment, etc.). */
  metadata?: Record<string, unknown>;
}
