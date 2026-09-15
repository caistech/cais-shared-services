import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the gateway so we can force different failure modes without a live call.
vi.mock('../gateway/omniroute', () => ({
  invokeGateway: vi.fn(),
}));

import { invokeGateway } from '../gateway/omniroute';
import { runTest } from './test';
import { runRedTeamTest } from './redteam';

const mockInvokeGateway = vi.mocked(invokeGateway);

const validRequest = {
  requestId: 'req-1',
  repository: 'repo-x',
  testId: 't-1',
  testType: 'smoke',
  target: '/home',
  prompt: 'Walk through this page',
};

const resolvedModel = {
  logicalService: 'kira-testing' as const,
  modelCombo: 'demo-combo',
  method: 'env:KIRA_TESTING_MODEL_COMBO',
};

const gatewayOk = {
  success: true,
  output: 'pass: all good',
  latencyMs: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runTest failure modes are distinguishable', () => {
  it('B. Service validation failure — returns validation category, no resolution attempt', async () => {
    const result = await runTest(
      { ...validRequest, prompt: '' },
      { env: { KIRA_TESTING_MODEL_COMBO: 'demo-combo' } }
    );

    expect(result.status).toBe('error');
    expect(result.error?.category).toBe('validation');
    expect(mockInvokeGateway).not.toHaveBeenCalled();
  });

  it('C. Model resolution failure — returns resolution category, no gateway call', async () => {
    const result = await runTest(validRequest, { env: {} });

    expect(result.status).toBe('error');
    expect(result.error?.category).toBe('resolution');
    expect(result.modelResolution.resolvedModel).toBe('unresolved');
    expect(mockInvokeGateway).not.toHaveBeenCalled();
  });

  it('D. OmniRoute (gateway) failure — returns gateway category', async () => {
    mockInvokeGateway.mockResolvedValue({
      success: false,
      output: '',
      latencyMs: 50,
      error: 'OpenRouter API error (500): upstream',
      errorCategory: 'gateway',
    });

    const result = await runTest(
      validRequest,
      { env: { KIRA_TESTING_MODEL_COMBO: 'demo-combo' } }
    );

    expect(result.status).toBe('error');
    expect(result.error?.category).toBe('gateway');
    expect(result.error?.message).toMatch(/upstream/);
  });

  it('E. Model execution failure — returns model category', async () => {
    mockInvokeGateway.mockResolvedValue({
      success: false,
      output: '',
      latencyMs: 40,
      error: 'model not found: demo-combo',
      errorCategory: 'model',
    });

    const result = await runTest(
      validRequest,
      { env: { KIRA_TESTING_MODEL_COMBO: 'demo-combo' } }
    );

    expect(result.status).toBe('error');
    expect(result.error?.category).toBe('model');
  });

  it('success — returns stable success result with resolved model metadata', async () => {
    mockInvokeGateway.mockResolvedValue(gatewayOk);

    const result = await runTest(
      validRequest,
      { env: { KIRA_TESTING_MODEL_COMBO: 'demo-combo' } }
    );

    expect(result.status).toBe('success');
    expect(result.output).toBe('pass: all good');
    expect(result.modelResolution.resolvedModel).toBe('demo-combo');
    expect(result.modelResolution.logicalService).toBe('kira-testing');
    expect(result.gateway.gateway).toBe('omniroute');
  });
});

describe('runRedTeamTest failure modes', () => {
  it('validation failure for red-team', async () => {
    const result = await runRedTeamTest(
      { ...validRequest, prompt: '', testType: 'red-team' as const },
      { env: { KIRA_TESTING_MODEL_COMBO: 'demo-combo' } }
    );
    expect(result.error?.category).toBe('validation');
  });

  it('routes through the same resolver/gateway with testType red-team', async () => {
    mockInvokeGateway.mockResolvedValue(gatewayOk);
    const result = await runRedTeamTest(
      {
        ...validRequest,
        testType: 'red-team',
        adversarialCategory: 'injection',
      },
      { env: { KIRA_TESTING_MODEL_COMBO: 'demo-combo' } }
    );
    expect(result.status).toBe('success');
    expect(result.testType).toBe('red-team');
    expect(mockInvokeGateway).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedModel: expect.objectContaining({ modelCombo: 'demo-combo' }) })
    );
  });
});
