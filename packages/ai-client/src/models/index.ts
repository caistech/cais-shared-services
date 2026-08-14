/**
 * @caistech/ai-client/models — resolve a capability alias to a concrete model id.
 *
 * ⚠️ EVERY RELATIVE IMPORT IN THIS SUBPATH CARRIES AN EXPLICIT `.js`. The package is
 * `"type": "module"` and the repo compiles with `moduleResolution: "bundler"`, a combination that
 * lets `tsc` accept an extensionless relative import that Node ESM then refuses at runtime. That
 * exact pairing has already shipped twice in this portfolio — `@caistech/security-gate`'s
 * `/red-team` subpath was never importable across 19 files, and `@caistech/report-generator`'s main
 * entry threw on import for its entire life. Both built green. Neither was caught by a type check,
 * because a type check never imports the artifact. Do not remove these extensions.
 */

import { ALIASES, isModelAlias, envVarFor, type ModelAlias, type Provider } from './registry.js'

export { ALIASES, ALIAS_NAMES, isModelAlias, envVarFor } from './registry.js'
export type { ModelAlias, Provider } from './registry.js'

export interface ResolveModelOptions {
  alias: ModelAlias
  provider: Provider
  /** Wins over everything. The caller knows something the registry does not. */
  override?: string | undefined
  /** Injectable for tests; defaults to process.env. */
  env?: Record<string, string | undefined>
}

/**
 * Resolve a model id. Precedence, highest first:
 *
 *   1. `override`            — an explicit decision at the call site
 *   2. `CAIS_MODEL_<ALIAS>`  — an operator override, no deploy required
 *   3. the registry entry for that provider
 *
 * Mirrors the precedence `resolveClaudeModel` already uses in this package, so there is one mental
 * model rather than two.
 *
 * THROWS when nothing resolves, rather than returning a default. A silent fallback here would send
 * traffic to a model nobody chose and record it as if it were intended — the failure would surface
 * as a quality regression weeks later, with nothing pointing at the cause.
 */
export function resolveModel(options: ResolveModelOptions): string {
  const { alias, provider, override } = options

  if (override) return override

  if (!isModelAlias(alias)) {
    throw new Error(`resolveModel: unknown alias "${alias}". Known: ${Object.keys(ALIASES).join(', ')}`)
  }

  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {})
  const fromEnv = env[envVarFor(alias)]
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()

  const fromRegistry = ALIASES[alias][provider]
  if (fromRegistry) return fromRegistry

  throw new Error(
    `resolveModel: alias "${alias}" has no entry for provider "${provider}". ` +
      `Set ${envVarFor(alias)}, pass an override, or add a registry entry once its price row exists.`,
  )
}

/** Which providers can serve this alias today. Useful for a future capability filter. */
export function providersFor(alias: ModelAlias): Provider[] {
  if (!isModelAlias(alias)) return []
  return Object.keys(ALIASES[alias]) as Provider[]
}
