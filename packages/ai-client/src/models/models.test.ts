// Slice 0C — the alias registry.
//
// Note the import extension. These tests exercise the source; the RUNTIME check that the published
// subpath actually imports lives outside vitest, because vitest's resolver is forgiving in exactly
// the way Node ESM is not — which is how two packages in this portfolio shipped green and broken.

import { describe, expect, it } from 'vitest'
import { ALIASES, ALIAS_NAMES, envVarFor, isModelAlias, providersFor, resolveModel } from './index.js'

describe('resolveModel — precedence', () => {
  it('explicit override beats everything', () => {
    expect(
      resolveModel({
        alias: 'CHEAP',
        provider: 'openai',
        override: 'gpt-5-nano',
        env: { CAIS_MODEL_CHEAP: 'from-env' },
      }),
    ).toBe('gpt-5-nano')
  })

  it('env override beats the registry', () => {
    expect(resolveModel({ alias: 'CHEAP', provider: 'openai', env: { CAIS_MODEL_CHEAP: 'gpt-4o-mini' } }))
      .toBe('gpt-4o-mini')
  })

  it('falls back to the registry entry for the provider', () => {
    expect(resolveModel({ alias: 'CHEAP', provider: 'openai', env: {} })).toBe('gpt-4.1-mini')
    expect(resolveModel({ alias: 'CHEAP', provider: 'anthropic', env: {} })).toBe('claude-haiku-4-5')
  })

  it('ignores a blank env override rather than resolving to empty string', () => {
    expect(resolveModel({ alias: 'CHEAP', provider: 'openai', env: { CAIS_MODEL_CHEAP: '   ' } }))
      .toBe('gpt-4.1-mini')
  })

  it('trims an env override', () => {
    expect(resolveModel({ alias: 'CHEAP', provider: 'openai', env: { CAIS_MODEL_CHEAP: ' gpt-4o-mini ' } }))
      .toBe('gpt-4o-mini')
  })
})

describe('resolveModel — failure is loud', () => {
  it('throws for a provider the alias has no entry for, naming the fix', () => {
    // BALANCED has no openai entry on purpose — no verified price row exists yet.
    expect(() => resolveModel({ alias: 'BALANCED', provider: 'openai', env: {} }))
      .toThrow(/no entry for provider "openai"/)
    expect(() => resolveModel({ alias: 'BALANCED', provider: 'openai', env: {} }))
      .toThrow(/CAIS_MODEL_BALANCED/)
  })

  it('throws for an unknown alias rather than silently defaulting', () => {
    expect(() => resolveModel({ alias: 'PREMIUM' as never, provider: 'openai', env: {} }))
      .toThrow(/unknown alias/)
  })

  it('an env override still works for an alias with no registry entry for that provider', () => {
    expect(resolveModel({ alias: 'BALANCED', provider: 'openai', env: { CAIS_MODEL_BALANCED: 'gpt-4.1' } }))
      .toBe('gpt-4.1')
  })
})

describe('registry shape', () => {
  it('exposes the four capability tiers', () => {
    expect(ALIAS_NAMES.sort()).toEqual(['BALANCED', 'CHEAP', 'EMBEDDING', 'REASONING'])
  })

  it('only lists models that have verified price rows', () => {
    // Guard against re-adding an unpriced model: an alias resolving to an unpriced model produces
    // telemetry that reads as free.
    const PRICED = new Set([
      'gpt-4.1-mini', 'gpt-4o-mini', 'text-embedding-3-small',
      'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8', 'claude-fable-5',
    ])
    for (const [alias, byProvider] of Object.entries(ALIASES)) {
      for (const [provider, model] of Object.entries(byProvider)) {
        expect(PRICED.has(model as string), `${alias}.${provider} = ${model}`).toBe(true)
      }
    }
  })

  it('names env vars consistently', () => {
    expect(envVarFor('REASONING')).toBe('CAIS_MODEL_REASONING')
  })

  it('reports which providers can serve an alias', () => {
    expect(providersFor('CHEAP').sort()).toEqual(['anthropic', 'openai'])
    expect(providersFor('REASONING')).toEqual(['anthropic'])
    expect(providersFor('NOPE' as never)).toEqual([])
  })

  it('isModelAlias narrows correctly', () => {
    expect(isModelAlias('CHEAP')).toBe(true)
    expect(isModelAlias('cheap')).toBe(false)
    expect(isModelAlias('toString')).toBe(false) // prototype keys are not aliases
  })
})
