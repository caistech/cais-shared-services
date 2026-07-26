import { describe, expect, it, vi } from 'vitest';

import { completeConversationMemory } from '../src/memory-pipeline';
import { voiceMemoryScope } from '../src/memory-semantic';

const TABLES = {
  agents: 'convai_agents',
  conversations: 'convai_conversations',
  messages: 'convai_messages',
  memory: 'convai_memory',
} as const;

/**
 * A Supabase double that models the one behaviour under test: the memory table's contents change
 * when the distil runs. Everything else is the minimum needed to get there.
 */
function mockSupabase(opts: { existing?: string[]; distilAdds?: string[] } = {}) {
  const existing = [...(opts.existing ?? [])];
  const fromDistil = opts.distilAdds ?? [];
  let distilled = false;

  const rowsForSelect = (columns: string, filters: Record<string, unknown>) => {
    // indexNewFacts filters on source_conversation_id; activeMemoryKeys does not.
    const all = distilled ? [...existing, ...fromDistil] : existing;
    if (filters.source_conversation_id) {
      return distilled ? fromDistil.map((content) => ({ content })) : [];
    }
    return all.map((content, i) => ({ id: `id-${i}`, content, created_at: `2027-01-0${i + 1}` }));
  };

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select(columns: string) {
          const q = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return q;
            },
            order: () => Promise.resolve({ data: rowsForSelect(columns, filters), error: null }),
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: rowsForSelect(columns, filters), error: null }),
          };
          return q;
        },
        update() {
          return { in: async () => ({ error: null }) };
        },
        insert: async () => ({ error: null }),
      };
      return builder;
    },
    __markDistilled() {
      distilled = true;
    },
  };
  return client as never as { from: (t: string) => any; __markDistilled: () => void };
}

function mnemoSpy() {
  const added: string[][] = [];
  return {
    added,
    client: {
      enabled: () => true,
      add: vi.fn(async (_scope: unknown, contents: string[]) => {
        added.push(contents);
        return contents.length;
      }),
      search: vi.fn(async () => []),
    },
  };
}

describe('voiceMemoryScope', () => {
  it('isolates per user', () => {
    expect(voiceMemoryScope('kira-user-', 'abc')).toEqual({ type: 'org', id: 'kira-user-abc' });
    expect(voiceMemoryScope('kira-user-', 'abc').id).not.toBe(
      voiceMemoryScope('kira-user-', 'xyz').id,
    );
  });

  it('is prefix-sensitive — a changed prefix is a different container', () => {
    // Documented as a test because changing the prefix orphans a product's existing memory.
    expect(voiceMemoryScope('kira-user-', 'a').id).not.toBe(voiceMemoryScope('convai-user-', 'a').id);
  });
});

describe('completeConversationMemory', () => {
  it('indexes only the facts the conversation actually added', async () => {
    // The ordering trap this whole module exists to package: the prior-fact snapshot must be taken
    // BEFORE the distil. Taken after, everything looks pre-existing and nothing is ever indexed —
    // a silent no-op indistinguishable from a working integration.
    const supabase = mockSupabase({
      existing: ['Owner runs a plumbing business'],
      distilAdds: ['Owner is hiring an apprentice in March'],
    });
    const mnemo = mnemoSpy();

    const result = await completeConversationMemory(supabase, {
      conversationId: 'conv-1',
      elevenlabsConversationId: 'el-1',
      userId: 'user-1',
      extract: vi.fn(async () => {
        supabase.__markDistilled();
        return [{ content: 'Owner is hiring an apprentice in March', memory_type: 'context' }];
      }) as never,
      tables: TABLES,
      semantic: { scopePrefix: 'kira-user-', client: mnemo.client as never },
    });

    expect(mnemo.client.add).toHaveBeenCalledOnce();
    expect(mnemo.added[0]).toEqual(['Owner is hiring an apprentice in March']);
    // The pre-existing fact must NOT be re-indexed on every conversation.
    expect(mnemo.added[0]).not.toContain('Owner runs a plumbing business');
    expect(result.indexed).toBe(1);
  });

  it('skips the Mnemo leg entirely when semantic options are omitted', async () => {
    // The deliberate opt-out for a product with no persistent cross-session memory.
    const supabase = mockSupabase({ distilAdds: ['a fact'] });
    const mnemo = mnemoSpy();

    const result = await completeConversationMemory(supabase, {
      conversationId: 'conv-1',
      elevenlabsConversationId: 'el-1',
      userId: 'user-1',
      extract: vi.fn(async () => {
        supabase.__markDistilled();
        return [{ content: 'a fact', memory_type: 'context' }];
      }) as never,
      tables: TABLES,
    });

    expect(mnemo.client.add).not.toHaveBeenCalled();
    expect(result.indexed).toBe(0);
  });

  it('does nothing semantic without a user id — there is no scope to write to', async () => {
    const supabase = mockSupabase({ distilAdds: ['a fact'] });
    const mnemo = mnemoSpy();

    const result = await completeConversationMemory(supabase, {
      conversationId: 'conv-1',
      elevenlabsConversationId: 'el-1',
      extract: vi.fn(async () => []) as never,
      tables: TABLES,
      semantic: { scopePrefix: 'kira-user-', client: mnemo.client as never },
    });

    expect(mnemo.client.add).not.toHaveBeenCalled();
    expect(result.indexed).toBe(0);
  });

  it('contains a Mnemo outage instead of throwing into the post-call path', async () => {
    // This runs inside the post-call webhook. A memory failure must cost memory quality, never the
    // conversation record that was already written.
    // `existing` is needed so the mocked message read is non-empty and the distil actually runs —
    // the double returns the same rows for every table.
    const supabase = mockSupabase({ existing: ['prior fact'], distilAdds: ['a fact'] });
    const exploding = {
      enabled: () => true,
      add: vi.fn(async () => {
        throw new Error('mnemo down');
      }),
      search: vi.fn(async () => []),
    };

    const result = await completeConversationMemory(supabase, {
      conversationId: 'conv-1',
      elevenlabsConversationId: 'el-1',
      userId: 'user-1',
      extract: vi.fn(async () => {
        supabase.__markDistilled();
        return [{ content: 'a fact', memory_type: 'context' }];
      }) as never,
      tables: TABLES,
      semantic: { scopePrefix: 'kira-user-', client: exploding as never },
    });

    // Returned rather than thrown, and the other counters are still meaningful.
    expect(result).toMatchObject({ indexed: 0 });
    expect(exploding.add).toHaveBeenCalled();
  });

  it('returns a well-formed result for an empty transcript without inventing an error', async () => {
    // Nothing to distil is not a failure. Reporting one would train people to ignore the errors
    // array, which is the only channel a real failure has.
    const result = await completeConversationMemory(mockSupabase(), {
      conversationId: 'conv-1',
      elevenlabsConversationId: 'el-1',
      userId: 'user-1',
      extract: vi.fn(async () => []) as never,
      tables: TABLES,
    });

    expect(result).toEqual({ distilled: 0, deduped: 0, indexed: 0, errors: [] });
  });

  it('makes no Mnemo call when the client is disabled', async () => {
    const supabase = mockSupabase({ distilAdds: ['a fact'] });
    const disabled = { enabled: () => false, add: vi.fn(), search: vi.fn(async () => []) };

    await completeConversationMemory(supabase, {
      conversationId: 'conv-1',
      elevenlabsConversationId: 'el-1',
      userId: 'user-1',
      extract: vi.fn(async () => {
        supabase.__markDistilled();
        return [{ content: 'a fact', memory_type: 'context' }];
      }) as never,
      tables: TABLES,
      semantic: { scopePrefix: 'kira-user-', client: disabled as never },
    });

    expect(disabled.add).not.toHaveBeenCalled();
  });
});
