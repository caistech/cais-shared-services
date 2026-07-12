import type { TierPolicy } from "./types.js";

/**
 * Build a tier policy — the generic seed extracted from the LingoPure NDA gate.
 * The consumer's auth resolves a subject's max tier; `allowedTiersFor` maps it to
 * the tiers retrieval may search. Never trust a tier from the client — feed this
 * only a server-derived max tier.
 *
 * @example
 *   const policy = makeTierPolicy(['main', 'restricted'] as const,
 *     (max) => (max === 'restricted' ? ['main', 'restricted'] : ['main']));
 */
export function makeTierPolicy<T extends string>(
  tiers: readonly T[],
  allowedTiersFor: (maxTier: T) => T[]
): TierPolicy<T> {
  return { tiers, allowedTiersFor };
}
