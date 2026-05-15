/**
 * @caistech/unipile-channels — Unipile API wrapper.
 *
 * Provides a typed client for sending LinkedIn connection requests, LinkedIn
 * DMs, and Gmail/Outlook emails through Unipile's unified API; managing
 * connected accounts; running LinkedIn classic and Sales Navigator searches;
 * and reading LinkedIn profile + posts data for personalisation.
 *
 * Audience-agnostic: the client doesn't know what kind of recipient it's
 * messaging — that's captured in the body the caller passes in.
 *
 * Usage:
 *   import { createUnipileClient } from '@caistech/unipile-channels';
 *   const unipile = createUnipileClient({ apiKey: process.env.UNIPILE_API_KEY!, baseUrl: process.env.UNIPILE_BASE_URL });
 *   const accounts = await unipile.listAccounts();
 *   const search = await unipile.searchLinkedInPeople({ account_id, filters: { keywords: 'private credit' } });
 *
 * API docs: https://developer.unipile.com/docs
 */

// =============================================================================
// Public types
// =============================================================================

export interface UnipileClientOptions {
  /** Unipile API key. Required. */
  apiKey: string;
  /** Unipile base URL (DSN). Default: https://api.unipile.com. */
  baseUrl?: string;
}

export interface UnipileAccount {
  account_id: string;
  provider: 'linkedin' | 'gmail' | 'outlook';
  identifier: string;
  status: 'active' | 'paused' | 'flagged' | 'revoked';
}

export interface UnipileAccountRaw {
  id: string;
  provider: string;
  identifier?: string;
  name?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface LinkedInConnectInput {
  account_id: string;
  recipient_profile_url: string;
  message: string;
}

export interface LinkedInDmInput {
  account_id: string;
  recipient_profile_url: string;
  body: string;
}

export interface EmailSendInput {
  account_id: string;
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
}

export interface SendResult {
  ok: boolean;
  message_id?: string;
  error?: string;
  rate_limit_signal?: boolean;
  account_health_signal?: 'captcha' | 'login_challenge' | 'lockout' | null;
}

export interface CreateHostedAuthLinkInput {
  provider: 'linkedin' | 'gmail' | 'outlook';
  /** Caller-supplied identifier passed back in the webhook (e.g. organisation_id). */
  name: string;
  /** Where Unipile redirects after a successful OAuth flow. */
  return_url: string;
  /** Webhook URL Unipile POSTs to when the account is connected. */
  notify_url: string;
  /** Link expiry. Default: 24 hours from now. */
  expires_in_ms?: number;
}

export type CreateHostedAuthLinkResult =
  | { ok: true; url: string; expires_at: string }
  | { ok: false; error: string };

export interface LinkedInPerson {
  public_id: string;
  profile_url: string;
  full_name: string;
  headline: string | null;
  location: string | null;
  current_company: string | null;
  current_company_url: string | null;
  current_company_domain: string | null;
  industry: string | null;
  raw: Record<string, unknown>;
}

export interface LinkedInSearchFilters {
  keywords?: string;
  title?: string;
  location?: string;
  current_company?: string;
  industry?: string;
  /** Default 25, max 100. */
  limit?: number;
  /** Integer array: [1]=1st-degree, [2]=2nd-degree, [3]=3rd-degree+. Combine as needed. */
  network_distance?: number[];
}

export type LinkedInSearchResult =
  | { ok: true; people: LinkedInPerson[]; total?: number; next_cursor?: string | null }
  | { ok: false; error: string; rate_limit_signal?: boolean };

export interface SalesNavigatorFilters extends LinkedInSearchFilters {
  seniority?: string[];
  function?: string[];
  years_in_position?: string;
}

export interface LinkedInProfile {
  provider_id: string;
  public_identifier: string;
  first_name: string;
  last_name: string;
  full_name: string;
  headline: string | null;
  location: string | null;
  follower_count: number | null;
  connections_count: number | null;
  shared_connections_count: number | null;
  network_distance: 'FIRST_DEGREE' | 'SECOND_DEGREE' | 'THIRD_DEGREE' | null;
  /** contact_info.emails[0] — only present for 1st-degree connections. */
  email: string | null;
  /** Only present for 1st-degree connections. */
  connected_at: Date | null;
  is_premium: boolean;
  is_influencer: boolean;
  is_creator: boolean;
  is_open_profile: boolean;
  is_relationship: boolean;
}

export interface LinkedInPost {
  id: string;
  social_id: string;
  share_url: string;
  parsed_datetime: Date | null;
  text: string;
  is_repost: boolean;
  author_name: string | null;
  author_is_company: boolean;
  reaction_counter: number;
  comment_counter: number;
  /** When this is a repost, the original post's text — useful for personalisation. */
  repost_content_text: string | null;
}

export type LinkedInProfileResult =
  | { ok: true; profile: LinkedInProfile }
  | { ok: false; error: string; status?: number };

export type LinkedInPostsResult =
  | { ok: true; posts: LinkedInPost[]; cursor?: string | null }
  | { ok: false; error: string; status?: number };

export type ListAccountsResult =
  | { ok: true; accounts: UnipileAccountRaw[] }
  | { ok: false; error: string };

export interface UnipileClient {
  // Send
  sendLinkedInConnect(input: LinkedInConnectInput): Promise<SendResult>;
  sendLinkedInDm(input: LinkedInDmInput): Promise<SendResult>;
  sendEmail(input: EmailSendInput): Promise<SendResult>;

  // Account
  listAccounts(): Promise<ListAccountsResult>;
  getAccountStatus(account_id: string): Promise<UnipileAccount | null>;

  // Hosted auth
  createHostedAuthLink(input: CreateHostedAuthLinkInput): Promise<CreateHostedAuthLinkResult>;

  // Search
  searchLinkedInPeople(input: { account_id: string; filters: LinkedInSearchFilters }): Promise<LinkedInSearchResult>;
  searchSalesNavigator(input: { account_id: string; filters: SalesNavigatorFilters }): Promise<LinkedInSearchResult>;

  // Profile + posts
  getLinkedInProfile(input: { account_id: string; provider_id: string }): Promise<LinkedInProfileResult>;
  getLinkedInPosts(input: { account_id: string; provider_id: string; limit?: number }): Promise<LinkedInPostsResult>;
}

const DEFAULT_BASE_URL = 'https://api.unipile.com';
const PROFILE_FETCH_TIMEOUT_MS = 8000;

// =============================================================================
// Standalone utilities (no client needed)
// =============================================================================

/**
 * Extract a LinkedIn provider_id from a profile URL or already-bare id.
 * Returns null if the input doesn't match any known shape.
 *
 * Recognised formats:
 *   - Bare URN-style id (no slashes/protocol)
 *   - Profile URL with `?miniProfileUrn=urn:li:fs_miniProfile:XXX` query param
 *   - Profile URL path `/in/<public_id>`
 */
export function extractLinkedInProviderId(profileOrId: string): string | null {
  if (!profileOrId) return null;

  if (!profileOrId.includes('/') && !profileOrId.includes('?') && profileOrId.length > 8) {
    return profileOrId.trim();
  }

  try {
    const url = new URL(profileOrId);
    const miniUrn = url.searchParams.get('miniProfileUrn');
    if (miniUrn) {
      const decoded = decodeURIComponent(miniUrn);
      const match = decoded.match(/urn:li:fs_miniProfile:(.+)/);
      if (match && match[1]) return match[1].trim();
    }
    const pathMatch = url.pathname.match(/\/in\/([^/]+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1].trim();
  } catch {
    const match = profileOrId.match(/\/in\/([^/?]+)/);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

// =============================================================================
// Internals
// =============================================================================

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  let cause: unknown = (err as Error & { cause?: unknown }).cause;
  let depth = 0;
  while (cause && depth < 4) {
    if (cause instanceof Error) {
      const c = cause as Error & { code?: string; errno?: number; hostname?: string };
      const bits = [c.message];
      if (c.code) bits.push(`code=${c.code}`);
      if (c.hostname) bits.push(`host=${c.hostname}`);
      parts.push(bits.join(' '));
      cause = c.cause;
    } else {
      parts.push(String(cause));
      cause = undefined;
    }
    depth += 1;
  }
  return parts.join(' ← ');
}

function parseUnipileError(status: number, body: string): SendResult {
  if (status === 429) {
    return { ok: false, error: `Rate limited: ${body}`, rate_limit_signal: true };
  }
  if (status === 403) {
    if (/captcha/i.test(body)) {
      return { ok: false, error: 'LinkedIn captcha challenge', account_health_signal: 'captcha' };
    }
    if (/login|auth/i.test(body)) {
      return { ok: false, error: 'LinkedIn login challenge', account_health_signal: 'login_challenge' };
    }
    return { ok: false, error: `Forbidden: ${body}`, account_health_signal: 'lockout' };
  }
  return { ok: false, error: `Unipile error ${status}: ${body}` };
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function normaliseLinkedInPerson(p: Record<string, unknown>): LinkedInPerson {
  const public_id =
    pickString(p, 'public_id') ||
    pickString(p, 'public_identifier') ||
    pickString(p, 'id') ||
    '';

  const profile_url =
    pickString(p, 'public_profile_url') ||
    pickString(p, 'profile_url') ||
    (public_id ? `https://www.linkedin.com/in/${public_id}` : '');

  const full_name =
    pickString(p, 'name') ||
    pickString(p, 'full_name') ||
    [pickString(p, 'first_name'), pickString(p, 'last_name')].filter(Boolean).join(' ').trim();

  const currentCompanyObj =
    (p.current_company as Record<string, unknown> | undefined) ||
    (Array.isArray(p.experiences) ? (p.experiences[0] as Record<string, unknown>) : undefined);

  const current_company = currentCompanyObj ? pickString(currentCompanyObj, 'name') : null;
  const current_company_url = currentCompanyObj ? pickString(currentCompanyObj, 'url') : null;
  const current_company_domain = currentCompanyObj ? pickString(currentCompanyObj, 'website') : null;

  return {
    public_id,
    profile_url,
    full_name,
    headline: pickString(p, 'headline') || pickString(p, 'title'),
    location: pickString(p, 'location') || pickString(p, 'location_name'),
    current_company,
    current_company_url,
    current_company_domain,
    industry: pickString(p, 'industry'),
    raw: p,
  };
}

function parseLinkedInSearchResponse(text: string): LinkedInSearchResult {
  let parsed: { items?: unknown[]; data?: unknown[]; results?: unknown[]; total?: number; cursor?: string | null };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: `Non-JSON Unipile response: ${text.slice(0, 200)}` };
  }
  const rawItems = (parsed.items || parsed.data || parsed.results || []) as Array<Record<string, unknown>>;
  const people: LinkedInPerson[] = rawItems.map((p) => normaliseLinkedInPerson(p));
  return {
    ok: true,
    people,
    total: parsed.total,
    next_cursor: parsed.cursor ?? null,
  };
}

// =============================================================================
// Client factory
// =============================================================================

/**
 * Build a Unipile client bound to a single API key + base URL.
 * Each method is a thin wrapper over a Unipile HTTP endpoint.
 *
 * The factory does not validate the apiKey upfront — most methods return a
 * structured error result rather than throwing, so a missing key surfaces at
 * call time with a clear `{ ok: false, error: '...' }`.
 */
export function createUnipileClient(options: UnipileClientOptions): UnipileClient {
  if (!options.apiKey) {
    throw new Error('createUnipileClient: apiKey is required');
  }
  const apiKey = options.apiKey;
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;

  const sendLinkedInConnect: UnipileClient['sendLinkedInConnect'] = async (input) => {
    if (input.message.length > 300) {
      return { ok: false, error: 'LinkedIn connection note exceeds 300-char limit' };
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/users/invite`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: input.account_id,
          provider_id: input.recipient_profile_url,
          message: input.message,
        }),
      });
      if (!response.ok) {
        const error = await response.text();
        return parseUnipileError(response.status, error);
      }
      const json = await response.json();
      return { ok: true, message_id: json.invitation_id || json.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const sendLinkedInDm: UnipileClient['sendLinkedInDm'] = async (input) => {
    // Unipile uses two endpoints depending on whether a chat already exists:
    //   - New chat (first DM)       → POST /api/v1/chats with attendees_ids + text
    //   - Existing chat (follow-up) → POST /api/v1/chats/{chat_id}/messages
    // Treating every send as a new chat — Unipile dedupes by attendees, so
    // re-sending to the same recipient creates messages in the existing chat
    // thread rather than duplicating chats.
    const recipientId = extractLinkedInProviderId(input.recipient_profile_url);
    if (!recipientId) {
      return {
        ok: false,
        error: `Could not extract LinkedIn provider_id from recipient_profile_url: ${input.recipient_profile_url.slice(0, 120)}`,
      };
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/chats`, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          account_id: input.account_id,
          attendees_ids: [recipientId],
          text: input.body,
        }),
      });
      if (!response.ok) {
        const error = await response.text();
        return parseUnipileError(response.status, error);
      }
      const json = await response.json();
      return { ok: true, message_id: json.message_id || json.id || json.chat_id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const sendEmail: UnipileClient['sendEmail'] = async (input) => {
    try {
      const response = await fetch(`${baseUrl}/api/v1/emails`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: input.account_id,
          to: [{ address: input.to }],
          subject: input.subject,
          body: input.body_text,
          html_body: input.body_html,
        }),
      });
      if (!response.ok) {
        const error = await response.text();
        return parseUnipileError(response.status, error);
      }
      const json = await response.json();
      return { ok: true, message_id: json.message_id || json.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const listAccounts: UnipileClient['listAccounts'] = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/v1/accounts`, {
        headers: { 'X-API-KEY': apiKey, accept: 'application/json' },
      });
      const text = await response.text();
      if (!response.ok) {
        return { ok: false, error: `Unipile ${response.status}: ${text.slice(0, 300)}` };
      }
      let parsed: { items?: UnipileAccountRaw[]; accounts?: UnipileAccountRaw[] } | UnipileAccountRaw[];
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: `Non-JSON response: ${text.slice(0, 200)}` };
      }
      const accounts = Array.isArray(parsed)
        ? parsed
        : parsed.items || parsed.accounts || [];
      return { ok: true, accounts };
    } catch (err) {
      return { ok: false, error: `Network/fetch error: ${formatFetchError(err)}` };
    }
  };

  const getAccountStatus: UnipileClient['getAccountStatus'] = async (account_id) => {
    try {
      const response = await fetch(`${baseUrl}/api/v1/accounts/${account_id}`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!response.ok) return null;
      const json = await response.json();
      return {
        account_id: json.id,
        provider: json.provider,
        identifier: json.identifier,
        status: json.status === 'OK' ? 'active' : 'flagged',
      };
    } catch {
      return null;
    }
  };

  const createHostedAuthLink: UnipileClient['createHostedAuthLink'] = async (input) => {
    const expiresOn = new Date(Date.now() + (input.expires_in_ms ?? 24 * 60 * 60 * 1000)).toISOString();

    const body = {
      type: 'create',
      providers: [input.provider.toUpperCase()],
      api_url: baseUrl,
      expiresOn,
      success_redirect_url: input.return_url,
      failure_redirect_url: input.return_url + '?error=oauth_failed',
      notify_url: input.notify_url,
      name: input.name,
    };

    try {
      const response = await fetch(`${baseUrl}/api/v1/hosted/accounts/link`, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      if (!response.ok) {
        return {
          ok: false,
          error: `Unipile ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
        };
      }

      let json: { url?: string; expires_at?: string } = {};
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false, error: `Unipile returned non-JSON: ${text.slice(0, 200)}` };
      }

      if (!json.url) {
        return { ok: false, error: `Unipile responded 200 but no url field: ${JSON.stringify(json).slice(0, 200)}` };
      }
      return { ok: true, url: json.url, expires_at: json.expires_at || '' };
    } catch (err) {
      const detail = formatFetchError(err);
      return { ok: false, error: `Network/fetch error calling ${baseUrl}: ${detail}` };
    }
  };

  const searchLinkedInPeople: UnipileClient['searchLinkedInPeople'] = async (input) => {
    try {
      // Unipile expects account_id as a URL query parameter, not in the body.
      const url = new URL(`${baseUrl}/api/v1/linkedin/search`);
      url.searchParams.set('account_id', input.account_id);

      // Body shape per Unipile docs:
      //   api: 'classic'
      //   category: 'people' (lowercase)
      //   keywords: free-text
      //   network_distance: integer array — [1]=1st, [2]=2nd, [3]=3rd+
      //   limit: integer
      // Location and industry filters need LinkedIn-internal integer IDs.
      const body: Record<string, unknown> = {
        api: 'classic',
        category: 'people',
        keywords: input.filters.keywords || '',
        limit: Math.min(input.filters.limit || 25, 100),
      };
      if (input.filters.network_distance && input.filters.network_distance.length > 0) {
        body.network_distance = input.filters.network_distance;
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      if (!response.ok) {
        if (response.status === 429) {
          return { ok: false, error: `Rate limited: ${text.slice(0, 2500)}`, rate_limit_signal: true };
        }
        return { ok: false, error: `Unipile ${response.status}: ${text.slice(0, 2500)}` };
      }

      return parseLinkedInSearchResponse(text);
    } catch (err) {
      return { ok: false, error: `Network/fetch error: ${formatFetchError(err)}` };
    }
  };

  const searchSalesNavigator: UnipileClient['searchSalesNavigator'] = async (input) => {
    try {
      const url = new URL(`${baseUrl}/api/v1/linkedin/search`);
      url.searchParams.set('account_id', input.account_id);

      const body: Record<string, unknown> = {
        api: 'sales_navigator',
        category: 'people',
        keywords: input.filters.keywords || '',
        limit: Math.min(input.filters.limit || 25, 100),
      };
      if (input.filters.network_distance && input.filters.network_distance.length > 0) {
        body.network_distance = input.filters.network_distance;
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      if (!response.ok) {
        if (response.status === 403 && /sales[_ -]?nav/i.test(text)) {
          return { ok: false, error: 'Connected LinkedIn account has no active Sales Navigator subscription' };
        }
        if (response.status === 429) {
          return { ok: false, error: `Rate limited: ${text.slice(0, 2500)}`, rate_limit_signal: true };
        }
        return { ok: false, error: `Unipile ${response.status}: ${text.slice(0, 2500)}` };
      }

      return parseLinkedInSearchResponse(text);
    } catch (err) {
      return { ok: false, error: `Network/fetch error: ${formatFetchError(err)}` };
    }
  };

  const getLinkedInProfile: UnipileClient['getLinkedInProfile'] = async (input) => {
    try {
      const url = new URL(`${baseUrl}/api/v1/users/${encodeURIComponent(input.provider_id)}`);
      url.searchParams.set('account_id', input.account_id);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
      });

      const text = await response.text();
      if (!response.ok) {
        return { ok: false, error: `Unipile ${response.status}: ${text.slice(0, 500)}`, status: response.status };
      }

      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { ok: false, error: `Non-JSON response: ${text.slice(0, 200)}` };
      }

      const contactInfo = raw.contact_info as { emails?: string[] } | undefined;
      const email = contactInfo?.emails && contactInfo.emails.length > 0 ? contactInfo.emails[0] : null;

      const connectedAtMs = typeof raw.connected_at === 'number' ? raw.connected_at : null;

      const first_name = (raw.first_name as string) || '';
      const last_name = (raw.last_name as string) || '';

      const profile: LinkedInProfile = {
        provider_id: (raw.provider_id as string) || input.provider_id,
        public_identifier: (raw.public_identifier as string) || '',
        first_name,
        last_name,
        full_name: [first_name, last_name].filter(Boolean).join(' ').trim(),
        headline: (raw.headline as string) || null,
        location: (raw.location as string) || null,
        follower_count: typeof raw.follower_count === 'number' ? raw.follower_count : null,
        connections_count: typeof raw.connections_count === 'number' ? raw.connections_count : null,
        shared_connections_count: typeof raw.shared_connections_count === 'number' ? raw.shared_connections_count : null,
        network_distance: (raw.network_distance as LinkedInProfile['network_distance']) || null,
        email: email ?? null,
        connected_at: connectedAtMs ? new Date(connectedAtMs) : null,
        is_premium: raw.is_premium === true,
        is_influencer: raw.is_influencer === true,
        is_creator: raw.is_creator === true,
        is_open_profile: raw.is_open_profile === true,
        is_relationship: raw.is_relationship === true,
      };

      return { ok: true, profile };
    } catch (err) {
      return { ok: false, error: `Network/fetch error: ${formatFetchError(err)}` };
    }
  };

  const getLinkedInPosts: UnipileClient['getLinkedInPosts'] = async (input) => {
    try {
      const url = new URL(`${baseUrl}/api/v1/users/${encodeURIComponent(input.provider_id)}/posts`);
      url.searchParams.set('account_id', input.account_id);
      url.searchParams.set('limit', String(input.limit || 5));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
      });

      const text = await response.text();
      if (!response.ok) {
        return { ok: false, error: `Unipile ${response.status}: ${text.slice(0, 500)}`, status: response.status };
      }

      let parsed: { items?: Array<Record<string, unknown>>; cursor?: string | null };
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: `Non-JSON response: ${text.slice(0, 200)}` };
      }

      const items = parsed.items || [];
      const posts: LinkedInPost[] = items.map((p) => {
        const author = p.author as { name?: string; is_company?: boolean } | undefined;
        const repostContent = p.repost_content as { text?: string } | undefined;
        const parsedDt = typeof p.parsed_datetime === 'string' ? new Date(p.parsed_datetime) : null;
        return {
          id: (p.id as string) || '',
          social_id: (p.social_id as string) || '',
          share_url: (p.share_url as string) || '',
          parsed_datetime: parsedDt && !isNaN(parsedDt.getTime()) ? parsedDt : null,
          text: (p.text as string) || '',
          is_repost: p.is_repost === true,
          author_name: author?.name || null,
          author_is_company: author?.is_company === true,
          reaction_counter: typeof p.reaction_counter === 'number' ? p.reaction_counter : 0,
          comment_counter: typeof p.comment_counter === 'number' ? p.comment_counter : 0,
          repost_content_text: repostContent?.text || null,
        };
      });

      return { ok: true, posts, cursor: parsed.cursor ?? null };
    } catch (err) {
      return { ok: false, error: `Network/fetch error: ${formatFetchError(err)}` };
    }
  };

  return {
    sendLinkedInConnect,
    sendLinkedInDm,
    sendEmail,
    listAccounts,
    getAccountStatus,
    createHostedAuthLink,
    searchLinkedInPeople,
    searchSalesNavigator,
    getLinkedInProfile,
    getLinkedInPosts,
  };
}
