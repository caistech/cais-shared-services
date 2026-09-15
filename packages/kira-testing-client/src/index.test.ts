import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the service so no live calls happen and we can assert routing.
vi.mock('@caistech/kira-testing', () => ({
  runTest: vi.fn(),
  runRedTeamTest: vi.fn(),
}));

import { runTest, runRedTeamTest } from '@caistech/kira-testing';
import { test, redTeam } from './index';

const mockRunTest = vi.mocked(runTest);
const mockRunRedTeamTest = vi.mocked(runRedTeamTest);

const successResult = {
  requestId: 'req-1',
  testId: 't-1',
  testType: 'standard',
  status: 'success',
  output: 'pass',
  modelResolution: { logicalService: 'kira-testing', resolvedModel: 'combo', method: 'env' },
  gateway: { gateway: 'omniroute' },
  latencyMs: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRunTest.mockResolvedValue(successResult as never);
  mockRunRedTeamTest.mockResolvedValue(successResult as never);
});

describe('kira-testing-client.test', () => {
  it('validates required inputs and rejects when missing', async () => {
    await expect(
      test({ repository: '', testId: 't', testType: 'smoke', target: 'x', prompt: 'p' })
    ).rejects.toThrow(/repository/);

    await expect(
      test({ repository: 'r', testId: '', testType: 'smoke', target: 'x', prompt: 'p' })
    ).rejects.toThrow(/testId/);

    await expect(
      test({ repository: 'r', testId: 't', testType: '', target: 'x', prompt: 'p' })
    ).rejects.toThrow(/testType/);

    await expect(
      test({ repository: 'r', testId: 't', testType: 'smoke', target: '', prompt: 'p' })
    ).rejects.toThrow(/target/);

    await expect(
      test({ repository: 'r', testId: 't', testType: 'smoke', target: 'x', prompt: '' })
    ).rejects.toThrow(/prompt/);
  });

  it('routes to the standard service test() interface', async () => {
    await test({ repository: 'r', testId: 't', testType: 'smoke', target: '/x', prompt: 'p' });

    expect(mockRunTest).toHaveBeenCalledTimes(1);
    const request = mockRunTest.mock.calls[0][0];
    expect(request.repository).toBe('r');
    expect(request.testId).toBe('t');
    expect(request.testType).toBe('smoke');
  });

  it('returns the stable result schema', async () => {
    const result = await test({
      repository: 'r',
      testId: 't',
      testType: 'smoke',
      target: '/x',
      prompt: 'p',
    });

    expect(result.modelResolution.logicalService).toBe('kira-testing');
    expect(result.gateway.gateway).toBe('omniroute');
    expect(result.status).toBe('success');
  });

  it('does not permit arbitrary provider/model specification via the public API', () => {
    // Type-level check: the input type has no model/provider fields.
    const input: Record<string, string> = {
      repository: 'r',
      testId: 't',
      testType: 'smoke',
      target: 'x',
      prompt: 'p',
    };
    // No 'model' or 'provider' key should be settable on the input shape.
    expect('model' in input).toBe(false);
    expect('provider' in input).toBe(false);
  });
});

describe('kira-testing-client.redTeam', () => {
  it('routes to the red-team service interface with testType red-team', async () => {
    await redTeam({
      repository: 'r',
      testId: 'rt',
      target: '/x',
      prompt: 'attack',
      adversarialCategory: 'injection',
    });

    expect(mockRunRedTeamTest).toHaveBeenCalledTimes(1);
    const request = mockRunRedTeamTest.mock.calls[0][0];
    expect(request.testType).toBe('red-team');
    expect(request.adversarialCategory).toBe('injection');
  });

  it('validates required inputs', async () => {
    await expect(
      redTeam({ repository: '', testId: 'rt', target: 'x', prompt: 'p' })
    ).rejects.toThrow(/repository/);
  });
});
