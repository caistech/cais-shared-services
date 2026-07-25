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
    runId = `probe_${Date.now()}`,
  } = opts;

  const base = baseUrl.replace(/\/$/, '');
  const sentinel = `convai-probe-${runId}`;
  const checks: MemoryLoopCheck[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const headers = (secret?: string): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(secret ? { 'x-convai-tool-secret': secret } : {}),
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
    check('recall under a different uid does not leak the fact', !JSON.stringify(foreign.json ?? {}).includes(sentinel), `found=${foreign.json?.found}`);
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
