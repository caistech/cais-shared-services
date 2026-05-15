/**
 * @caistech/hunter-email — Hunter.io API wrapper for email enrichment.
 *
 * Usage:
 *   import { hunterEmailFinder, hunterDomainSearch, hunterEmailVerifier } from '@caistech/hunter-email';
 *   const found = await hunterEmailFinder('example.com', 'Jane', 'Smith', apiKey);
 *   const domain = await hunterDomainSearch('example.com', apiKey);
 *   const check  = await hunterEmailVerifier('jane@example.com', apiKey);
 */

export interface HunterEmailResult {
  email: string;
  first_name: string;
  last_name: string;
  position: string | null;
  confidence: number;
  type: string;
  linkedin: string | null;
  sources: Array<{ domain: string; uri: string }>;
}

export interface HunterDomainEmail {
  value: string;
  type: string;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  linkedin: string | null;
}

export interface HunterDomainResult {
  domain: string;
  organisation: string;
  emails: HunterDomainEmail[];
}

export interface HunterEmailVerifierResult {
  status: string;
  score: number;
  result: string;
}

export interface HunterDomainSearchOptions {
  /** Max emails to return per domain. Default: 10 (Hunter free tier max). */
  limit?: number;
}

const HUNTER_BASE = 'https://api.hunter.io/v2';

/**
 * Look up an email by domain + first/last name.
 * Returns null when Hunter has no match (HTTP 404). Throws on other errors.
 */
export async function hunterEmailFinder(
  domain: string,
  firstName: string,
  lastName: string,
  apiKey: string,
): Promise<HunterEmailResult | null> {
  if (!apiKey) throw new Error('Hunter apiKey is required');

  const params = new URLSearchParams({
    domain,
    first_name: firstName,
    last_name: lastName,
    api_key: apiKey,
  });

  const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => '');
    throw new Error(`Hunter Email Finder failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { data?: Record<string, unknown> };
  const d = json.data;
  if (!d?.email) return null;

  return {
    email: d.email as string,
    first_name: (d.first_name as string) ?? '',
    last_name: (d.last_name as string) ?? '',
    position: (d.position as string | null) ?? null,
    confidence: (d.confidence as number) ?? 0,
    type: (d.type as string) ?? '',
    linkedin: (d.linkedin as string | null) ?? null,
    sources: (d.sources as Array<{ domain: string; uri: string }>) ?? [],
  };
}

/**
 * Pull all known emails for a domain.
 * Returns null when Hunter has no record (HTTP 404).
 */
export async function hunterDomainSearch(
  domain: string,
  apiKey: string,
  options?: HunterDomainSearchOptions,
): Promise<HunterDomainResult | null> {
  if (!apiKey) throw new Error('Hunter apiKey is required');

  const params = new URLSearchParams({
    domain,
    api_key: apiKey,
    limit: String(options?.limit ?? 10),
  });

  const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => '');
    throw new Error(`Hunter Domain Search failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { data?: Record<string, unknown> };
  const d = json.data;
  if (!d) return null;

  const emails = (d.emails as Array<Record<string, unknown>> | undefined) ?? [];

  return {
    domain: (d.domain as string) ?? domain,
    organisation: (d.organization as string) ?? (d.organisation as string) ?? '',
    emails: emails.map((e) => ({
      value: e.value as string,
      type: e.type as string,
      confidence: (e.confidence as number) ?? 0,
      first_name: (e.first_name as string | null) ?? null,
      last_name: (e.last_name as string | null) ?? null,
      position: (e.position as string | null) ?? null,
      linkedin: (e.linkedin as string | null) ?? null,
    })),
  };
}

/**
 * Verify deliverability of an email address.
 * Returns null on any non-2xx response (verifier is best-effort).
 */
export async function hunterEmailVerifier(
  email: string,
  apiKey: string,
): Promise<HunterEmailVerifierResult | null> {
  if (!apiKey) throw new Error('Hunter apiKey is required');

  const params = new URLSearchParams({ email, api_key: apiKey });
  const res = await fetch(`${HUNTER_BASE}/email-verifier?${params}`);
  if (!res.ok) return null;

  const json = (await res.json()) as { data?: Record<string, unknown> };
  const d = json.data;
  if (!d) return null;

  return {
    status: (d.status as string) ?? '',
    score: (d.score as number) ?? 0,
    result: (d.result as string) ?? '',
  };
}
