/**
 * @caistech/email-finder — multi-provider contact + email finder cascade.
 *
 * Walks providers in confidence order:
 *   1. Hunter domain search (best confidence email at domain)
 *   2. If Hunter returns null OR returns a role-account email
 *      (admin@, info@, hello@ ...) → Apollo People Search +
 *      People Enrichment.
 *   3. Falls back to Hunter's role-account result if Apollo also misses
 *      (so the consumer can decide whether to discard).
 *
 * Optional providers:
 *   - Apollo is enabled by passing an Apollo API key. When omitted, the
 *     cascade is Hunter-only and is equivalent to calling Hunter directly.
 *
 * Shape conventions (mirrors other @caistech packages):
 *   - API keys passed as args (no env reading)
 *   - Network errors throw; "not found" returns null
 *   - No project-side coupling (metering, logging, DB)
 *
 * Consumers can wrap with their own metering / timeouts / cache.
 */

import {
  hunterDomainSearch,
  hunterEmailFinder,
  type HunterDomainResult,
} from '@caistech/hunter-email';
import {
  apolloPeopleSearch,
  apolloPersonEnrichment,
  type ApolloEnrichedPerson,
  type ApolloPersonSummary,
} from '@caistech/apollo-people';

export interface FoundContact {
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string;
  contact_linkedin: string | null;
  /** 0-100. Hunter native; Apollo mapped from email_status. */
  email_confidence: number;
  /**
   * Which provider revealed this contact.
   * - `hunter` — domain-search returned a person + verified email
   * - `apollo` — people-search + enrichment returned a person + email
   * - `hunter_pattern` — Apollo gave us the person, Hunter's email-finder
   *   derived the email from the company's known pattern. Higher bounce
   *   risk than verified providers; the consumer's bounce-webhook is
   *   the safety net.
   */
  source: 'hunter' | 'apollo' | 'hunter_pattern';
}

export interface EmailFinderKeys {
  hunter: string;
  /** Optional. When omitted, the Apollo step is skipped (Hunter-only). */
  apollo?: string;
}

export interface EmailFinderOptions {
  /** ICP titles to bias Apollo's People Search. */
  titles?: string[];
  /**
   * Apollo seniority enum values: owner, founder, c_suite, partner, vp,
   * head, director, manager, senior, entry, intern.
   */
  seniorities?: string[];
  /**
   * Per-provider timeout in milliseconds. Defaults: hunter=8000,
   * apollo=10000 (combined search + enrichment can run long).
   */
  hunterTimeoutMs?: number;
  apolloTimeoutMs?: number;
  /** Abort signal for the whole cascade. */
  signal?: AbortSignal;
  /**
   * Optional observability hook. Called once per provider call with
   * { provider, outcome, ms }. Outcome: 'hit' | 'miss' | 'error'.
   * Useful for metering / logging in the consumer.
   */
  onProviderCall?: (event: ProviderCallEvent) => void;
  /**
   * Minimum Hunter confidence (0-100) to accept a pattern-derived email
   * as a valid contact. Defaults to 70 — Hunter's empirical accuracy on
   * pattern derivation is ~80% at 70+, with bounce rate tracking below
   * 5%. Lower this for higher recall + bounce-tolerance; raise it for
   * verified-only outreach.
   */
  patternMinConfidence?: number;
}

export interface ProviderCallEvent {
  provider: 'hunter' | 'apollo_search' | 'apollo_enrichment' | 'hunter_pattern';
  outcome: 'hit' | 'miss' | 'error';
  ms: number;
  domain: string;
  /** Number of credit-consuming units used (Apollo enrichment = 1 on hit). */
  credits_used?: number;
}

const DEFAULT_HUNTER_TIMEOUT_MS = 8_000;
const DEFAULT_APOLLO_TIMEOUT_MS = 10_000;

/**
 * Role-account detector. Hunter sometimes returns the highest-confidence
 * email at a domain as admin@ / info@ / hello@ — generic inbox addresses
 * with no real person attached. These score well on Hunter's deliverability
 * check but are useless for personalised outreach. Treat as a Hunter miss
 * and fall through to Apollo.
 */
const ROLE_ACCOUNT_PREFIXES = new Set([
  'admin', 'info', 'hello', 'contact', 'support', 'help', 'sales',
  'enquiries', 'inquiries', 'office', 'mail', 'team', 'general',
  'reception', 'hr', 'careers', 'jobs', 'media', 'press', 'noreply',
  'no-reply', 'donotreply', 'do-not-reply',
]);

export function isRoleAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = (email.split('@')[0] || '').toLowerCase().trim();
  return ROLE_ACCOUNT_PREFIXES.has(local);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function hunterToFoundContact(
  result: HunterDomainResult,
): FoundContact | null {
  if (!result.emails?.length) return null;
  const sorted = [...result.emails].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];
  if (!best?.value) return null;
  return {
    contact_name: [best.first_name, best.last_name].filter(Boolean).join(' ') || null,
    contact_title: best.position || null,
    contact_email: best.value,
    contact_linkedin: best.linkedin || null,
    email_confidence: best.confidence,
    source: 'hunter',
  };
}

async function tryHunter(
  domain: string,
  apiKey: string,
  options: EmailFinderOptions,
): Promise<FoundContact | null> {
  const started = Date.now();
  try {
    const timeoutMs = options.hunterTimeoutMs ?? DEFAULT_HUNTER_TIMEOUT_MS;
    const result = await withTimeout(
      hunterDomainSearch(domain, apiKey),
      timeoutMs,
      'hunter',
    );
    const contact = result ? hunterToFoundContact(result) : null;
    options.onProviderCall?.({
      provider: 'hunter',
      outcome: contact ? 'hit' : 'miss',
      ms: Date.now() - started,
      domain,
    });
    return contact;
  } catch {
    options.onProviderCall?.({
      provider: 'hunter',
      outcome: 'error',
      ms: Date.now() - started,
      domain,
    });
    return null;
  }
}

function pickBestApolloCandidate(
  candidates: ApolloPersonSummary[],
): ApolloPersonSummary | null {
  // Prefer candidates Apollo says have an email available; without that
  // flag, enrichment is likely to come back unrevealed and waste a credit.
  const withEmail = candidates.filter((c) => c.has_email);
  const pool = withEmail.length > 0 ? withEmail : candidates;
  return pool[0] ?? null;
}

function mapApolloConfidence(emailStatus: string | null): number {
  // Apollo email_status is a string ('verified' | 'likely' | etc.); map
  // to a numeric confidence aligned with Hunter's 0-100 scale so the
  // consumer can treat both providers uniformly.
  return emailStatus === 'verified' ? 85 : emailStatus === 'likely' ? 65 : 50;
}

async function tryHunterPattern(
  domain: string,
  apiKey: string,
  firstName: string,
  lastName: string,
  enriched: ApolloEnrichedPerson | null,
  options: EmailFinderOptions,
): Promise<FoundContact | null> {
  const timeoutMs = options.hunterTimeoutMs ?? DEFAULT_HUNTER_TIMEOUT_MS;
  const minConfidence = options.patternMinConfidence ?? 70;
  const started = Date.now();
  try {
    const result = await withTimeout(
      hunterEmailFinder(domain, firstName, lastName, apiKey),
      timeoutMs,
      'hunter_pattern',
    );
    if (!result || !result.email || result.confidence < minConfidence) {
      options.onProviderCall?.({
        provider: 'hunter_pattern',
        outcome: 'miss',
        ms: Date.now() - started,
        domain,
      });
      return null;
    }
    options.onProviderCall?.({
      provider: 'hunter_pattern',
      outcome: 'hit',
      ms: Date.now() - started,
      domain,
    });
    return {
      contact_name: `${firstName} ${lastName}`,
      contact_title: enriched?.title ?? result.position ?? null,
      contact_email: result.email,
      contact_linkedin: enriched?.linkedin_url ?? result.linkedin ?? null,
      email_confidence: result.confidence,
      source: 'hunter_pattern',
    };
  } catch {
    options.onProviderCall?.({
      provider: 'hunter_pattern',
      outcome: 'error',
      ms: Date.now() - started,
      domain,
    });
    return null;
  }
}

async function tryApollo(
  domain: string,
  apolloKey: string,
  hunterKey: string | null,
  options: EmailFinderOptions,
): Promise<FoundContact | null> {
  const timeoutMs = options.apolloTimeoutMs ?? DEFAULT_APOLLO_TIMEOUT_MS;

  const searchStarted = Date.now();
  let candidates: ApolloPersonSummary[];
  try {
    candidates = await withTimeout(
      apolloPeopleSearch(
        {
          domain,
          titles: options.titles,
          seniorities: options.seniorities,
          per_page: 5,
          signal: options.signal,
        },
        apolloKey,
      ),
      timeoutMs,
      'apollo_search',
    );
    options.onProviderCall?.({
      provider: 'apollo_search',
      outcome: candidates.length > 0 ? 'hit' : 'miss',
      ms: Date.now() - searchStarted,
      domain,
    });
  } catch {
    options.onProviderCall?.({
      provider: 'apollo_search',
      outcome: 'error',
      ms: Date.now() - searchStarted,
      domain,
    });
    return null;
  }

  const best = pickBestApolloCandidate(candidates);
  if (!best) return null;

  const enrichStarted = Date.now();
  let enriched: ApolloEnrichedPerson | null = null;
  try {
    enriched = await withTimeout(
      apolloPersonEnrichment(
        {
          person_id: best.id,
          domain,
          signal: options.signal,
        },
        apolloKey,
      ),
      timeoutMs,
      'apollo_enrichment',
    );
  } catch {
    options.onProviderCall?.({
      provider: 'apollo_enrichment',
      outcome: 'error',
      ms: Date.now() - enrichStarted,
      domain,
      credits_used: 0,
    });
    return null;
  }

  // Happy path — Apollo revealed the email.
  if (enriched?.email) {
    options.onProviderCall?.({
      provider: 'apollo_enrichment',
      outcome: 'hit',
      ms: Date.now() - enrichStarted,
      domain,
      credits_used: 1,
    });
    return {
      contact_name:
        enriched.name
        || [enriched.first_name, enriched.last_name].filter(Boolean).join(' ')
        || null,
      contact_title: enriched.title || null,
      contact_email: enriched.email,
      contact_linkedin: enriched.linkedin_url || null,
      email_confidence: mapApolloConfidence(enriched.email_status),
      source: 'apollo',
    };
  }

  // Apollo gave us a person but no email. Log the miss without charging
  // a credit, then fall through to Hunter pattern-finder using the name
  // Apollo surfaced. Empirical hit rate ~50-70% on Apollo-named, no-email
  // candidates when the domain has a known Hunter pattern.
  options.onProviderCall?.({
    provider: 'apollo_enrichment',
    outcome: 'miss',
    ms: Date.now() - enrichStarted,
    domain,
    credits_used: 0,
  });

  if (!hunterKey) return null;
  const firstName = enriched?.first_name || best.first_name;
  const lastName = enriched?.last_name;
  if (!firstName || !lastName) return null;

  return tryHunterPattern(domain, hunterKey, firstName, lastName, enriched, options);
}

/**
 * Find an actionable contact (name + email) for a domain.
 *
 * Returns null when no provider chain produces a person-attached email.
 *
 * Contract (v0.2.0):
 *   - Hunter domain-search hit with a real name + non-role email →
 *     short-circuit, no Apollo credit consumed.
 *   - Hunter hit with a role-only email (admin@, info@) → treated as a
 *     miss; the cascade falls through to Apollo.
 *   - Apollo people-search + enrichment → if email present, return it.
 *   - Apollo people-search returned a named person but enrichment gave
 *     no email → fall through to Hunter email-finder using the name.
 *     The pattern-derived email lands as `source: 'hunter_pattern'`
 *     with a confidence threshold gate (default 70).
 *   - When `keys.apollo` is omitted, the cascade is Hunter-only and
 *     skips both Apollo enrichment AND the Hunter pattern step.
 */
export async function findContactByDomain(
  domain: string,
  keys: EmailFinderKeys,
  options: EmailFinderOptions = {},
): Promise<FoundContact | null> {
  const hunter = await tryHunter(domain, keys.hunter, options);
  if (hunter && hunter.contact_name && !isRoleAccount(hunter.contact_email)) {
    return hunter;
  }

  if (keys.apollo) {
    const apollo = await tryApollo(domain, keys.apollo, keys.hunter, options);
    if (apollo) return apollo;
  }

  // Caller decides whether to discard based on contact_name.
  return hunter;
}
