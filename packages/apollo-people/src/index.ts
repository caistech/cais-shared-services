/**
 * @caistech/apollo-people — Apollo.io REST API wrapper.
 *
 * Two-step contact-finding pattern:
 *   1. apolloPeopleSearch — find candidate people at a domain matching
 *      ICP titles/seniorities. FREE — does not consume Apollo credits.
 *      Returns candidate metadata (id, first name, obfuscated last name,
 *      title, has_email flag) but NOT the email itself.
 *   2. apolloPersonEnrichment — reveal a single person's email. Costs
 *      1 credit per successful match. Called on the best candidate from
 *      step 1 (or with name+domain when no person_id available).
 *
 * Endpoint base: https://api.apollo.io/api/v1
 * Auth: X-Api-Key header (URL params are being deprecated as of late 2025).
 *
 * Shape conventions mirror @caistech/hunter-email:
 *   - apiKey is passed as an argument (no env reading)
 *   - Network/HTTP errors throw; "not found" returns null
 *   - No project-side coupling (no metering, no logger, no DB)
 *
 * Consumers add metering, env resolution, and timeouts in their adapter
 * (see investorpilot's src/lib/agent/apollo-tools.ts pattern).
 */

export interface ApolloPersonSummary {
  /** Apollo's internal person ID — pass to enrichment to reveal email. */
  id: string;
  first_name: string | null;
  last_name_obfuscated: string | null;
  title: string | null;
  has_email: boolean;
  organization_name: string | null;
  last_refreshed_at: string | null;
}

export interface ApolloEnrichedPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  title: string | null;
  email: string | null;
  /** 'verified' / 'likely' / 'unavailable' / null. */
  email_status: string | null;
  linkedin_url: string | null;
  organization_name: string | null;
}

export interface ApolloPeopleSearchOptions {
  domain: string;
  /** ICP titles to filter on (e.g. ["CEO","Director of Finance"]). */
  titles?: string[];
  /**
   * Apollo seniority enum values:
   *   owner, founder, c_suite, partner, vp, head, director, manager,
   *   senior, entry, intern.
   */
  seniorities?: string[];
  /** Default: 5. Max 100 per Apollo's docs. */
  per_page?: number;
  /** 1-indexed. */
  page?: number;
  signal?: AbortSignal;
}

export interface ApolloPersonEnrichmentOptions {
  /** Preferred — returns from a prior People Search. */
  person_id?: string;
  /** Fallback — match by name + domain. */
  first_name?: string;
  last_name?: string;
  domain?: string;
  /** Match by known email (verifies + enriches). */
  email?: string;
  /**
   * Whether to also reveal personal (non-work) emails. Default false;
   * personal email reveals consume an additional credit.
   */
  reveal_personal_emails?: boolean;
  signal?: AbortSignal;
}

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

interface ApolloSearchPersonRaw {
  id?: string;
  first_name?: string;
  last_name_obfuscated?: string;
  title?: string;
  has_email?: boolean;
  organization?: { name?: string };
  last_refreshed_at?: string;
}

interface ApolloEnrichmentPersonRaw {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  linkedin_url?: string;
  organization?: { name?: string };
}

function normaliseDomain(domain: string): string {
  return domain.replace(/^www\./, '').replace(/\/.*$/, '');
}

async function apolloFetch(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!apiKey) throw new Error('Apollo apiKey is required');

  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Apollo ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * People API Search — find net-new people at a domain matching ICP.
 * FREE. Returns [] when Apollo has no matches.
 */
export async function apolloPeopleSearch(
  options: ApolloPeopleSearchOptions,
  apiKey: string,
): Promise<ApolloPersonSummary[]> {
  const body: Record<string, unknown> = {
    q_organization_domains_list: [normaliseDomain(options.domain)],
    per_page: options.per_page ?? 5,
    page: options.page ?? 1,
  };
  if (options.titles?.length) body.person_titles = options.titles;
  if (options.seniorities?.length) body.person_seniorities = options.seniorities;

  const raw = await apolloFetch('/mixed_people/api_search', body, apiKey, options.signal);
  const parsed = raw as { people?: ApolloSearchPersonRaw[] };

  return (parsed.people || [])
    .map((p): ApolloPersonSummary => ({
      id: p.id || '',
      first_name: p.first_name || null,
      last_name_obfuscated: p.last_name_obfuscated || null,
      title: p.title || null,
      has_email: !!p.has_email,
      organization_name: p.organization?.name || null,
      last_refreshed_at: p.last_refreshed_at || null,
    }))
    .filter((p) => p.id);
}

/**
 * People Enrichment — reveal email for a single person. Costs 1 credit
 * per successful match. Apollo accepts EITHER person_id OR
 * name + domain. Prefer person_id (from a prior People Search) for
 * higher match accuracy.
 *
 * Returns null when Apollo couldn't match.
 */
export async function apolloPersonEnrichment(
  options: ApolloPersonEnrichmentOptions,
  apiKey: string,
): Promise<ApolloEnrichedPerson | null> {
  const body: Record<string, unknown> = {
    reveal_personal_emails: !!options.reveal_personal_emails,
  };
  if (options.person_id) body.id = options.person_id;
  if (options.first_name) body.first_name = options.first_name;
  if (options.last_name) body.last_name = options.last_name;
  if (options.domain) body.domain = normaliseDomain(options.domain);
  if (options.email) body.email = options.email;

  const raw = await apolloFetch('/people/match', body, apiKey, options.signal);
  const parsed = raw as { person?: ApolloEnrichmentPersonRaw };
  const p = parsed.person;
  if (!p) return null;

  return {
    id: p.id || '',
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    title: p.title || null,
    email: p.email || null,
    email_status: p.email_status || null,
    linkedin_url: p.linkedin_url || null,
    organization_name: p.organization?.name || null,
  };
}
