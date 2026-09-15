/**
 * Kira Testing — Model resolver.
 *
 * Resolves the logical "kira-testing" service to a concrete model/combo
 * configuration. This is the ONLY layer that decides which model handles
 * testing requests.
 *
 * Configuration is read from environment variables — no hard-coded providers.
 * Fails explicitly if unconfigured. NO fallback to kira-coding or arbitrary models.
 */

export interface ResolvedModel {
  /** Logical service name. Always "kira-testing". */
  logicalService: 'kira-testing';
  /** The resolved model/combo identifier for OmniRoute. */
  modelCombo: string;
  /** Resolution method description. */
  method: string;
}

export interface ResolverOptions {
  /** Override env vars (for testing). When omitted, reads from process.env. */
  env?: Record<string, string | undefined>;
}

const LOGICAL_SERVICE = 'kira-testing' as const;

const ENV_KEYS = [
  'KIRA_TESTING_MODEL_COMBO',
  'KIRA_TESTING_MODEL',
  'KIRA_TESTING_COMBO',
] as const;

/**
 * Resolve the Kira-testing model/combo from environment configuration.
 *
 * Resolution order:
 *   1. KIRA_TESTING_MODEL_COMBO (explicit combo identifier)
 *   2. KIRA_TESTING_MODEL (single model identifier)
 *   3. KIRA_TESTING_COMBO (alternative combo key)
 *
 * Throws if none are configured — NO silent fallback.
 */
export function resolveTestingModel(options?: ResolverOptions): ResolvedModel {
  const env = options?.env ?? process.env;

  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value && value.trim().length > 0) {
      return {
        logicalService: LOGICAL_SERVICE,
        modelCombo: value.trim(),
        method: `env:${key}`,
      };
    }
  }

  throw new Error(
    `Kira Testing model resolution failed: no configuration found.\n` +
    `Expected one of: ${ENV_KEYS.join(', ')}\n` +
    `This is an infrastructure failure — the Kira-testing combo is not configured.\n` +
    `Do NOT fall back to kira-coding or an arbitrary model.`
  );
}

/**
 * Check whether the Kira-testing model is configured (without throwing).
 */
export function isTestingModelConfigured(options?: ResolverOptions): boolean {
  try {
    resolveTestingModel(options);
    return true;
  } catch {
    return false;
  }
}
