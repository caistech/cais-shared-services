/**
 * Kira Testing — Red-team test API.
 *
 * Flow:
 *   red-team request → validate schema → resolve Kira-testing model →
 *   invoke OmniRoute → normalise response → return red-team result
 */

import type { RedTeamRequest, TestResult, TestError } from '../schemas/index.js';
import { resolveTestingModel, type ResolvedModel } from '../resolver/testing-model.js';
import { invokeGateway, type GatewayResponse, type ChatMessage } from '../gateway/omniroute.js';
import { randomUUID } from 'crypto';

export interface RunRedTeamTestOptions {
  /** Override env vars (for testing). */
  env?: Record<string, string | undefined>;
}

/**
 * Execute a red-team Kira test.
 */
export async function runRedTeamTest(
  request: RedTeamRequest,
  options?: RunRedTeamTestOptions
): Promise<TestResult> {
  const startTime = Date.now();
  const requestId = request.requestId || randomUUID();

  // Step 1: Validate schema
  const validationError = validateRedTeamRequest(request);
  if (validationError) {
    return buildResult({
      requestId,
      testId: request.testId,
      testType: 'red-team',
      status: 'error',
      output: '',
      latencyMs: Date.now() - startTime,
      error: validationError,
      modelResolution: null,
    });
  }

  // Step 2: Resolve Kira-testing model
  let resolvedModel: ResolvedModel;
  try {
    resolvedModel = resolveTestingModel(options);
  } catch (err) {
    return buildResult({
      requestId,
      testId: request.testId,
      testType: 'red-team',
      status: 'error',
      output: '',
      latencyMs: Date.now() - startTime,
      error: {
        category: 'resolution',
        message: (err as Error).message,
        correlationId: requestId,
      },
      modelResolution: null,
    });
  }

  // Step 3: Build messages for the model
  const messages = buildRedTeamMessages(request);

  // Step 4: Invoke OmniRoute
  const gatewayResponse = await invokeGateway({
    resolvedModel,
    messages,
    requestId,
  });

  // Step 5: Normalise response
  if (!gatewayResponse.success) {
    return buildResult({
      requestId,
      testId: request.testId,
      testType: 'red-team',
      status: 'error',
      output: '',
      latencyMs: gatewayResponse.latencyMs,
      error: {
        category: mapErrorCategory(gatewayResponse.errorCategory),
        message: gatewayResponse.error || 'Gateway invocation failed',
        correlationId: requestId,
      },
      modelResolution: resolvedModel,
    });
  }

  // Step 6: Return red-team result
  return buildResult({
    requestId,
    testId: request.testId,
    testType: 'red-team',
    status: 'success',
    output: gatewayResponse.output,
    latencyMs: gatewayResponse.latencyMs,
    modelResolution: resolvedModel,
  });
}

function validateRedTeamRequest(request: RedTeamRequest): TestError | null {
  if (!request.requestId) {
    return { category: 'validation', message: 'requestId is required' };
  }
  if (!request.repository) {
    return { category: 'validation', message: 'repository is required' };
  }
  if (!request.testId) {
    return { category: 'validation', message: 'testId is required' };
  }
  if (!request.target) {
    return { category: 'validation', message: 'target is required' };
  }
  if (!request.prompt) {
    return { category: 'validation', message: 'prompt is required' };
  }
  return null;
}

function buildRedTeamMessages(request: RedTeamRequest): ChatMessage[] {
  const systemPrompt = [
    'You are a security testing assistant performing adversarial evaluation.',
    'You assess whether a system resists adversarial attacks and maintains security boundaries.',
    'Respond with a clear pass/fail assessment of the system\'s security posture.',
    '',
    `Repository: ${request.repository}`,
    `Test: ${request.testId}`,
    `Target: ${request.target}`,
    request.adversarialCategory ? `Attack category: ${request.adversarialCategory}` : '',
    request.threatModel ? `Threat model: ${request.threatModel}` : '',
  ].filter(Boolean).join('\n');

  const userContent = [
    request.prompt,
    request.expectedBehaviour ? `\nExpected secure behaviour: ${request.expectedBehaviour}` : '',
    request.context ? `\nContext: ${JSON.stringify(request.context)}` : '',
  ].filter(Boolean).join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
}

interface BuildResultInput {
  requestId: string;
  testId: string;
  testType: string;
  status: TestResult['status'];
  output: string;
  latencyMs: number;
  error?: TestError;
  modelResolution: ResolvedModel | null;
}

function buildResult(input: BuildResultInput): TestResult {
  return {
    requestId: input.requestId,
    testId: input.testId,
    testType: input.testType,
    status: input.status,
    output: input.output,
    modelResolution: input.modelResolution
      ? {
          logicalService: input.modelResolution.logicalService,
          resolvedModel: input.modelResolution.modelCombo,
          method: input.modelResolution.method,
        }
      : {
          logicalService: 'kira-testing',
          resolvedModel: 'unresolved',
          method: 'failed',
        },
    gateway: {
      gateway: 'omniroute',
    },
    latencyMs: input.latencyMs,
    error: input.error,
  };
}

function mapErrorCategory(
  category: GatewayResponse['errorCategory'] | undefined
): TestError['category'] {
  return category === 'model' ? 'model' : category === 'normalisation' ? 'normalisation' : 'gateway';
}
