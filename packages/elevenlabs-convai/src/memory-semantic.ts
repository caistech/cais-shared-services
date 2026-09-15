/**
 * The semantic-memory leg of the canonical voice loop — Mnemo, inside the package.
 *
 * WHY INSIDE, NOT CALLED
 *
 * `DATA_STANDARD` §6 names voice-agent memory as Mnemo deployment target #2, so a voice agent that
 * persists memory is *supposed* to dual-write distilled facts to Mnemo. Before this module, the
 * package terminated at the product's own Supabase and left the Mnemo leg to each product to
 * remember — with the predictable result: **exactly one product remembered.** Kira hand-rolled it;
 * BucketLyst had no Mnemo integration at all; nothing surfaced the difference, because
 * `probeMemoryLoop` asserts save→recall→continuity against the product's *own* store and cannot
 * tell that a leg is missing.
 *
 * That is the same failure that produced this package's other scars: ship the parts, leave the
 * assembly to discipline, discover years later that discipline is not a mechanism. So the leg runs
 * inside the canonical post-call path. A product gets it by consuming the package, and has to
 * positively opt OUT if it genuinely has no persistent memory.
 *
 * THE TWO STORES ARE NOT REDUNDANT (DATA_STANDARD D1/D3)
 *   - The product's Supabase table is the DURABLE, RLS'd, delete-cascading source of truth.
 *   - Mnemo is the SEMANTIC INDEX over the distilled facts — it finds a differently-worded
 *     recurrence ("what happened on that job six weeks ago") that substring recall misses.
 * Only DISTILLED facts leave our infrastructure. Never transcripts, never raw artifacts (I4/S4).
 */

import { createMnemoClient, normaliseFact, orgScope, type MnemoClient } from '@caistech/mnemo';

import type { TableNames } from './webhook-handlers.js';

/** Structural, to avoid pinning a @supabase/supabase-js version in this module. */
type Supabase = { from: (table: string) => any };

export interface SemanticMemoryOptions {
  /**
   * Scope-id prefix. The Mnemo scope becomes `${scopePrefix}${userId}`.
   *
   * ⚠️ CHANGING THIS ORPHANS EXISTING MEMORY. The scope id IS the container — facts written under
   * `kira-user-<id>` are invisible from `convai-user-<id>`. A product that already has memory in
   * Mnemo must keep the prefix it started with. Kira's is `kira-user-`.
   */
  scopePrefix: string;
  /** Injectable client (tests, or a product that wants its own label/key). */
  client?: MnemoClient;
}

/** Per-user isolation (DATA_STANDARD S2) — one owner's memory can never surface for another. */
export function voiceMemoryScope(scopePrefix: string, userId: string) {
  return orgScope(`${scopePrefix}${userId}`);
}

/**
 * Deactivate duplicate ACTIVE facts, keeping the newest of each normalised group.
 *
 * The post-call distil appends facts every conversation, so near-identical facts pile up and recall
 * gets noisy in a way that reads as the model degrading. Runs before the Mnemo write so duplicates
 * are never indexed in the first place.
 *
 * Best-effort: never throws into the post-call path.
 */
export async function dedupeUserMemory(
  supabase: Supabase,
  userId: string,
  tables: TableNames,
  organisationId?: string,
): Promise<number> {
  if (!userId) return 0;
  try {
    let q = supabase
      .from(tables.memory)
      .select('id, content, created_at')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false }); // newest first → first seen per group is the keeper
    if (organisationId) q = q.eq('organisation_id', organisationId);

    const { data: rows } = await q;

    const seen = new Set<string>();
    const supersede: string[] = [];
    for (const row of (rows ?? []) as { id: string; content?: string }[]) {
      const key = normaliseFact(String(row.content ?? ''));
      if (!key) continue;
      if (seen.has(key)) supersede.push(row.id);
      else seen.add(key);
    }
    if (!supersede.length) return 0;

    await supabase.from(tables.memory).update({ active: false }).in('id', supersede);
    return supersede.length;
  } catch (error) {
    console.error('[convai/semantic] dedupe failed:', error);
    return 0;
  }
}

/** Normalised set of a user's ACTIVE facts — used to send only what is genuinely new to Mnemo. */
export async function activeMemoryKeys(
  supabase: Supabase,
  userId: string,
  tables: TableNames,
  organisationId?: string,
): Promise<Set<string>> {
  try {
    let q = supabase
      .from(tables.memory)
      .select('content')
      .eq('user_id', userId)
      .eq('active', true);
    if (organisationId) q = q.eq('organisation_id', organisationId);
    return new Set(
      ((data ?? []) as { content?: string }[])
        .map((r) => normaliseFact(String(r.content ?? '')))
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/**
 * Dual-write the facts a conversation produced that are genuinely NEW.
 *
 * `priorKeys` must be snapshotted BEFORE the distil runs — comparing against the post-distil state
 * would find everything already present and write nothing.
 *
 * Fail-soft throughout: a Mnemo outage costs semantic recall, never the conversation or the
 * durable memory row.
 */
export async function indexNewFacts(
  supabase: Supabase,
  params: {
    userId: string;
    conversationId: string;
    priorKeys: Set<string>;
    tables: TableNames;
    options: SemanticMemoryOptions;
    organisationId?: string;
  },
): Promise<number> {
  const { userId, conversationId, priorKeys, tables, options, organisationId } = params;
  if (!userId) return 0;

  const client = options.client ?? createMnemoClient({ label: 'convai/semantic' });
  if (!client.enabled()) return 0;

  try {
    let q = supabase
      .from(tables.memory)
      .select('content')
      .eq('source_conversation_id', conversationId)
      .eq('active', true);
    if (organisationId) q = q.eq('organisation_id', organisationId);

    const { data } = await q;

    const netNew = ((data ?? []) as { content?: string }[])
      .map((r) => String(r.content ?? ''))
      .filter((c) => c && !priorKeys.has(normaliseFact(c)));

    if (!netNew.length) return 0;
    return await client.add(voiceMemoryScope(options.scopePrefix, userId), netNew);
  } catch (error) {
    console.error('[convai/semantic] index skipped:', error);
    return 0;
  }
}

/**
 * Semantic recall for a user — the differently-worded lookup the durable store cannot do.
 *
 * Compose with the durable recall rather than replacing it: this finds the re-phrased recurrence,
 * the table holds the authoritative, RLS'd, deletable record.
 */
export async function recallSemanticFacts(
  userId: string,
  query: string,
  options: SemanticMemoryOptions,
  limit = 6,
): Promise<string[]> {
  if (!userId || !query?.trim()) return [];
  const client = options.client ?? createMnemoClient({ label: 'convai/semantic' });
  return client.search(voiceMemoryScope(options.scopePrefix, userId), query, limit);
}
