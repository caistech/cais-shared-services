import { describe, it, expect } from 'vitest';
import { buildVoiceConfig, renderVoiceConfigModule } from '../src/voice-init';

describe('buildVoiceConfig', () => {
  it('builds a VoiceConfig from answers + agent id', () => {
    const cfg = buildVoiceConfig('agent_x', {
      placement: 'floating',
      mode: 'clarifier',
      textFallback: true,
    });
    expect(cfg).toMatchObject({
      agentId: 'agent_x',
      placement: 'floating',
      mode: 'clarifier',
      textFallback: true,
      personaRef: 'voice-config.json',
    });
  });

  it('includes allowedOrigins only when provided', () => {
    const withOrigins = buildVoiceConfig('a', { placement: 'floating', mode: 'greeting', textFallback: false, allowedOrigins: ['app.com'] });
    expect(withOrigins.allowedOrigins).toEqual(['app.com']);
    const without = buildVoiceConfig('a', { placement: 'floating', mode: 'greeting', textFallback: false });
    expect(without.allowedOrigins).toBeUndefined();
  });

  it('rejects an invalid placement or mode', () => {
    // @ts-expect-error invalid placement
    expect(() => buildVoiceConfig('a', { placement: 'nope', mode: 'greeting', textFallback: false })).toThrow(/placement/);
    // @ts-expect-error invalid mode
    expect(() => buildVoiceConfig('a', { placement: 'floating', mode: 'nope', textFallback: false })).toThrow(/mode/);
  });
});

describe('renderVoiceConfigModule', () => {
  it('emits a valid TS module exporting voiceConfig', () => {
    const cfg = buildVoiceConfig('agent_x', { placement: 'sidebar', mode: 'greeting', textFallback: false });
    const out = renderVoiceConfigModule(cfg);
    expect(out).toContain("import type { VoiceConfig } from '@caistech/elevenlabs-convai'");
    expect(out).toContain('export const voiceConfig: VoiceConfig =');
    expect(out).toContain('"agentId": "agent_x"');
  });

  it('lists clarifier fields as a comment when provided', () => {
    const cfg = buildVoiceConfig('a', { placement: 'floating', mode: 'clarifier', textFallback: true });
    const out = renderVoiceConfigModule(cfg, ['eligibility_band', 'sda_design_category']);
    expect(out).toContain('Clarifier surfaces');
    expect(out).toContain('eligibility_band, sda_design_category');
  });
});
