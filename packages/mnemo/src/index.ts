/**
 * @caistech/mnemo — the one Mnemo client.
 *
 * Mnemo (the partner semantic-memory API) had been written four times across the portfolio before
 * this package existed: `@caistech/planning-memory`, `scripts/bug-memory.mjs`, Kira's
 * `lib/kira/mnemo.ts`, and SayFix's `src/lib/mnemo.ts`. All four make the same two HTTP calls to
 * `/v1/memories` and `/v1/search`, with the same fail-soft posture, and differ only in how they choose a
 * scope.
 *
 * So the split is: **this package owns the TRANSPORT, each consumer owns its SCOPE POLICY.** That
 * division is deliberate and load-bearing, because the scope policies are genuinely different and
 * must not be unified:
 *
 *   - planning-memory  → `caistech-planning-<state>`  SHARED + jurisdiction-keyed, so retrieval
 *                        depth compounds across products. Explicitly NOT tenant-scoped.
 *   - bug-knowledge    → one portfolio-wide scope, for cross-product recall of prior fixes.
 *   - voice memory     → PER-USER isolation (DATA_STANDARD S2) — one owner's memory must never
 *                        surface for another.
 *   - SayFix           → per-website.
 *
 * A single "correct" scope would break three of the four. Passing the scope in keeps each policy
 * where the domain knowledge is, while the fiddly part — auth, fail-soft, never-throw — is written
 * once.
 *
 * FAIL-SOFT IS THE CONTRACT. With no API key, `add` no-ops and `search` returns []. Every network
 * or parse error is swallowed. Memory is an enhancement: a Mnemo outage must degrade recall, never
 * break the call path it sits in (DATA_STANDARD R4 — degrade, don't fake).
 *
 * Zero dependencies; native fetch.
 */

/** Mnemo scopes are `{ type: 'org', id }`. The id is the isolation boundary — choose it carefully. */
export interface MnemoScope {
  type: 'org';
  id: string;
}

/** Build an org scope. The id must be STABLE — never a mutable string that can collide across tenants. */
export function orgScope(id: string): MnemoScope {
  return { type: 'org', id };
}

export interface MnemoClientOptions {
  /** Defaults to `MNEMO_API_KEY`. Absent ⇒ the client is disabled and every call no-ops. */
  apiKey?: string;
  /** Defaults to `MNEMO_API_URL`, then `https://api.mnemohq.com`. */
  apiUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Prefixes log lines so a failure is attributable to a consumer. */
  label?: string;
}

/** A memory with the id needed to act on it. Returned by `find`, consumed by `forget`. */
export interface MnemoMemory {
  id: string;
  content: string;
}

export interface MnemoClient {
  /** Is a key configured? Consumers use this to skip work, not to decide whether it's safe to call. */
  enabled(): boolean;
  /** Add distilled facts. Returns how many were accepted; 0 when disabled or on any failure. */
  add(scope: MnemoScope, contents: string[]): Promise<number>;
  /** Semantic search. Returns the matching contents, or [] when disabled or on any failure. */
  search(scope: MnemoScope, query: string, limit?: number): Promise<string[]>;
  /**
   * Semantic search that keeps the memory ids.
   *
   * The same call as `search`, which throws the ids away. That was fine while the only verb was
   * "read", and it is what made a redaction impossible: a product could see a fact in Mnemo and had
   * no handle to act on it.
   *
   * `search` is deliberately left alone rather than widened — four consumers depend on its
   * `string[]` return, and a shared package earns its keep by not making them all edit.
   */
  find(scope: MnemoScope, query: string, limit?: number): Promise<MnemoMemory[]>;
  /**
   * Forget one memory. Returns true when Mnemo accepted it.
   *
   * WHY THIS EXISTS. A product whose users can delete a fact could delete it everywhere except
   * here. Kira's owner can remove a line from his Business Genome — it leaves the page, his recall
   * and his export — and the dual-written copy in the semantic lane survived, so she could still
   * bring it up in a later conversation. He would have taken it back from everything he could see
   * and been wrong. For an owner whose most sensitive line is that he is selling and has told
   * nobody, that gap is the product failing at the one promise it makes about his privacy.
   *
   * Mnemo's DELETE is a SOFT delete inside a recoverable window, which is the same posture the
   * consumers already take (Kira parks the row rather than dropping it) — so a mistaken removal is
   * recoverable on both sides rather than only one.
   *
   * Fail-soft like everything else, and that cuts BOTH ways here: a failure returns false rather
   * than throwing, so the caller decides whether a partial redaction is worth telling the user
   * about. It must not be reported to him as done.
   */
  forget(id: string): Promise<boolean>;
}

const DEFAULT_URL = 'https://api.mnemohq.com';

export function createMnemoClient(options: MnemoClientOptions = {}): MnemoClient {
  const label = options.label ?? 'mnemo';
  const doFetch = options.fetchImpl ?? fetch;

  // Resolved per call, not captured at construction: a module built during a Next.js build has no
  // env, and capturing there would disable the client for the process's whole life.
  const key = () => (options.apiKey ?? process.env.MNEMO_API_KEY)?.trim() || undefined;
  const url = () =>
    (options.apiUrl ?? process.env.MNEMO_API_URL ?? DEFAULT_URL).replace(/\/$/, '');

  return {
    enabled: () => Boolean(key()),

    async add(scope, contents) {
      const apiKey = key();
      const items = (contents ?? []).map((c) => c?.trim()).filter(Boolean) as string[];
      if (!apiKey || !scope?.id || items.length === 0) return 0;

      try {
        const res = await doFetch(`${url()}/v1/memories`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, items: items.map((content) => ({ content })) }),
        });
        if (!res.ok) {
          console.warn(`[${label}] add failed: ${res.status}`);
          return 0;
        }
        return items.length;
      } catch (error) {
        console.warn(`[${label}] add failed:`, error instanceof Error ? error.message : error);
        return 0;
      }
    },

    async search(scope, query, limit = 6) {
      const apiKey = key();
      if (!apiKey || !scope?.id || !query?.trim()) return [];

      try {
        const res = await doFetch(`${url()}/v1/search`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, scope, limit }),
        });
        if (!res.ok) {
          console.warn(`[${label}] search failed: ${res.status}`);
          return [];
        }
        const data = (await res.json()) as { results?: { content?: string }[] };
        return (data.results ?? []).map((r) => r?.content?.trim()).filter(Boolean) as string[];
      } catch (error) {
        console.warn(`[${label}] search failed:`, error instanceof Error ? error.message : error);
        return [];
      }
    },

    async find(scope, query, limit = 6) {
      const apiKey = key();
      if (!apiKey || !scope?.id || !query?.trim()) return [];

      try {
        const res = await doFetch(`${url()}/v1/search`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, scope, limit }),
        });
        if (!res.ok) {
          console.warn(`[${label}] find failed: ${res.status}`);
          return [];
        }
        const data = (await res.json()) as { results?: { memoryId?: string; content?: string }[] };
        return (data.results ?? [])
          .map((r) => ({ id: String(r?.memoryId ?? '').trim(), content: String(r?.content ?? '').trim() }))
          // Both halves are required: an id with no content cannot be shown to anyone for
          // confirmation, and content with no id cannot be acted on.
          .filter((m) => m.id && m.content);
      } catch (error) {
        console.warn(`[${label}] find failed:`, error instanceof Error ? error.message : error);
        return [];
      }
    },

    async forget(id) {
      const apiKey = key();
      const memoryId = String(id ?? '').trim();
      if (!apiKey || !memoryId) return false;

      try {
        const res = await doFetch(`${url()}/v1/memories/${encodeURIComponent(memoryId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        // 404 counts as success: the caller wanted this memory gone, and a memory that is not there
        // is gone. Reporting failure would make a retry loop out of an already-correct state.
        if (res.ok || res.status === 404) return true;
        console.warn(`[${label}] forget failed: ${res.status}`);
        return false;
      } catch (error) {
        console.warn(`[${label}] forget failed:`, error instanceof Error ? error.message : error);
        return false;
      }
    },
  };
}

/**
 * Normalise a fact for duplicate detection — lower-cased, punctuation and whitespace collapsed.
 *
 * Here rather than in a consumer because every consumer that writes repeatedly needs it: without
 * it, an append-on-every-conversation loop fills Mnemo with the same fact worded identically, and
 * recall gets noisy in a way that looks like the model degrading.
 *
 * Catches literal repeats, which are the bulk of the noise. Semantic near-duplicates
 * ("developing X" vs "currently developing X") need embeddings and are out of scope.
 */
export function normaliseFact(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
