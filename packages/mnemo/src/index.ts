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

export interface MnemoClient {
  /** Is a key configured? Consumers use this to skip work, not to decide whether it's safe to call. */
  enabled(): boolean;
  /** Add distilled facts. Returns how many were accepted; 0 when disabled or on any failure. */
  add(scope: MnemoScope, contents: string[]): Promise<number>;
  /** Semantic search. Returns the matching contents, or [] when disabled or on any failure. */
  search(scope: MnemoScope, query: string, limit?: number): Promise<string[]>;
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
