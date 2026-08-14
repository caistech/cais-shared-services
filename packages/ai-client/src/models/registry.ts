/**
 * The portfolio's model registry — capability tiers, not task names.
 *
 * WHY TIERS AND NOT TASKS. A task-shaped alias (`classification`, `coding`) collapses two
 * independent things: what the operation IS, and what tier it NEEDS. The operation is already
 * recorded — it is the `operation` field on every telemetry row. Using it as the model name too
 * would fix the operation→tier mapping in a constant, and that mapping is precisely what the
 * measured data is supposed to tell us. Keeping them orthogonal is what makes the later routing
 * decision possible at all.
 *
 * WHAT IS DELIBERATELY ABSENT. Only models with a VERIFIED price row in the cockpit's `model_prices`
 * appear here. There is no `BALANCED.openai` because no OpenAI mid-tier price has been verified —
 * an alias that resolves to an unpriced model produces telemetry that reads as free, which is worse
 * than an alias that is honestly missing. Add the row first, then the entry.
 */

export type Provider = 'openai' | 'anthropic'

/** Capability tiers. Extend deliberately — every addition is a portfolio-wide default. */
export type ModelAlias = 'CHEAP' | 'BALANCED' | 'REASONING' | 'EMBEDDING'

export const ALIASES: Readonly<Record<ModelAlias, Partial<Record<Provider, string>>>> = {
  /** High-frequency classification, extraction, matching. Carries most portfolio traffic. */
  CHEAP: { openai: 'gpt-4.1-mini', anthropic: 'claude-haiku-4-5' },
  /** Judgement-heavy work that a mini tier gets wrong. */
  BALANCED: { anthropic: 'claude-sonnet-4-6' },
  /** Reserve for operations that genuinely need it — the price difference is an order of magnitude. */
  REASONING: { anthropic: 'claude-opus-4-8' },
  /** Retrieval embeddings. Not a completion model; never routed through a chat path. */
  EMBEDDING: { openai: 'text-embedding-3-small' },
}

export const ALIAS_NAMES = Object.keys(ALIASES) as ModelAlias[]

export function isModelAlias(value: string): value is ModelAlias {
  return Object.prototype.hasOwnProperty.call(ALIASES, value)
}

/** `CAIS_MODEL_CHEAP`, `CAIS_MODEL_REASONING`, … — an operator override with no deploy. */
export function envVarFor(alias: ModelAlias): string {
  return `CAIS_MODEL_${alias}`
}
