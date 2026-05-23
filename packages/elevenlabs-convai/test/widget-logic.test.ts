import { describe, it, expect } from 'vitest';
import {
  buildStartOptions,
  launcherLabel,
  panelHeader,
  shouldUseTextFallback,
  placementClass,
  statusLabel,
} from '../src/react/widget-logic';
import type { VoiceWidgetProps } from '../src/types';

const base: VoiceWidgetProps = { agentId: 'agent_x' };

describe('buildStartOptions', () => {
  it('includes only the agentId when nothing else is set', () => {
    const opts = buildStartOptions(base);
    expect(opts).toEqual({ agentId: 'agent_x' });
  });

  it('passes through overrides and clientTools when present', () => {
    const opts = buildStartOptions({
      ...base,
      overrides: { agent: { firstMessage: 'Hi there' } },
      clientTools: { doThing: async () => 'ok' },
    });
    expect(opts.overrides?.agent?.firstMessage).toBe('Hi there');
    expect(typeof opts.clientTools?.doThing).toBe('function');
  });

  it('omits empty overrides/clientTools objects', () => {
    const opts = buildStartOptions({ ...base, overrides: {}, clientTools: {} });
    expect(opts.overrides).toBeUndefined();
    expect(opts.clientTools).toBeUndefined();
  });

  it('passes userId as a prompt variable, not an identity field', () => {
    const opts = buildStartOptions({ ...base, userId: 'u1' });
    expect(opts.dynamicVariables).toEqual({ user_id: 'u1' });
    // never a top-level userId the agent could relay as identity
    expect((opts as Record<string, unknown>).userId).toBeUndefined();
  });
});

describe('launcherLabel / panelHeader', () => {
  it('defaults to the greeting label', () => {
    expect(launcherLabel()).toMatch(/assistant/i);
    expect(launcherLabel('clarifier')).toMatch(/ask/i);
  });

  it('uses an explicit title over the mode header', () => {
    expect(panelHeader({ ...base, title: 'Custom header' })).toBe('Custom header');
  });

  it('falls back to a mode-specific header', () => {
    expect(panelHeader({ ...base, mode: 'clarifier' })).toMatch(/stuck/i);
  });
});

describe('shouldUseTextFallback', () => {
  it('is false when textFallback is not enabled', () => {
    expect(shouldUseTextFallback({ ...base }, 'error')).toBe(false);
  });

  it('is true when enabled and the connection errored', () => {
    expect(shouldUseTextFallback({ ...base, textFallback: true }, 'error')).toBe(true);
  });

  it('is true when enabled and no agentId is configured', () => {
    expect(shouldUseTextFallback({ agentId: '', textFallback: true }, 'disconnected')).toBe(true);
  });

  it('is false when enabled, agent present, and connected', () => {
    expect(shouldUseTextFallback({ ...base, textFallback: true }, 'connected')).toBe(false);
  });
});

describe('placementClass / statusLabel', () => {
  it('defaults placement to floating', () => {
    expect(placementClass()).toContain('convai-launch--floating');
    expect(placementClass('sidebar')).toContain('convai-launch--sidebar');
  });

  it('describes connection status for the operator', () => {
    expect(statusLabel('connecting', false)).toMatch(/connecting/i);
    expect(statusLabel('connected', true)).toMatch(/speaking/i);
    expect(statusLabel('connected', false)).toMatch(/listening/i);
    expect(statusLabel('error', false)).toMatch(/problem/i);
  });
});
