/**
 * @caistech/kira-testing-client
 *
 * Public interface for invoking the centralised Kira Testing service.
 * Consumed by naive-tester, red-team, and any other repository.
 *
 * This client:
 *   - Provides strong TypeScript types (via shared schemas)
 *   - Validates required inputs
 *   - Invokes the central Kira-testing service
 *   - Returns the stable result schema
 *   - Exposes useful errors
 *
 * This client does NOT:
 *   - Choose models
 *   - Contain provider names
 *   - Implement model fallback
 *   - Contain tester-specific logic
 *   - Contain red-team attack logic
 */

import {
  runTest as serviceRunTest,
  runRedTeamTest as serviceRunRedTeamTest,
} from '@caistech/kira-testing';
import type { TestRequest, RedTeamRequest, TestResult } from '@caistech/kira-testing';

/** A minimal input for a standard test. All fields are validated before invocation. */
export interface TestInput {
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
  /** Optional context for the testing model. */
  context?: Record<string, unknown>;
  /** Expected behaviour the model should evaluate against. */
  expectedBehaviour?: string;
  /** Request ID. Generated if omitted. */
  requestId?: string;
  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;
}

/** A minimal input for a red-team test. */
export interface RedTeamInput extends Omit<TestInput, 'testType'> {
  /** Adversarial test category. */
  adversarialCategory?: string;
  /** Threat model reference. */
  threatModel?: string;
}

/**
 * Invoke a standard Kira test.
 * Returns the stable provider-independent result schema.
 */
export async function test(input: TestInput): Promise<TestResult> {
  validateTestInput(input);
  validateTestType(input);
  const request: TestRequest = {
    requestId: input.requestId ?? generateRequestId(),
    repository: input.repository,
    testId: input.testId,
    testType: input.testType,
    target: input.target,
    prompt: input.prompt,
    context: input.context,
    expectedBehaviour: input.expectedBehaviour,
    metadata: input.metadata,
  };
  return serviceRunTest(request);
}

/**
 * Invoke a red-team Kira test.
 * Returns the stable provider-independent result schema.
 */
export async function redTeam(input: RedTeamInput): Promise<TestResult> {
  validateTestInput(input);
  const request: RedTeamRequest = {
    requestId: input.requestId ?? generateRequestId(),
    repository: input.repository,
    testId: input.testId,
    testType: 'red-team',
    target: input.target,
    prompt: input.prompt,
    context: input.context,
    expectedBehaviour: input.expectedBehaviour,
    adversarialCategory: input.adversarialCategory,
    threatModel: input.threatModel,
    metadata: input.metadata,
  };
  return serviceRunRedTeamTest(request);
}

function validateTestInput(input: {
  repository: string;
  testId: string;
  testType?: string;
  target: string;
  prompt: string;
}): void {
  if (!input) {
    throw new Error('kira-testing-client: test input is required');
  }
  if (!input.repository) {
    throw new Error('kira-testing-client: repository is required');
  }
  if (!input.testId) {
    throw new Error('kira-testing-client: testId is required');
  }
  if (!input.target) {
    throw new Error('kira-testing-client: target is required');
  }
  if (!input.prompt) {
    throw new Error('kira-testing-client: prompt is required');
  }
}

function validateTestType(input: { testType?: string }): void {
  if (!input.testType) {
    throw new Error('kira-testing-client: testType is required');
  }
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Re-export the stable result types so consumers never need to import internals.
export type { TestResult, TestStatus, TestError, ModelResolution, GatewayInfo } from '@caistech/kira-testing';
