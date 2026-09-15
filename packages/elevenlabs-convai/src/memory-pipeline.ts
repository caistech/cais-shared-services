/**
 * The whole post-call memory job, in one call.
 *
 * Kira assembled this by hand inside its own `onConversationComplete`: snapshot the prior facts,
 * distil the transcript, dedupe, then dual-write only what is new to Mnemo. Four steps in a
 * specific order, where getting the order wrong silently does nothing — snapshot AFTER the distil
 * and every fact looks pre-existing, so nothing is ever indexed.
 *
 * That is far too easy to get wrong to leave as a per-product assembly, and the evidence says so:
 * of the two products on this package, one assembled it and one did not, and nothing surfaced the
 * difference. So the sequence lives here and runs by default.
 */

import { distillConversationToMemory } from './memory-distill.js';
import {
  activeMemoryKeys,
  dedupeUserMemory,
  indexNewFacts,
  type SemanticMemoryOptions,
} from './memory-semantic.js';
import type { MemoryExtractor } from './memory-distill.js';
import type { TableNames } from './webhook-handlers.js';

type Supabase = { from: (table: string) => any };

export interface ConversationMemoryParams {
  conversationId: string;
  elevenlabsConversationId: string;
  /** Resolved by the caller; without it there is no scope to write to and the job is skipped. */
  userId?: string;
  /** Organisation that owns the memory. P0.4: every memory row must carry organisation_id. */
  organisationId?: string;
  extract: MemoryExtractor;
  tables: TableNames;
  /**
   * Semantic (Mnemo) leg. Omit to run distil + dedupe WITHOUT the dual-write — the deliberate
   * opt-out for a product with no persistent cross-session memory (a transient clarifier).
   *
   * Omitting it is a decision. It should be a considered one, because the default position in
   * DATA_STANDARD §6 is that a memory-bearing voice agent indexes to Mnemo.
   */
  semantic?: SemanticMemoryOptions;
}

export interface ConversationMemoryResult {
  distilled: number;
  deduped: number;
  indexed: number;
  /** Set when a step failed. The others still ran — no step is allowed to abort the rest. */
  errors: string[];
}

/**
 * Run the canonical post-call memory sequence.
 *
 * Never throws. Every step is independently fail-soft, because this runs inside the post-call
 * webhook: a failure here must cost memory quality, never the conversation record that was already
 * written.
 */
export async function completeConversationMemory(
  supabase: Supabase,
  params: ConversationMemoryParams,
): Promise<ConversationMemoryResult> {
  const { conversationId, elevenlabsConversationId, userId, organisationId, extract, tables, semantic } = params;
  const result: ConversationMemoryResult = { distilled: 0, deduped: 0, indexed: 0, errors: [] };

  // 1. Snapshot BEFORE distilling. This ordering is the whole reason the sequence is packaged:
  //    taken afterwards, every fact appears pre-existing and nothing is ever indexed — a silent
  //    no-op that looks exactly like a working integration.
  let priorKeys = new Set<string>();
  if (userId && semantic) {
    priorKeys = await activeMemoryKeys(supabase, userId, tables, organisationId);
  }

  // 2. Distil the transcript into durable facts.
  try {
    const distil = await distillConversationToMemory(supabase, {
      elevenlabsConversationId,
      conversationId,
      extract,
      tables,
      organisationId,
    });
    result.distilled = distil.saved;
    if (distil.error) result.errors.push(`distil: ${distil.error}`);
  } catch (error) {
    result.errors.push(`distil: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!userId) return result;

  // 3. Collapse literal repeats before anything indexes them.
  try {
    result.deduped = await dedupeUserMemory(supabase, userId, tables, organisationId);
  } catch (error) {
    result.errors.push(`dedupe: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 4. Dual-write only the genuinely new facts to the semantic index.
  if (semantic) {
    try {
      result.indexed = await indexNewFacts(supabase, {
        userId,
        conversationId,
        priorKeys,
        tables,
        options: semantic,
        organisationId,
      });
    } catch (error) {
      result.errors.push(`index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}
