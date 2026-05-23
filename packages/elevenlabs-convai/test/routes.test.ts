import { describe, it, expect } from 'vitest';
import { createConvaiWebhookRoutes } from '../src/routes';
import { createMockSupabase, type Resolver } from './_mock-supabase';

const startResolver: Resolver = (ctx) => {
  if (ctx.table === 'convai_agents' && ctx.op === 'select') return { data: { id: 'agent_uuid', agent_name: 'A' }, error: null };
  if (ctx.table === 'convai_conversations' && ctx.op === 'insert') return { data: { id: 'conv_uuid' }, error: null };
  return { data: null, error: null };
};

function makeRoutes(over: Partial<Parameters<typeof createConvaiWebhookRoutes>[0]> = {}) {
  const { client } = createMockSupabase(startResolver, () => ({ data: { has_history: false }, error: null }));
  return createConvaiWebhookRoutes({
    supabase: client,
    resolveSession: () => ({ userId: 'u1' }),
    ...over,
  });
}

function jsonReq(body: unknown) {
  return new Request('http://x/api', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

describe('createConvaiWebhookRoutes — startConversation', () => {
  it('returns 200 with the handler result on a valid call', async () => {
    const routes = makeRoutes();
    const res = await routes.startConversation(jsonReq({ elevenlabs_conversation_id: 'c', elevenlabs_agent_id: 'a' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 on malformed JSON', async () => {
    const routes = makeRoutes();
    const res = await routes.startConversation(jsonReq('{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    const routes = makeRoutes();
    const res = await routes.startConversation(jsonReq({ elevenlabs_conversation_id: 'c' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when resolveSession returns null', async () => {
    const routes = makeRoutes({ resolveSession: () => null });
    const res = await routes.startConversation(jsonReq({ elevenlabs_conversation_id: 'c', elevenlabs_agent_id: 'a' }));
    expect(res.status).toBe(401);
  });

  it('returns 500 when resolveSession throws (guarded, no crash)', async () => {
    const routes = makeRoutes({ resolveSession: () => { throw new Error('boom'); } });
    const res = await routes.startConversation(jsonReq({ elevenlabs_conversation_id: 'c', elevenlabs_agent_id: 'a' }));
    expect(res.status).toBe(500);
  });
});

describe('createConvaiWebhookRoutes — postCall signature', () => {
  it('rejects an unsigned post-call when a secret is configured (401)', async () => {
    const routes = makeRoutes({ postCallSecret: 'sek' });
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ type: 'post_call', data: { agent_id: 'a', conversation_id: 'c', status: 'done', transcript: [] } }),
    });
    const res = await routes.postCall(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on a malformed post-call payload (valid signature path skipped)', async () => {
    const routes = makeRoutes();
    const res = await routes.postCall(jsonReq({ not: 'a payload' }));
    expect(res.status).toBe(400);
  });
});
