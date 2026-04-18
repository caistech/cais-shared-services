import type { EvaluatorFn, NudgeChannel } from "./types.js";

// ---------------------------------------------------------------------------
// Evaluator registry — factory function
// ---------------------------------------------------------------------------

export interface EvaluatorRegistryConfig<
  TNudgeType extends string = string,
  TContext = unknown,
> {
  evaluators: Record<TNudgeType, EvaluatorFn<TContext>>;
  channels: Record<TNudgeType, NudgeChannel[]>;
  frequencyCapBypass?: TNudgeType[];
  smsDedupTypes?: TNudgeType[];
}

/**
 * Create an evaluator registry.
 *
 * This is intentionally just a typed data bag — the cron handler
 * consumes it. Keeps evaluator registration separate from execution.
 */
export function createEvaluatorRegistry<
  TNudgeType extends string,
  TContext,
>(
  config: EvaluatorRegistryConfig<TNudgeType, TContext>,
): EvaluatorRegistryConfig<TNudgeType, TContext> {
  return { ...config };
}

/** Stub evaluator that always returns shouldFire: false */
export function stubEvaluator(): EvaluatorFn<unknown> {
  return async () => ({ shouldFire: false, targets: [], payload: {} });
}
