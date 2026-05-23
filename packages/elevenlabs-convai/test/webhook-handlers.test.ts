import { describe, it, expect, vi } from 'vitest';
import {
  handleStartConversation,
  handlePostCallWebhook,
  handleRecallMemory,
  handleSaveMemory,
} from '../src/webhook-handlers';
import { createMockSupabase, type Resolver, type QueryCtx } from './_mock-supabase';

const postCallParams = {
  elevenlabsAgentId: 'el_agent',
  conversationId: 'el_conv',
  userId: '',
  topic: 'roofing',
  status: 'done',
  startedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  durationSecs: 120,
  messages: [
    { role: 'user' as const, content: 'hi', timestamp: new Date().toISOString() },
    { role: 'assistant' as const, content: 'hello', timestamp: new Date().toISOString() },
  ],
};

function postCallResolver(opts: { claimReturnsRow: boolean; existingProcessedAt?: string | null }): Resolver {
  return (ctx: QueryCtx) => {
    if (ctx.table === 'convai_agents' && ctx.op === 'select')
      return { data: { id: 'agent_uuid', user_id: 'owner', total_conversations: 5, total_minutes: 10 }, error: null };
    if (ctx.table === 'convai_conversations' && ctx.op === 'select')
      return { data: { id: 'conv_uuid', user_id: 'real_user', agent_id: 'agent_uuid', processed_at: opts.existingProcessedAt ?? null }, error: null };
    if (ctx.table === 'convai_conversations' && ctx.op === 'update') {
      const isClaim = ctx.filters.some((f) => f.method === 'is');
      if (isClaim) return { data: opts.claimReturnsRow ? { id: 'conv_uuid' } : null, error: null };
      return { data: { id: 'conv_uuid', user_id: 'real_user', agent_id: 'agent_uuid', processed_at: null }, error: null };
    }
    return { data: null, error: null };
  };
}

describe('handlePostCallWebhook — 13A message dedup', () => {
  it('populates message_index and upserts onConflict (conversation_id,message_index)', async () => {
    const { client, calls } = createMockSupabase(postCallResolver({ claimReturnsRow: true }));
    await handlePostCallWebhook(client, postCallParams);

    const upsert = calls.find((c) => c.table === 'convai_messages' && c.op === 'upsert');
    expect(upsert).toBeTruthy();
    expect(upsert!.conflict).toBe('conversation_id,message_index');
    const rows = upsert!.payload as Array<{ message_index: number }>;
    expect(rows.map((r) => r.message_index)).toEqual([1, 2]);
    expect(rows.every((r) => r.message_index != null)).toBe(true);
  });
});

describe('handlePostCallWebhook — exactly-once side-effects', () => {
  it('fires stats + onConversationComplete when it WINS the processed_at claim', async () => {
    const { client, calls } = createMockSupabase(postCallResolver({ claimReturnsRow: true }));
    const onDone = vi.fn(async () => {});
    const res = await handlePostCallWebhook(client, postCallParams, undefined, onDone);

    expect(res.processed).toBe(true);
    expect(onDone).toHaveBeenCalledOnce();
    const statUpdate = calls.find((c) => c.table === 'convai_agents' && c.op === 'update');
    expect((statUpdate!.payload as Record<string, unknown>).total_conversations).toBe(6);
  });

  it('skips stats + callback when the claim is LOST (already processed)', async () => {
    const { client, calls } = createMockSupabase(postCallResolver({ claimReturnsRow: false, existingProcessedAt: 'yesterday' }));
    const onDone = vi.fn(async () => {});
    const res = await handlePostCallWebhook(client, postCallParams, undefined, onDone);

    expect(res.processed).toBe(false);
    expect(res.alreadyProcessed).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === 'convai_agents' && c.op === 'update')).toBeUndefined();
  });

  it('survives onConversationComplete throwing (core writes preserved)', async () => {
    const { client } = createMockSupabase(postCallResolver({ claimReturnsRow: true }));
    const onDone = vi.fn(async () => { throw new Error('product table boom'); });
    const res = await handlePostCallWebhook(client, postCallParams, undefined, onDone);
    expect(res.success).toBe(true);
    expect(res.processed).toBe(true);
  });
});

describe('handleStartConversation — no double count', () => {
  it('does NOT increment total_conversations (counted once at post-call)', async () => {
    const resolver: Resolver = (ctx) => {
      if (ctx.table === 'convai_agents' && ctx.op === 'select') return { data: { id: 'agent_uuid', agent_name: 'A' }, error: null };
      if (ctx.table === 'convai_conversations' && ctx.op === 'insert') return { data: { id: 'conv_uuid' }, error: null };
      return { data: null, error: null };
    };
    const { client, calls } = createMockSupabase(resolver, () => ({ data: { has_history: false }, error: null }));
    await handleStartConversation(client, { elevenlabsConversationId: 'el_conv', elevenlabsAgentId: 'el_agent', userId: 'u1' });

    const agentUpdate = calls.find((c) => c.table === 'convai_agents' && c.op === 'update');
    expect(agentUpdate).toBeTruthy();
    expect((agentUpdate!.payload as Record<string, unknown>).total_conversations).toBeUndefined();
    expect((agentUpdate!.payload as Record<string, unknown>).last_conversation_at).toBeTruthy();
  });

  it('stores anon_session_id on the conversation when anonymous', async () => {
    const resolver: Resolver = (ctx) => {
      if (ctx.table === 'convai_agents' && ctx.op === 'select') return { data: { id: 'agent_uuid', agent_name: 'A' }, error: null };
      if (ctx.table === 'convai_conversations' && ctx.op === 'insert') return { data: { id: 'conv_uuid' }, error: null };
      return { data: null, error: null };
    };
    const { client, calls } = createMockSupabase(resolver, () => ({ data: { has_history: false }, error: null }));
    await handleStartConversation(client, { elevenlabsConversationId: 'el_conv', elevenlabsAgentId: 'el_agent', userId: 'anon_1', anonSessionId: 'anon_1' });

    const insert = calls.find((c) => c.table === 'convai_conversations' && c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).anon_session_id).toBe('anon_1');
  });
});

describe('memory handlers — 15A identity derived from the conversation', () => {
  it('handleRecallMemory queries memory with the conversation-bound user_id, not a supplied one', async () => {
    const resolver: Resolver = (ctx) => {
      if (ctx.table === 'convai_conversations' && ctx.op === 'select')
        return { data: { id: 'conv_uuid', user_id: 'BOUND_USER', agent_id: 'agent_x', anon_session_id: null }, error: null };
      if (ctx.table === 'convai_memory' && ctx.op === 'select')
        return { data: [], error: null };
      return { data: null, error: null };
    };
    const { client, calls } = createMockSupabase(resolver);
    await handleRecallMemory(client, { elevenlabsConversationId: 'el_conv', query: 'budget' });

    const memSelect = calls.find((c) => c.table === 'convai_memory' && c.op === 'select');
    const userEq = memSelect!.filters.find((f) => f.method === 'eq' && f.args[0] === 'user_id');
    expect(userEq!.args[1]).toBe('BOUND_USER');
  });

  it('handleSaveMemory tags memory with the binding anon_session_id', async () => {
    const resolver: Resolver = (ctx) => {
      if (ctx.table === 'convai_conversations' && ctx.op === 'select')
        return { data: { id: 'conv_uuid', user_id: 'anon_1', agent_id: 'agent_x', anon_session_id: 'anon_1' }, error: null };
      if (ctx.table === 'convai_memory' && ctx.op === 'insert')
        return { data: { id: 'mem_1' }, error: null };
      return { data: null, error: null };
    };
    const { client, calls } = createMockSupabase(resolver);
    const res = await handleSaveMemory(client, { elevenlabsConversationId: 'el_conv', content: 'likes blue', memoryType: 'preference' });
    expect(res.success).toBe(true);

    const insert = calls.find((c) => c.table === 'convai_memory' && c.op === 'insert');
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.user_id).toBe('anon_1');
    expect(payload.anon_session_id).toBe('anon_1');
  });

  it('handleRecallMemory rejects an unknown conversation', async () => {
    const resolver: Resolver = () => ({ data: null, error: null });
    const { client } = createMockSupabase(resolver);
    const res = await handleRecallMemory(client, { elevenlabsConversationId: 'nope', query: 'x' });
    expect(res.success).toBe(false);
  });
});
