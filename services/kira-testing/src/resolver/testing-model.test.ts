import { describe, it, expect } from 'vitest';
import { resolveTestingModel, isTestingModelConfigured } from './testing-model';

describe('resolveTestingModel', () => {
  it('resolves a valid configuration from KIRA_TESTING_MODEL_COMBO', () => {
    const result = resolveTestingModel({
      env: { KIRA_TESTING_MODEL_COMBO: 'my-testing-combo' },
    });

    expect(result.logicalService).toBe('kira-testing');
    expect(result.modelCombo).toBe('my-testing-combo');
    expect(result.method).toBe('env:KIRA_TESTING_MODEL_COMBO');
  });

  it('resolves from KIRA_TESTING_MODEL as fallback', () => {
    const result = resolveTestingModel({
      env: { KIRA_TESTING_MODEL: 'some-model' },
    });

    expect(result.modelCombo).toBe('some-model');
    expect(result.method).toBe('env:KIRA_TESTING_MODEL');
  });

  it('resolves from KIRA_TESTING_COMBO as second fallback', () => {
    const result = resolveTestingModel({
      env: { KIRA_TESTING_COMBO: 'alt-combo' },
    });

    expect(result.modelCombo).toBe('alt-combo');
    expect(result.method).toBe('env:KIRA_TESTING_COMBO');
  });

  it('fails explicitly when no configuration exists', () => {
    expect(() => resolveTestingModel({ env: {} })).toThrow(/no configuration found/i);
  });

  it('fails explicitly rather than silently returning a kira-coding fallback', () => {
    expect(() => resolveTestingModel({ env: { KIRA_TESTING_COMBO: '   ' } })).toThrow(
      /no configuration found/i
    );
    expect(() => resolveTestingModel({ env: { KIRA_TESTING_MODEL_COMBO: '   ' } })).toThrow(
      /no configuration found/i
    );
  });

  it('fails on whitespace-only configuration', () => {
    expect(() => resolveTestingModel({ env: { KIRA_TESTING_MODEL_COMBO: '   ' } })).toThrow(
      /no configuration found/i
    );
  });
});

describe('isTestingModelConfigured', () => {
  it('returns true when configured', () => {
    expect(isTestingModelConfigured({ env: { KIRA_TESTING_MODEL_COMBO: 'x' } })).toBe(true);
  });

  it('returns false when not configured', () => {
    expect(isTestingModelConfigured({ env: {} })).toBe(false);
  });
});
