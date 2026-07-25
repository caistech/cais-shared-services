// elevenlabs-convai/testing.ts
// A reusable CI GUARD for the memory loop — the thing that would have caught the class of bug where
// "the agent calls its memory tools but they always return nothing." It calls the DEPLOYED webhook
// routes exactly the way ElevenLabs calls them (body = the LLM-filled params only; identity via the
// server-baked ?uid in the URL) and asserts save→recall actually round-trips, that auth is enforced,
// and that identity is isolated. A direct unit test hides the bug by supplying a conversation id;
// this does not.
//
// Usage (in the consumer's CI, against prod or a preview):
//   import { probeMemoryLoop } from '@caistech/elevenlabs-convai/testing';
//   const r = await probeMemoryLoop({ baseUrl, uid: TEST_USER_ID, toolSecret, supabase, memoryTable });
//   if (!r.pass) process.exit(1);
//
// It writes ONE sentinel memory and (given a supabase client) deletes it after. Requires the routes
// to support server-baked identity (createConvaiWebhookRoutes({ resolveToolIdentity }), ≥0.6.0).

export interface MemoryLoopCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface MemoryLoopResult {
  pass: boolean;
  checks: MemoryLoopCheck[];
}

// Loosely-typed to avoid a hard @supabase/supabase-js dependency in this subpath.
interface SupabaseLike {
  from(table: string): {
    delete(): {
      eq(col: string, val: unknown): {
        like(col: string, pattern: string): Promise<{ error: unknown }>;
      };
      like(col: string, pattern: string): Promise<{ error: unknown }>;
    };
  };
}

export interface ProbeMemoryLoopOptions {
  /** The deployed webhook base URL, e.g. `https://app.example.com/api/convai/webhooks`. */
  baseUrl: string;
  /** A real TEST user's id — the server-baked identity the tools carry as `?uid=`. */
  uid: string;
  /** The tool secret, if the routes are secret-guarded (createConvaiWebhookRoutes({ toolSecret })). */
  toolSecret?: string;
  /** Service-role client for sentinel cleanup. Without it, the sentinel memory is left behind. */
  supabase?: SupabaseLike;
  /** Memory table name (default 'convai_memory'). */
  memoryTable?: string;
  /** Injectable fetch (default global). */
  fetchImpl?: typeof fetch;
  /** Unique-ish run id for the sentinel (default from the clock). Pass to avoid clock use. */
  runId?: string;
  /**
   * Also assert CONTINUITY: that a NEW conversation sees the previous one.
   *
   * This is the check that catches the failure a user actually notices — reconnecting and being
   * greeted with "this is our first chat here" while the memory rows sit in the database. Every
   * other check here can pass while this is broken, because save→recall within one session says
   * nothing about what happens on the next connect.
   *
   * Default TRUE. Set false only if the consumer genuinely does not mount a start route; the check
   * fails loudly rather than skipping quietly, because a silently-skipped continuity check is how
   * this bug shipped in the first place.
   */
  expectContinuity?: boolean;
  /** The connect route, relative to baseUrl. Default 'start_conversation'. */
  startRoute?: string;
  /**
   * The header the consumer's routes read the tool secret from. Default `x-convai-tool-secret`.
   *
   * `createConvaiWebhookRoutes` already lets a consumer name this header (CONVAI_TOOL_SECRET_HEADER),
   * and several do — so hardcoding it here made the probe 401 against exactly the products that had
   * bothered to guard their routes. The guard being unusable by hardened consumers is a large part
   * of why it ran in zero repos.
   */
  toolSecretHeader?: string;
}

/**
 * Probe the deployed memory loop. Returns pass=false with per-check detail on any failure.
 * Never throws — a thrown call becomes a failed check.
 */
export async function probeMemoryLoop(opts: ProbeMemoryLoopOptions): Promise<MemoryLoopResult> {
  const {
    baseUrl,
    uid,
    toolSecret,
    supabase,
    memoryTable = 'convai_memory',
    fetchImpl = fetch,
    expectContinuity = true,
    startRoute = 'start_conversation',
    toolSecretHeader = 'x-convai-tool-secret',
    runId = `probe_${Date.now()}`,
  } = opts;

  const base = baseUrl.replace(/\/$/, '');
  const sentinel = `convai-probe-${runId}`;
  const checks: MemoryLoopCheck[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const headers = (secret?: string): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(secret ? { [toolSecretHeader]: secret } : {}),
  });

  const post = async (route: string, query: string, body: unknown, secret?: string) => {
    const res = await fetchImpl(`${base}/${route}${query}`, {
      method: 'POST',
      headers: headers(secret),
      body: JSON.stringify(body),
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, json };
  };

  try {
    // 1. save_memory — the way EL calls it: uid in URL, body = the fact only.
    const save = await post('save_memory', `?uid=${encodeURIComponent(uid)}`, { memory: `Probe fact ${sentinel}.`, category: 'context' }, toolSecret);
    check('save_memory (uid in URL) succeeds', save.status === 200 && save.json?.success === true, `status ${save.status}`);

    // 2. recall_memory — body = query only. THE regression guard: does recall find what save saved,
    //    resolving identity from the baked uid (no conversation binding)?
    const recall = await post('recall_memory', `?uid=${encodeURIComponent(uid)}`, { query: sentinel }, toolSecret);
    const found = (recall.json?.found ?? 0) >= 1 && JSON.stringify(recall.json?.memories ?? recall.json?.results ?? []).includes(sentinel);
    check('recall_memory (query only, uid in URL) finds the saved fact', recall.status === 200 && found, `status ${recall.status}, found=${recall.json?.found}`);

    // 3. auth is enforced (only when a secret is configured).
    if (toolSecret) {
      const noAuth = await post('recall_memory', `?uid=${encodeURIComponent(uid)}`, { query: sentinel }, 'deliberately-wrong-secret');
      check('recall_memory rejects a wrong tool secret (401)', noAuth.status === 401, `status ${noAuth.status}`);
    }

    // 4. identity isolation — a different uid must NOT see this user's sentinel.
    const foreignUid = `${uid}-probe-nonexistent`;
    const foreign = await post('recall_memory', `?uid=${encodeURIComponent(foreignUid)}`, { query: sentinel }, toolSecret);
    // Inspect the RETURNED MEMORIES, not the whole envelope. Many routes echo the query back, and
    // the query IS the sentinel — grepping the envelope makes a correctly-isolating product fail
    // its own isolation check. A guard that cries wolf gets ignored, which is how we got here.
    const foreignMemories = JSON.stringify(foreign.json?.memories ?? foreign.json?.results ?? []);
    check(
      'recall under a different uid does not leak the fact',
      !foreignMemories.includes(sentinel),
      `found=${foreign.json?.found ?? 0}`,
    );

    // 5. CONTINUITY — the check that catches what a user actually notices.
    //
    // Every check above can pass while this fails: save→recall inside one session says nothing
    // about the NEXT connect. The symptom is the agent opening with "this is our first chat here"
    // while the memory rows sit right there in the database. Assert that a fresh conversation
    // reports prior history and can surface the fact saved before it.
    if (expectContinuity) {
      const start = await post(
        startRoute,
        `?uid=${encodeURIComponent(uid)}`,
        { elevenlabs_conversation_id: `${sentinel}-conv2` },
        toolSecret,
      );
      const payload = JSON.stringify(start.json ?? {});
      // Consumers name this differently (has_history / hasHistory / returning); accept any truthy
      // signal, and also accept the prior fact appearing in the injected context.
      const signalsHistory =
        start.json?.has_history === true ||
        start.json?.hasHistory === true ||
        start.json?.returning === true ||
        payload.includes(sentinel);
      const continuityOk = start.status === 200 && signalsHistory;
      check(
        'a NEW conversation sees the previous one (no "first chat here")',
        continuityOk,
        continuityOk
          ? undefined
          : start.status === 200
            ? `no history signal in ${startRoute} response`
            : `status ${start.status} from ${startRoute} — is the route mounted?`,
      );
    }
  } catch (err) {
    check('probe completed without throwing', false, err instanceof Error ? err.message : String(err));
  } finally {
    // Cleanup the sentinel (best-effort). Without a supabase client it is left behind (logged).
    if (supabase) {
      try {
        await supabase.from(memoryTable).delete().eq('user_id', uid).like('content', `%${sentinel}%`);
      } catch { /* non-fatal */ }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[convai/testing] no supabase client — sentinel memory "${sentinel}" left for user ${uid}; delete it manually.`);
    }
  }

  return { pass: checks.every((c) => c.ok), checks };
}
