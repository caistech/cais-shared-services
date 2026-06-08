// memory-distill — the PERSIST+DISTIL leg of the voice-memory loop (VOICE_MEMORY_STANDARD §F).
//
// handlePostCallWebhook persists the transcript and exposes an `onConversationComplete` seam, but it
// deliberately does NOT decide WHAT to remember (that's product-specific). This orchestrator closes
// the gap generically: read the conversation's messages, hand them to the product's `extract`
// function (its LLM call — model is the consumer's choice / BYOK), and write each returned memory
// via handleSaveMemory (identity derived server-side from the conversation binding, never supplied).
//
// Intended to be called FROM onConversationComplete, which runs exactly-once behind the
// processed_at gate — so this needs no idempotency guard of its own. Without this leg wired,
// convai_memory stays empty: storage, not memory.

import type { MemoryType } from './types.js';
import { handleSaveMemory, type TableNames } from './webhook-handlers.js';

// Minimal structural Supabase client — `from` returns `any` so a real @supabase/supabase-js client
// (whose query builder is a thenable, not a Promise) passes without a deep structural-comparison
// error. No hard @supabase dep here; the await on the builder works at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = { from: (table: string) => any };

export interface DistilledMemory {
  content: string;
  memoryType: MemoryType;
  importance?: number; // 1-10; defaults to handleSaveMemory's 5
  tags?: string[];
}

/** The product-supplied extraction step: turn the transcript into the memories worth keeping. */
export type MemoryExtractor = (
  turns: { role: 'user' | 'assistant'; content: string }[],
) => Promise<DistilledMemory[]>;

export interface DistillParams {
  /** ElevenLabs conversation id — used to derive the (user, agent, anon) binding for each save. */
  elevenlabsConversationId: string;
  /** The convai_conversations.id whose messages to read. */
  conversationId: string;
  extract: MemoryExtractor;
  tables: TableNames;
}

/**
 * Read a completed conversation's messages, distil them (via the product's `extract`), and persist
 * the result to convai_memory. Returns how many memories were saved. Degrade-don't-fake: a failing
 * extract or save logs and is skipped — it never fabricates or throws out of the post-call path.
 */
export async function distillConversationToMemory(
  supabase: Supabase,
  params: DistillParams,
): Promise<{ saved: number; error?: string }> {
  const { elevenlabsConversationId, conversationId, extract, tables } = params;

  const { data: msgs, error: readErr } = await supabase
    .from(tables.messages)
    .select('role, content, message_index')
    .eq('conversation_id', conversationId)
    .order('message_index', { ascending: true });
  if (readErr) {
    console.error('[memory-distill] message read failed:', readErr);
    return { saved: 0, error: 'message read failed' };
  }
  const rows = (msgs ?? []) as { role: 'user' | 'assistant'; content: string }[];
  const turns = rows
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  if (turns.length === 0) return { saved: 0 };

  let items: DistilledMemory[];
  try {
    items = await extract(turns);
  } catch (e) {
    console.error('[memory-distill] extract threw:', e instanceof Error ? e.message : e);
    return { saved: 0, error: 'extract failed' };
  }
  if (!Array.isArray(items) || items.length === 0) return { saved: 0 };

  let saved = 0;
  for (const it of items) {
    if (!it || typeof it.content !== 'string' || !it.content.trim()) continue;
    const res = await handleSaveMemory(
      supabase as never,
      {
        elevenlabsConversationId,
        content: it.content.trim(),
        memoryType: it.memoryType,
        importance: it.importance,
        tags: it.tags,
      },
      tables,
    );
    if (res.success) saved++;
    else console.warn('[memory-distill] save skipped:', res.error)
  }
  console.log('[memory-distill] conv=%s saved=%d/%d', elevenlabsConversationId, saved, items.length);
  return { saved };
}
