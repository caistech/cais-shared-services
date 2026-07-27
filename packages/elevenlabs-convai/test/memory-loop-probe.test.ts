// The probe's own regression tests.
//
// These exist because the guard was wrong in BOTH directions, in production, while reporting five
// greens: it passed an agent that had nothing to say to a returning user, and failed products whose
// memory worked. Every case below is a shape that was actually observed on a live deployment.

import { describe, it, expect, vi } from 'vitest';
import { probeMemoryLoop } from '../src/testing.js';

const BASE = 'https://app.example.com/api/convai/webhooks';
const UID = 'user-1';
const AGENT = 'agent_123';

interface Reply { status?: number; body?: unknown }

/**
 * A fake deployment. Routes by path; `overrides` replaces any single route's reply.
 *
 * `save` records the sentinel so recall can echo it back, which is how the happy path stays honest
 * rather than asserting against a hardcoded string.
 */
function fakeApp(overrides: Record<string, Reply | ((body: any, url: string) => Reply)> = {}) {
  const state = { saved: [] as string[], calls: [] as { url: string; body: any }[] };

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    state.calls.push({ url: href, body });

    const route = href.split('?')[0].replace(`${BASE}/`, '');
    const override = overrides[route];
    let reply: Reply | undefined;
    if (typeof override === 'function') reply = override(body, href);
    else if (override) reply = override;

    if (!reply) {
      if (route === 'save_memory') {
        state.saved.push(String(body.memory ?? ''));
        reply = { body: { success: true } };
      } else if (route === 'recall_memory') {
        const wrongSecret = init?.headers && (init.headers as Record<string, string>)['x-convai-tool-secret'] === 'deliberately-wrong-secret';
        // The foreign identity arrives in the QUERY in uid mode and in the BODY in conversation mode.
        // Checking only the URL made a correctly-isolating probe look like a leak in conversation mode.
        const foreign = href.includes('probe-nonexistent') || String(body.conversation_id ?? '').includes('probe-nonexistent');
        if (wrongSecret) reply = { status: 401, body: { success: false } };
        else if (foreign) reply = { body: { success: true, found: 0, memories: [] } };
        else {
          const hits = state.saved.filter((s) => s.includes(String(body.query)));
          reply = { body: { success: true, found: hits.length, memories: hits.map((content) => ({ content })) } };
        }
      } else if (route === 'post-call') {
        reply = { status: 401, body: { success: false, error: 'Invalid signature' } };
      } else if (route === 'start_conversation') {
        reply = { body: { success: true, has_history: true, memories: state.saved.map((content) => ({ content })) } };
      } else {
        reply = { status: 404, body: { error: 'not found' } };
      }
    }

    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  return { fetchImpl, state };
}

const run = (fetchImpl: any, extra = {}) =>
  probeMemoryLoop({ baseUrl: BASE, uid: UID, agentId: AGENT, toolSecret: 'shhh', fetchImpl, ...extra });

const named = (result: Awaited<ReturnType<typeof probeMemoryLoop>>, fragment: string) =>
  result.checks.find((c) => c.name.includes(fragment));

describe('probeMemoryLoop', () => {
  it('passes a deployment where the loop genuinely works', async () => {
    const { fetchImpl } = fakeApp();
    const result = await run(fetchImpl);
    expect(result.checks.filter((c) => !c.ok && !c.skipped)).toEqual([]);
    expect(result.pass).toBe(true);
  });

  // THE regression. This exact response — has_history true, memories empty — was live at 0.10.0 and
  // scored a pass, because the old check accepted the flag as the whole answer.
  it('FAILS has_history:true with an empty context — the production symptom', async () => {
    const { fetchImpl } = fakeApp({
      start_conversation: { body: { success: true, has_history: true, memories: [], recent_messages: [] } },
    });
    const result = await run(fetchImpl);

    expect(named(result, 'sees the previous one')?.ok).toBe(true); // history flag is set...
    expect(named(result, 'speakable content')?.ok).toBe(false);   // ...and there is nothing to say
    expect(result.pass).toBe(false);
  });

  it('accepts a last_topic or summary as speakable content, not only memories', async () => {
    const { fetchImpl } = fakeApp({
      start_conversation: { body: { has_history: true, memories: [], last_topic: 'the Perth trip' } },
    });
    const result = await run(fetchImpl);
    expect(named(result, 'speakable content')?.ok).toBe(true);
    expect(named(result, 'speakable content')?.detail).toContain('last_topic');
  });

  it('reads context nested under `context`, as several consumers return it', async () => {
    const { fetchImpl } = fakeApp({
      start_conversation: { body: { success: true, context: { has_history: true, memories: [{ content: 'x' }] } } },
    });
    const result = await run(fetchImpl);
    expect(named(result, 'speakable content')?.ok).toBe(true);
  });

  it('sends BOTH identity ids to the start route, which the canonical route requires', async () => {
    const { fetchImpl, state } = fakeApp();
    await run(fetchImpl);
    const start = state.calls.find((c) => c.url.includes('start_conversation'));
    expect(start?.body.elevenlabs_conversation_id).toBeTruthy();
    expect(start?.body.elevenlabs_agent_id).toBe(AGENT);
  });

  // A 404 used to satisfy "status >= 400" and report the endpoint as secure without reaching it.
  it('FAILS a 404 from the post-call route instead of scoring it as refused', async () => {
    const { fetchImpl } = fakeApp({ 'post-call': { status: 404, body: { error: 'not found' } } });
    const result = await run(fetchImpl);
    const postCall = named(result, 'UNSIGNED');
    expect(postCall?.ok).toBe(false);
    expect(postCall?.detail).toContain('asserted nothing');
  });

  it('FAILS an ACCEPTED unsigned post-call payload', async () => {
    const { fetchImpl } = fakeApp({ 'post-call': { status: 200, body: { success: true } } });
    const result = await run(fetchImpl);
    expect(named(result, 'UNSIGNED')?.ok).toBe(false);
  });

  it('uses an absolute postCallUrl when given, rather than deriving a child path', async () => {
    const { fetchImpl, state } = fakeApp();
    await run(fetchImpl, { postCallUrl: 'https://app.example.com/api/webhooks/elevenlabs' });
    expect(state.calls.some((c) => c.url === 'https://app.example.com/api/webhooks/elevenlabs')).toBe(true);
    expect(state.calls.some((c) => c.url.endsWith('/post-call'))).toBe(false);
  });

  // An errored endpoint returns no memories, which is not the same as isolating them.
  it('does not credit isolation when the foreign recall errored', async () => {
    const { fetchImpl } = fakeApp({
      recall_memory: (body, url) =>
        url.includes('probe-nonexistent')
          ? { status: 400, body: { success: false, error: 'Missing identity' } }
          : { body: { success: true, found: 1, memories: [{ content: `Probe fact ${String(body.query)}.` }] } },
    });
    const result = await run(fetchImpl);
    const isolation = named(result, 'does not leak');
    expect(isolation?.ok).toBe(false);
    expect(isolation?.detail).toContain('not demonstrated');
  });

  it('FAILS a real leak across identities', async () => {
    const { fetchImpl, state } = fakeApp({
      recall_memory: () => ({
        body: { success: true, found: state.saved.length, memories: state.saved.map((content) => ({ content })) },
      }),
    });
    const result = await run(fetchImpl);
    expect(named(result, 'does not leak')?.ok).toBe(false);
  });

  describe('identity modes', () => {
    it('sends identity in the BODY in conversation mode, not the query string', async () => {
      const { fetchImpl, state } = fakeApp();
      await probeMemoryLoop({
        baseUrl: BASE, uid: UID, fetchImpl: fetchImpl as any,
        identityMode: 'conversation', conversationId: 'conv_abc', expectPostCallAuth: false,
      });
      const save = state.calls.find((c) => c.url.includes('save_memory'));
      expect(save?.url).not.toContain('uid=');
      expect(save?.body.conversation_id).toBe('conv_abc');
    });

    it('refuses conversation mode without a bound conversation id', async () => {
      const { fetchImpl } = fakeApp();
      const result = await probeMemoryLoop({
        baseUrl: BASE, uid: UID, fetchImpl: fetchImpl as any, identityMode: 'conversation',
      });
      expect(result.pass).toBe(false);
      expect(result.checks[0].detail).toContain('conversationId');
    });

    it('SKIPS continuity in conversation mode rather than failing a correct product', async () => {
      const { fetchImpl } = fakeApp();
      const result = await probeMemoryLoop({
        baseUrl: BASE, uid: UID, fetchImpl: fetchImpl as any, toolSecret: 'shhh',
        identityMode: 'conversation', conversationId: 'conv_abc',
      });
      const continuity = named(result, 'sees the previous one');
      expect(continuity?.skipped).toBe(true);
      expect(result.pass).toBe(true); // a skip is neither a pass nor a fail, and does not sink the run
    });

    it('SKIPS continuity when no agent id can be resolved, and says why', async () => {
      const { fetchImpl } = fakeApp();
      const result = await probeMemoryLoop({ baseUrl: BASE, uid: UID, fetchImpl: fetchImpl as any });
      const continuity = named(result, 'sees the previous one');
      expect(continuity?.skipped).toBe(true);
      expect(continuity?.detail).toContain('agentId');
    });

    it('resolves the agent id from the database when not passed explicitly', async () => {
      const { fetchImpl, state } = fakeApp();
      const supabase = {
        from: () => ({
          // Newest first — the probe orders, so a user with several agents resolves deterministically
          // to their current one rather than to whichever row the database happened to return.
          select: () => ({
            eq: () => ({
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { elevenlabs_agent_id: 'agent_from_db' } }) }) }),
            }),
          }),
          delete: () => ({ eq: () => ({ like: async () => ({ error: null }) }), like: async () => ({ error: null }) }),
        }),
      };
      await probeMemoryLoop({ baseUrl: BASE, uid: UID, fetchImpl: fetchImpl as any, supabase: supabase as any });
      const start = state.calls.find((c) => c.url.includes('start_conversation'));
      expect(start?.body.elevenlabs_agent_id).toBe('agent_from_db');
    });
  });

  describe('the distil leg', () => {
    it('signs the post-call payload and requires the transcript to reach the next connect', async () => {
      const { fetchImpl, state } = fakeApp({
        'post-call': (_body, _url) => ({ body: { success: true } }),
        start_conversation: (body) => ({
          // Third connect: report the distilled content. Keyed off the probe's own conversation id so
          // the test does not have to guess the sentinel.
          body: {
            success: true,
            has_history: true,
            memories: [{ content: `discussed the ${String(body.elevenlabs_conversation_id).replace(/-conv3|-distil|-conv2/, '')} rollout plan` }],
          },
        }),
      });
      const result = await run(fetchImpl, { distil: { secret: 'whsec_test' } });

      const signed = state.calls.find((c) => c.url.endsWith('/post-call') && c.body?.data?.status === 'done');
      expect(signed).toBeTruthy();
      expect(named(result, 'SIGNED post-call payload')?.ok).toBe(true);
      expect(named(result, 'distilled and surfaces')?.ok).toBe(true);
    });

    it('FAILS when the transcript is accepted but nothing is distilled from it', async () => {
      const { fetchImpl } = fakeApp({
        'post-call': { body: { success: true } },
        start_conversation: { body: { success: true, has_history: true, last_topic: 'something unrelated' } },
      });
      const result = await run(fetchImpl, { distil: { secret: 'whsec_test' } });
      const check = named(result, 'distilled and surfaces');
      expect(check?.ok).toBe(false);
      expect(check?.detail).toContain('distil leg is not wired');
    });
  });

  it('turns a thrown fetch into a failed check rather than throwing', async () => {
    const result = await probeMemoryLoop({
      baseUrl: BASE, uid: UID, agentId: AGENT,
      fetchImpl: (async () => { throw new Error('network down'); }) as any,
    });
    expect(result.pass).toBe(false);
    expect(named(result, 'without throwing')?.detail).toBe('network down');
  });
});

describe('edge-block diagnostic', () => {
  // The www.bucketlyst.com.au case: a WAF answered 403 for every route, and the post-call check
  // scored a pass off it, because a firewall refusal and an auth refusal are the same number.
  it('flags a target where every route returns one identical error status', async () => {
    const { fetchImpl } = fakeApp({
      save_memory: { status: 403, body: {} },
      recall_memory: { status: 403, body: {} },
      'post-call': { status: 403, body: {} },
      start_conversation: { status: 403, body: {} },
    });
    const result = await run(fetchImpl);
    expect(result.checks[0].name).toContain('not an edge block');
    expect(result.checks[0].detail).toContain('403');
    expect(result.pass).toBe(false);
  });

  it('stays silent on a healthy run, where statuses legitimately differ', async () => {
    const { fetchImpl } = fakeApp();
    const result = await run(fetchImpl);
    expect(result.checks.some((c) => c.name.includes('edge block'))).toBe(false);
  });
});
