/**
 * Naive Tester — simulates a human beta tester walking through a product.
 *
 * Invokes the centralised Kira Testing service through kira-testing-client only.
 * Contains NO provider/model routing logic and NO provider credentials.
 *
 * Flow:
 *   naive-tester → kira-testing-client → kira-testing service → resolver → OmniRoute → model
 */

import { test, type TestResult } from '@caistech/kira-testing-client';

export interface NaiveTestSpec {
  /** Repository or product being tested. */
  repository: string;
  /** Human-facing walkthrough/description to evaluate. */
  walkthrough: string;
  /** Optional expected behaviour. */
  expectedBehaviour?: string;
}

/**
 * Run a naive-tester walkthrough against the shared Kira Testing service.
 */
export async function runNaiveTest(spec: NaiveTestSpec): Promise<TestResult> {
  return test({
    repository: spec.repository,
    testId: `naive-${Date.now()}`,
    testType: 'naive-walkthrough',
    target: spec.repository,
    prompt: [
      'You are a naive end-user beta tester. Walk through the following product experience',
      'as a non-technical user would, noting friction points, confusing terminology,',
      'workflow issues, and any bugs you encounter. Be specific and concrete.',
      '',
      'Product experience:',
      spec.walkthrough,
    ].join('\n'),
    expectedBehaviour: spec.expectedBehaviour,
  });
}
