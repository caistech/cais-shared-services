import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConvaiWebhookRoutes } from '../src/routes';
import { createMockSupabase, type Resolver } from './_mock-supabase';

// The defect these tests pin (0.10.0):
//
//   if (postCallSecret) { ...verify... }
//
// With no secret configured, verification was not FAILED — it was SKIPPED, so an unsigned payload
// reached the parser and the writes behind it. `handlePostCallWebhook` binds by
// `elevenlabs_agent_id`/`conversation_id` read from the request BODY, and an agent id is shipped to
// the browser, so this let anyone write conversation content the agent later recalls and speaks
// back as fact. Memory poisoning, not junk rows.
//
// It survived three separate write-ups without a single assertion. These are the assertions.

const resolver: Resolver = () => ({ data: null, error: null });

function makeRoutes(over: Partial<Parameters<typeof createConvaiWebhookRoutes>[0]> = {}) {
  const { client } = createMockSupabase(resolver, () => ({ data: null, error: null }));
  return createConvaiWebhookRoutes({
    supabase: client,
    resolveSession: () => ({ userId: 'u1' }),
    ...over,
  });
}

/** A well-formed post-call body carrying NO `elevenlabs-signature` header. */
function unsignedPostCall() {
  return new Request('http://x/api/convai/webhooks/post-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'post_call_transcription',
      data: { conversation_id: 'conv_forged', agent_id: 'agent_public_id', transcript: [] },
    }),
  });
}

describe('post-call auth — fails closed', () => {
  const saved = process.env.ELEVENLABS_WEBHOOK_SECRET;
  beforeEach(() => { delete process.env.ELEVENLABS_WEBHOOK_SECRET; });
  afterEach(() => {
    if (saved === undefined) delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    else process.env.ELEVENLABS_WEBHOOK_SECRET = saved;
  });

  it('REFUSES an unsigned payload when no secret is configured', async () => {
    const routes = makeRoutes();
    const res = await routes.postCall(unsignedPostCall());
    // Anything but 2xx is a refusal. The pre-0.10.0 behaviour returned 400 here — having reached
    // the parser — which reads like validation and is actually an unauthenticated write path.
    expect(res.status).toBe(500);
  });

  it('resolves the secret from ELEVENLABS_WEBHOOK_SECRET, so config alone closes the hole', async () => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'from-the-environment';
    const routes = makeRoutes();
    const res = await routes.postCall(unsignedPostCall());
    // 401, not 500: a secret resolved, verification RAN, and the unsigned request failed it.
    expect(res.status).toBe(401);
  });

  it('prefers an explicit postCallSecret over the environment', async () => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'from-the-environment';
    const routes = makeRoutes({ postCallSecret: 'explicit' });
    const res = await routes.postCall(unsignedPostCall());
    expect(res.status).toBe(401);
  });

  it('serves unverified ONLY behind the named opt-in', async () => {
    const routes = makeRoutes({ allowUnsignedPostCall: true });
    const res = await routes.postCall(unsignedPostCall());
    // Assert on WHICH refusal, not on the status. This mock has no tables behind it, so the request
    // 500s downstream once it is past the gate — and a bare status check would then pass for the
    // wrong reason, which is the same class of mistake as the defect under test.
    const body = await res.json();
    expect(body.error).not.toMatch(/secret not configured/i);
  });

  it('does not throw at construction — tool-only consumers must not be broken by this', () => {
    // The factory hands back all six routes whether or not a consumer mounts post-call. Refusing to
    // CONSTRUCT would fail products that never expose the risky route, and a guard that produces
    // false failures is a guard someone switches off.
    expect(() => makeRoutes()).not.toThrow();
  });
});
