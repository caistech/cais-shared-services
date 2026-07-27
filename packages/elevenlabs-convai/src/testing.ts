// elevenlabs-convai/testing.ts
// A reusable CI GUARD for the memory loop — the thing that would have caught the class of bug where
// "the agent calls its memory tools but they always return nothing." It calls the DEPLOYED webhook
// routes exactly the way ElevenLabs calls them (body = the LLM-filled params only; identity supplied
// the way the product's tools supply it) and asserts save→recall actually round-trips, that auth is
// enforced, that identity is isolated, and — the part that matters to a user — that the NEXT session
// is handed something to SAY.
//
// Usage (in the consumer's CI, against prod or a preview):
//   import { probeMemoryLoop } from '@caistech/elevenlabs-convai/testing';
//   const r = await probeMemoryLoop({ baseUrl, uid: TEST_USER_ID, toolSecret, supabase, memoryTable });
//   if (!r.pass) process.exit(1);
//
// WHAT 0.11.0 CHANGED, AND WHY
//
// The 0.7–0.10 probe could return five greens against an agent that greets a returning user as a
// stranger, and red against a product whose memory works. Both directions were real:
//
//   * Continuity accepted `has_history: true` as sufficient. That flag is true whenever a prior
//     CONVERSATION ROW exists; it says nothing about whether any content came back. Observed live:
//     `has_history: true` alongside `memories: []`. A guard that goes green on the exact symptom it
//     exists to catch is worse than no guard, because it is cited as evidence. Now the substance of
//     the injected context is a check of its own.
//   * The start payload omitted `elevenlabs_agent_id`, which the canonical route requires — so the
//     continuity check 400'd for every product on the canonical route set, and passed only where a
//     product had forked the route. The verdict tracked how forgiving each consumer's routing was.
//   * Identity was hardcoded to one model (`?uid=`, one-agent-per-user). A one-agent-per-SITE product
//     resolving identity from a connect-time binding could only ever fail. See `identityMode`.
//   * "Refused" meant any status >= 400, so a 404 from a mis-derived post-call path scored as a
//     security pass, and isolation scored a pass off an endpoint that had errored.
//
// It writes ONE sentinel memory (and, for continuity, one conversation row) and deletes both after,
// given a service-role client. Requires routes that support the identity model you declare.

export interface MemoryLoopCheck {
  name: string;
  ok: boolean;
  detail?: string;
  /**
   * The check could not be ASSERTED here, for a structural reason that is recorded in `detail`.
   *
   * Deliberately distinct from a fail. A one-agent-per-site product cannot fabricate a new bound
   * session from outside, so "a new conversation sees the previous one" is not testable over HTTP
   * for it — and failing it would teach the operator to switch the gate off, which is how the
   * previous generation of this guard ended up running in zero repos. Skipped checks do not count
   * toward `pass`, and are printed as loudly as failures so they never read as silence.
   */
  skipped?: boolean;
}

export interface MemoryLoopResult {
  pass: boolean;
  checks: MemoryLoopCheck[];
}

// Loosely-typed to avoid a hard @supabase/supabase-js dependency in this subpath.
interface SupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

/**
 * How the product's tools tell the server WHOSE memory this is.
 *
 * Both are legitimate and the package supports both; a probe that only knows one declares the other
 * broken. See `createConversationTools({ identity })` vs `({ platformIdentity })`.
 *
 * - `uid`  — one agent per USER. The owner is known at provision, baked into the tool URL as
 *            `?uid=…`, read back by `resolveToolIdentity`. Body carries the LLM params only.
 * - `conversation` — one agent per SITE/tenant serving many people. The owner is not knowable at
 *            provision, so the tools send the platform-filled `conversation_id` and the server looks
 *            up the connect-time binding. Requires `conversationId`: a conversation the product has
 *            already bound, because only the product can create that binding.
 */
export type IdentityMode = 'uid' | 'conversation';

export interface ProbeMemoryLoopOptions {
  /** The deployed webhook base URL, e.g. `https://app.example.com/api/convai/webhooks`. */
  baseUrl: string;
  /** A real TEST user's id — the identity the tools carry as `?uid=` in `uid` mode. */
  uid: string;
  /** Which identity model the product's tools use. Default `uid`. */
  identityMode?: IdentityMode;
  /**
   * An ALREADY-BOUND conversation id. Required in `conversation` mode — the probe cannot mint a
   * binding, since writing it is the product's connect-time job.
   */
  conversationId?: string;
  /**
   * The product's ElevenLabs agent id, used for the continuity check.
   *
   * `handleStartConversation` looks the agent up by this id and returns `Agent not found` (inside a
   * 200) when it misses, so a placeholder produces a confusing red. When omitted, the probe tries to
   * resolve it from `agentsTable` using the service-role client; failing that, continuity is reported
   * as not-assertable rather than silently failed.
   */
  agentId?: string;
  /** The tool secret, if the routes are secret-guarded (createConvaiWebhookRoutes({ toolSecret })). */
  toolSecret?: string;
  /** Service-role client for sentinel cleanup and agent-id discovery. */
  supabase?: SupabaseLike;
  /** Memory table name (default 'convai_memory'). */
  memoryTable?: string;
  /** Conversations table name, for cleanup of the row the continuity check creates. */
  conversationsTable?: string;
  /** Agents table name, for agent-id discovery (default 'convai_agents'). */
  agentsTable?: string;
  /** Injectable fetch (default global). */
  fetchImpl?: typeof fetch;
  /** Unique-ish run id for the sentinel (default from the clock). */
  runId?: string;
  /**
   * Also assert CONTINUITY: that a NEW conversation sees the previous one, AND is handed content.
   *
   * This is the check that catches the failure a user actually notices — reconnecting and being
   * greeted with "this is our first chat here" while the memory rows sit in the database. Every
   * other check here can pass while this is broken, because save→recall within one session says
   * nothing about what happens on the next connect.
   *
   * Default TRUE.
   */
  expectContinuity?: boolean;
  /** The connect route, relative to baseUrl. Default 'start_conversation'. */
  startRoute?: string;
  /**
   * The header the consumer's routes read the tool secret from. Default `x-convai-tool-secret`.
   *
   * `createConvaiWebhookRoutes` already lets a consumer name this header (CONVAI_TOOL_SECRET_HEADER),
   * and several do — so hardcoding it here made the probe 401 against exactly the products that had
   * bothered to guard their routes.
   */
  toolSecretHeader?: string;
  /**
   * Also assert POST-CALL AUTH: that an unsigned POST to the post-call route is REFUSED.
   *
   * `handlePostCallWebhook` binds by `elevenlabs_agent_id`/`conversation_id` read from the request
   * BODY, and an agent id is shipped to the browser — so a post-call route that accepts unsigned
   * payloads lets anyone write conversation content the agent later recalls and speaks back as fact.
   *
   * A REFUSAL is 401 or 403 (or 500 "secret not configured"). It is NOT a 404: that means the probe
   * is asking the wrong URL, and scoring it as a pass is how a security check becomes decoration.
   */
  expectPostCallAuth?: boolean;
  /**
   * ABSOLUTE post-call URL. Prefer this.
   *
   * The relative `postCallRoute` cannot express the common real layout, where post-call is a sibling
   * of the tool routes rather than a child of them — and getting it wrong used to score as a pass.
   */
  postCallUrl?: string;
  /** The post-call route, relative to baseUrl. Default 'post-call'. Ignored when `postCallUrl` is set. */
  postCallRoute?: string;
  /**
   * Assert the DISTIL leg: sign a synthetic post-call payload, deliver it, then reconnect and require
   * the conversation's content to come back in the injected context.
   *
   * This is the only part of "does the agent remember our last conversation" that is testable without
   * audio. Everything else in this probe writes its sentinel through `save_memory`, which skips the
   * transcript→distil path entirely — so a product whose post-call webhook never fires can still show
   * a full set of greens.
   *
   * It performs REAL writes against the target (a conversation, its messages, and whatever the
   * product's `onConversationComplete` distils) and may spend LLM tokens. Off unless a secret is
   * given, and requires `agentId`.
   */
  distil?: { secret: string };
}

/** `t=<unix>,v0=<hex hmac>` over `${timestamp}.${rawBody}` — the shape verifyWebhookSignature expects. */
async function signElevenLabsPayload(secret: string, rawBody: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret.trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v0=${hex}`;
}

/**
 * Is there anything in this connect response the agent could actually SAY?
 *
 * The distinction the previous probe missed. `has_history` is bookkeeping — a conversation row
 * exists. Content is memories, a last topic, a summary, or prior messages. Only the second lets an
 * agent open with "last time we were talking about…", and only the second was ever the point.
 */
function speakableContent(payload: unknown): { present: boolean; parts: string[] } {
  const body = (payload ?? {}) as Record<string, unknown>;
  // Consumers vary in nesting: some return the RPC result directly, some wrap it under `context`.
  const ctx = (body.context && typeof body.context === 'object' ? body.context : body) as Record<string, unknown>;
  const parts: string[] = [];

  const arrayHas = (key: string) => Array.isArray(ctx[key]) && (ctx[key] as unknown[]).length > 0;
  const stringHas = (key: string) => typeof ctx[key] === 'string' && (ctx[key] as string).trim().length > 0;

  if (arrayHas('memories')) parts.push(`memories=${(ctx.memories as unknown[]).length}`);
  if (arrayHas('recent_messages')) parts.push(`recent_messages=${(ctx.recent_messages as unknown[]).length}`);
  if (stringHas('last_topic')) parts.push('last_topic');
  if (stringHas('summary')) parts.push('summary');
  if (stringHas('title')) parts.push('title');

  return { present: parts.length > 0, parts };
}

/**
 * Probe the deployed memory loop. Returns pass=false with per-check detail on any failure.
 * Never throws — a thrown call becomes a failed check.
 */
export async function probeMemoryLoop(opts: ProbeMemoryLoopOptions): Promise<MemoryLoopResult> {
  const {
    baseUrl,
    uid,
    identityMode = 'uid',
    conversationId,
    toolSecret,
    supabase,
    memoryTable = 'convai_memory',
    conversationsTable = 'convai_conversations',
    agentsTable = 'convai_agents',
    fetchImpl = fetch,
    expectContinuity = true,
    startRoute = 'start_conversation',
    toolSecretHeader = 'x-convai-tool-secret',
    expectPostCallAuth = true,
    postCallUrl,
    postCallRoute = 'post-call',
    distil,
    runId = `probe_${Date.now()}`,
  } = opts;

  const base = baseUrl.replace(/\/$/, '');
  const sentinel = `convai-probe-${runId}`;
  const continuityConvId = `${sentinel}-conv2`;
  const checks: MemoryLoopCheck[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const skip = (name: string, detail: string) => checks.push({ name, ok: false, detail, skipped: true });

  const headers = (secret?: string): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(secret ? { [toolSecretHeader]: secret } : {}),
  });

  const statuses: number[] = [];
  const postTo = async (url: string, body: unknown, secret?: string, extra?: Record<string, string>) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { ...headers(secret), ...(extra ?? {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    statuses.push(res.status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, json };
  };

  /**
   * Identity travels differently per mode: the query string in `uid` mode (the server bakes it into
   * the tool URL at provision), the body in `conversation` mode (the platform fills it per call).
   * Everything below is written once against these two helpers rather than twice.
   */
  const toolQuery = (identity: string = uid) =>
    identityMode === 'uid' ? `?uid=${encodeURIComponent(identity)}` : '';
  const withIdentity = (body: Record<string, unknown>, identity?: string) =>
    identityMode === 'conversation'
      ? { ...body, conversation_id: identity ?? conversationId, elevenlabs_conversation_id: identity ?? conversationId }
      : body;

  const post = (route: string, body: Record<string, unknown>, secret?: string, identity?: string) =>
    postTo(`${base}/${route}${toolQuery(identity)}`, withIdentity(body, identity), secret);

  try {
    if (identityMode === 'conversation' && !conversationId) {
      check(
        'configuration is usable',
        false,
        "identityMode 'conversation' needs `conversationId` — an already-bound conversation. Only the product can create that binding.",
      );
      return { pass: false, checks };
    }

    // 1. save_memory — the way EL calls it: identity per the declared mode, body = the fact only.
    const save = await post('save_memory', { memory: `Probe fact ${sentinel}.`, category: 'context' }, toolSecret);
    check(
      'save_memory succeeds',
      save.status === 200 && save.json?.success === true,
      `status ${save.status}${save.json?.error ? ` — ${save.json.error}` : ''}`,
    );

    // 2. recall_memory — body = query only. THE regression guard: does recall find what save saved?
    const recall = await post('recall_memory', { query: sentinel }, toolSecret);
    const recalled = JSON.stringify(recall.json?.memories ?? recall.json?.results ?? []);
    check(
      'recall_memory finds the saved fact',
      recall.status === 200 && (recall.json?.found ?? 0) >= 1 && recalled.includes(sentinel),
      `status ${recall.status}, found=${recall.json?.found}`,
    );

    // 3. auth is enforced (only when a secret is configured).
    if (toolSecret) {
      const noAuth = await post('recall_memory', { query: sentinel }, 'deliberately-wrong-secret');
      check('recall_memory rejects a wrong tool secret (401)', noAuth.status === 401, `status ${noAuth.status}`);
    }

    // 3b. post-call auth — an UNSIGNED post-call POST must be refused. Cheapest check here, and the
    //     only one whose failure is a live write path. No `elevenlabs-signature` header, on purpose.
    //
    //     A 404 is NOT a refusal, it is a wrong URL: the previous "any status >= 400" rule meant a
    //     mis-derived path reported the endpoint as secure without ever reaching it.
    if (expectPostCallAuth) {
      const url = postCallUrl ?? `${base}/${postCallRoute}`;
      const unsigned = await postTo(url, { type: 'post_call_transcription', data: { conversation_id: sentinel } });
      const refused = unsigned.status === 401 || unsigned.status === 403 || unsigned.status === 500;
      check(
        'post-call rejects an UNSIGNED payload',
        refused,
        unsigned.status === 404
          ? `404 from ${url} — the route is not there, so this asserted nothing. Set postCallUrl.`
          : `status ${unsigned.status} — 2xx means signature verification is skipped, not failed`,
      );
    }

    // 4. identity isolation — a different identity must NOT see this user's sentinel.
    //
    //    Requires a 200 first. Inspecting only the returned memories was right (many routes echo the
    //    query, and the query IS the sentinel) but incomplete: a 400 also returns no memories, so a
    //    product whose endpoint was simply broken scored an isolation pass.
    const foreignUid = `${uid}-probe-nonexistent`;
    const foreign = await post('recall_memory', { query: sentinel }, toolSecret, foreignUid);
    const foreignMemories = JSON.stringify(foreign.json?.memories ?? foreign.json?.results ?? []);
    check(
      'recall under a different identity does not leak the fact',
      foreign.status === 200 && !foreignMemories.includes(sentinel),
      foreign.status === 200
        ? `found=${foreign.json?.found ?? 0}`
        : `status ${foreign.status} — the endpoint errored, so isolation was not demonstrated`,
    );

    // Resolve the agent id ONCE: explicit, else from the database. Both the continuity check and the
    // distil leg need it, and resolving it per-check meant the distil leg skipped for "needs agentId"
    // on a run where continuity had just resolved one successfully — a confusing skip caused by the
    // probe, not the product. Newest first, matching how products pick a user's current agent.
    let resolvedAgentId = opts.agentId;
    if (!resolvedAgentId && supabase) {
      try {
        const { data } = await supabase
          .from(agentsTable)
          .select('elevenlabs_agent_id')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedAgentId = data?.elevenlabs_agent_id ?? undefined;
      } catch { /* reported at the point of use */ }
    }

    // 5. CONTINUITY — the check that catches what a user actually notices, in two halves.
    if (expectContinuity) {
      if (identityMode === 'conversation') {
        skip(
          'a NEW conversation sees the previous one',
          'not assertable over HTTP in `conversation` identity mode — a new session must be bound by the product at connect, and the probe cannot mint that binding. Verify with a live pass.',
        );
      } else {
        const elevenlabsAgentId = resolvedAgentId;

        if (!elevenlabsAgentId) {
          skip(
            'a NEW conversation sees the previous one',
            `no agent id: pass \`agentId\`, or give a service-role client so it can be read from ${agentsTable}. The canonical start route requires it and answers "Agent not found" without it.`,
          );
        } else {
          const start = await post(
            startRoute,
            { elevenlabs_conversation_id: continuityConvId, elevenlabs_agent_id: elevenlabsAgentId },
            toolSecret,
          );
          const payload = JSON.stringify(start.json ?? {});
          const body = (start.json ?? {}) as Record<string, unknown>;
          const ctx = (body.context && typeof body.context === 'object' ? body.context : body) as Record<string, unknown>;
          const signalsHistory =
            ctx.has_history === true || ctx.hasHistory === true || ctx.returning === true || payload.includes(sentinel);

          check(
            'a NEW conversation sees the previous one (no "first chat here")',
            start.status === 200 && signalsHistory,
            start.status === 200
              ? signalsHistory ? undefined : 'no history signal in the connect response'
              : `status ${start.status} from ${startRoute} — is the route mounted?`,
          );

          // 5b. THE SUBSTANCE CHECK. `has_history: true` with an empty payload is the exact
          //     production symptom — the agent is told it has met you and handed nothing to say.
          //     Observed live at 0.10.0, while the probe reported five greens.
          const content = speakableContent(start.json);
          const carriesSentinel = payload.includes(sentinel);
          check(
            'the connect response carries speakable content (not just has_history)',
            start.status === 200 && content.present,
            content.present
              ? `${content.parts.join(', ')}${carriesSentinel ? '; includes this run\'s fact' : "; this run's fact not in the top slice (older high-importance memories can crowd it out)"}`
              : 'has_history may be set, but memories/last_topic/summary/recent_messages are all empty — the agent has nothing to open with',
          );
        }
      }
    }

    // 6. THE DISTIL LEG — transcript → post-call → distil → next connect.
    //
    //    Every check above writes its fact through `save_memory`, which bypasses the transcript path
    //    entirely. A product whose post-call webhook never fires passes all of them and still forgets
    //    every real conversation, because nothing was ever distilled from one.
    if (distil) {
      const agentIdForDistil = resolvedAgentId;
      if (!agentIdForDistil) {
        skip(
          'a real conversation is distilled and surfaces on the next connect',
          `no agent id: pass \`agentId\`, or give a service-role client so it can be read from ${agentsTable}`,
        );
      } else {
        const distilConvId = `${sentinel}-distil`;
        const phrase = `the ${sentinel} rollout plan`;

        // Bind the conversation first. An unbound post-call payload has no owner to attribute the
        // transcript to, so this sequence must mirror the real one: connect, talk, hang up.
        const bind = await post(
          startRoute,
          { elevenlabs_conversation_id: distilConvId, elevenlabs_agent_id: agentIdForDistil },
          toolSecret,
        );

        if (bind.status !== 200 || bind.json?.success === false) {
          check('a real conversation is distilled and surfaces on the next connect', false,
            `could not bind the conversation: status ${bind.status}${bind.json?.error ? ` — ${bind.json.error}` : ''}`);
        } else {
          const now = Math.floor(Date.now() / 1000);
          const rawBody = JSON.stringify({
            type: 'post_call_transcription',
            event_timestamp: now,
            data: {
              agent_id: agentIdForDistil,
              conversation_id: distilConvId,
              status: 'done',
              transcript: [
                { role: 'agent', message: 'What should we cover today?', time_in_call_secs: 1 },
                { role: 'user', message: `I want to talk about ${phrase}.`, time_in_call_secs: 4 },
                { role: 'agent', message: `Understood — ${phrase}. I'll remember that.`, time_in_call_secs: 8 },
              ],
              metadata: { start_time_unix_secs: now - 30, end_time_unix_secs: now, call_duration_secs: 30 },
              analysis: { transcript_summary: `The user discussed ${phrase}.`, call_successful: 'success' },
            },
          });

          const signature = await signElevenLabsPayload(distil.secret, rawBody);
          const url = postCallUrl ?? `${base}/${postCallRoute}`;
          const delivered = await postTo(url, rawBody, undefined, { 'elevenlabs-signature': signature });

          check(
            'a SIGNED post-call payload is accepted',
            delivered.status === 200,
            `status ${delivered.status}${delivered.json?.error ? ` — ${delivered.json.error}` : ''}`,
          );

          if (delivered.status === 200) {
            const after = await post(
              startRoute,
              { elevenlabs_conversation_id: `${sentinel}-conv3`, elevenlabs_agent_id: agentIdForDistil },
              toolSecret,
            );
            const seen = JSON.stringify(after.json ?? {});
            check(
              'a real conversation is distilled and surfaces on the next connect',
              after.status === 200 && seen.includes(sentinel),
              seen.includes(sentinel)
                ? 'the conversation\'s own content came back at the next connect'
                : 'the transcript was accepted but none of its content reached the next connect — the distil leg is not wired (onConversationComplete)',
            );
          }
        }
      }
    }
  } catch (err) {
    check('probe completed without throwing', false, err instanceof Error ? err.message : String(err));
  } finally {
    // Cleanup (best-effort). These are REAL rows in a REAL database — a probe that litters the
    // production memory of a test user degrades the thing it is measuring.
    if (supabase) {
      try {
        await supabase.from(memoryTable).delete().eq('user_id', uid).like('content', `%${sentinel}%`);
      } catch { /* non-fatal */ }
      try {
        // Messages cascade from the conversation row.
        await supabase.from(conversationsTable).delete().like('elevenlabs_conversation_id', `%${sentinel}%`);
      } catch { /* non-fatal */ }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[convai/testing] no supabase client — sentinel "${sentinel}" left behind for user ${uid}; delete it manually.`);
    }
  }

  // DIAGNOSTIC: are the requests even reaching the application?
  //
  // Routes that should disagree — an authenticated save, a deliberately-wrong secret, an unsigned
  // post-call — answering with ONE identical error status means something in front of the app is
  // answering for it. Seen live: `https://www.bucketlyst.com.au` returned 403 to every route while
  // the same commit on its `*.vercel.app` origin returned a healthy mix, and the post-call check
  // "passed" off the 403 because a firewall's refusal is indistinguishable from an auth refusal when
  // you only look at the number. Only appears when triggered, so it adds no noise to a healthy run.
  if (statuses.length >= 3 && new Set(statuses).size === 1 && statuses[0] >= 400) {
    checks.unshift({
      name: 'the target is answering as the application, not an edge block',
      ok: false,
      detail: `every request returned ${statuses[0]}, including ones that must differ — the requests are probably not reaching the app (WAF/bot rule, deployment protection, or a wrong base URL). Verdicts below are unreliable.`,
    });
  }

  // A skipped check is not a pass and not a fail: it is a statement that this shape cannot be
  // asserted from here. It still prints.
  return { pass: checks.filter((c) => !c.skipped).every((c) => c.ok), checks };
}
