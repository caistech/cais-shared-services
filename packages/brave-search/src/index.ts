/**
 * @caistech/brave-search — Brave Search API wrapper.
 *
 * Usage:
 *   import { braveWebSearch } from '@caistech/brave-search';
 *   const results = await braveWebSearch('financial advisors melbourne', apiKey, { count: 20 });
 */

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

export interface BraveSearchOptions {
  /** Number of results (Brave API max 20). Default: 10. */
  count?: number;
  /** Search language. Default: 'en'. */
  searchLang?: string;
  /** Country code (ISO 3166-1 alpha-2). Default: 'US' (override per market). */
  country?: string;
  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
}

interface BraveSearchResponse {
  web?: {
    results: Array<{
      title: string;
      url: string;
      description: string;
    }>;
  };
}

/**
 * Web search via Brave Search API.
 * Returns flattened results from the `web.results` block.
 * Throws on non-2xx responses.
 */
export async function braveWebSearch(
  query: string,
  apiKey: string,
  options?: BraveSearchOptions,
): Promise<BraveSearchResult[]> {
  if (!apiKey) throw new Error('Brave Search apiKey is required');

  const params = new URLSearchParams({
    q: query,
    count: String(options?.count ?? 10),
    search_lang: options?.searchLang ?? 'en',
    country: options?.country ?? 'US',
  });

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: options?.signal,
  });

  if (!res.ok) {
    throw new Error(`Brave Search failed: ${res.status} ${res.statusText}`);
  }

  const data: BraveSearchResponse = await res.json();
  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description,
  }));
}
