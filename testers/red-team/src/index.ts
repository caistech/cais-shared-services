/**
 * Red Team — adversarial security testing.
 *
 * Invokes the centralised Kira Testing service through kira-testing-client only,
 * specifically its red-team operation.
 * Contains NO provider/model routing logic and NO provider credentials.
 *
 * Flow:
 *   red-team → kira-testing-client → kira-testing service → resolver → OmniRoute → model
 *
 * This package owns the testing strategy/scenario logic; the shared service
 * owns model invocation.
 */

import { redTeam, type TestResult } from '@caistech/kira-testing-client';

/** Adversarial attack categories. */
export type AttackCategory =
  | 'injection'
  | 'prompt-leak'
  | 'privilege-escalation'
  | 'data-exfiltration'
  | 'auth-bypass'
  | 'dos'
  | 'social-engineering';

export interface RedTeamSpec {
  /** Repository or product being tested. */
  repository: string;
  /** Target endpoint, component, or flow under test. */
  target: string;
  /** Adversarial attack vector. */
  attack: string;
  /** Category of the attack. */
  category: AttackCategory;
  /** Expected secure behaviour. */
  expectedBehaviour?: string;
}

/**
 * Run an adversarial red-team test against the shared Kira Testing service.
 */
export async function runRedTeam(spec: RedTeamSpec): Promise<TestResult> {
  return redTeam({
    repository: spec.repository,
    testId: `red-team-${Date.now()}-${spec.category}`,
    target: spec.target,
    prompt: [
      `Act as an adversarial security tester. Evaluate how a system responds to the following`,
      `attack vector in the "${spec.category}" category.`,
      'Assess whether the system holds its security boundary, and identify any weaknesses.',
      'Be specific about what leaked, what was bypassed, and what held.',
      '',
      'Attack vector:',
      spec.attack,
    ].join('\n'),
    adversarialCategory: spec.category,
    expectedBehaviour: spec.expectedBehaviour,
  });
}
