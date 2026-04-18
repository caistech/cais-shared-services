/**
 * AI-powered business profile extractor.
 * Fetches a business website, strips boilerplate, sends to an LLM
 * to extract structured business data. Returns: name, address, phone,
 * email, services, description, pricing, hours, social links.
 *
 * Framework-agnostic — accepts any function with the signature:
 *   (system: string, prompt: string) => Promise<string>
 * so it works with Anthropic, OpenAI, or any other LLM provider.
 *
 * Used by: storefront-mcp, f2k-checkpoint, connexions, raiseready
 */

// ============================================================
// Types
// ============================================================

export interface BusinessProfile {
  business_name: string | null;
  description: string | null;
  address: {
    street: string | null;
    suburb: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
  };
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  services: ServiceInfo[];
  pricing_signals: string[];
  hours: string | null;
  social_links: SocialLinks;
  industry: string | null;
  founded_year: number | null;
  team_size: string | null;
  certifications: string[];
  /** Raw LLM confidence 0-1 for the overall extraction */
  confidence: number;
}

export interface ServiceInfo {
  name: string;
  description: string | null;
  price_signal: string | null;
}

export interface SocialLinks {
  linkedin: string | null;
  facebook: string | null;
  instagram: string | null;
  twitter: string | null;
  youtube: string | null;
  other: string[];
}

export interface ProfileExtractorOptions {
  /** Function that calls your LLM. Receives (system, userPrompt) and returns the response text. */
  llm: (system: string, prompt: string) => Promise<string>;
  /** Timeout for HTTP fetch in ms (default: 10000) */
  fetchTimeout?: number;
  /** Max chars of HTML to send to LLM (default: 30000) */
  maxHtmlChars?: number;
  /** User-Agent string for fetching (default: StoreFrontMCP-Audit/2.0) */
  userAgent?: string;
}

export interface ExtractionError {
  error: string;
  partial?: Partial<BusinessProfile>;
}

// ============================================================
// Core extraction
// ============================================================

/**
 * Extract a structured business profile from a website URL.
 * Fetches the page, strips HTML boilerplate, sends visible text to the LLM.
 */
export async function extractProfile(
  url: string,
  options: ProfileExtractorOptions
): Promise<BusinessProfile | ExtractionError> {
  const {
    llm,
    fetchTimeout = 10000,
    maxHtmlChars = 30000,
    userAgent = 'StoreFrontMCP-Audit/2.0',
  } = options;

  // 1. Fetch and clean HTML
  let pageText: string;
  let rawHtml: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(fetchTimeout),
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
    });
    if (!res.ok) {
      return { error: `Failed to fetch ${url}: HTTP ${res.status}` };
    }
    rawHtml = await res.text();
    pageText = stripHtmlToText(rawHtml, maxHtmlChars);
  } catch (err) {
    return { error: `Failed to fetch ${url}: ${err instanceof Error ? err.message : 'timeout'}` };
  }

  // 2. Extract social links from raw HTML (regex — fast, no LLM needed)
  const socialLinks = extractSocialLinks(rawHtml);

  // 3. Send to LLM for structured extraction
  try {
    const system = EXTRACTION_SYSTEM_PROMPT;
    const prompt = `Extract business profile data from this website content.\n\nURL: ${url}\n\n---\n${pageText}\n---\n\nRespond with ONLY valid JSON matching the schema. No markdown, no explanation.`;

    const response = await llm(system, prompt);
    const parsed = parseJsonResponse(response);

    if (!parsed) {
      return { error: 'LLM returned unparseable response' };
    }

    // Merge LLM extraction with regex-extracted social links
    return {
      business_name: parsed.business_name || null,
      description: parsed.description || null,
      address: {
        street: parsed.address?.street || null,
        suburb: parsed.address?.suburb || parsed.address?.city || null,
        state: parsed.address?.state || null,
        postcode: parsed.address?.postcode || parsed.address?.zip || null,
        country: parsed.address?.country || null,
      },
      contact: {
        phone: parsed.contact?.phone || null,
        email: parsed.contact?.email || null,
        website: url,
      },
      services: Array.isArray(parsed.services)
        ? parsed.services.map((s: Record<string, unknown>) => ({
            name: String(s.name || ''),
            description: s.description ? String(s.description) : null,
            price_signal: s.price_signal ? String(s.price_signal) : null,
          })).filter((s: ServiceInfo) => s.name)
        : [],
      pricing_signals: Array.isArray(parsed.pricing_signals) ? parsed.pricing_signals.map(String) : [],
      hours: parsed.hours || null,
      social_links: {
        linkedin: socialLinks.linkedin || parsed.social_links?.linkedin || null,
        facebook: socialLinks.facebook || parsed.social_links?.facebook || null,
        instagram: socialLinks.instagram || parsed.social_links?.instagram || null,
        twitter: socialLinks.twitter || parsed.social_links?.twitter || null,
        youtube: socialLinks.youtube || parsed.social_links?.youtube || null,
        other: [...(socialLinks.other || []), ...(parsed.social_links?.other || [])],
      },
      industry: parsed.industry || null,
      founded_year: parsed.founded_year ? Number(parsed.founded_year) : null,
      team_size: parsed.team_size || null,
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications.map(String) : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch (err) {
    return { error: `LLM extraction failed: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

// ============================================================
// HTML → text
// ============================================================

/**
 * Strip HTML tags, scripts, styles, and compress whitespace.
 * Returns the visible text content, truncated to maxChars.
 */
export function stripHtmlToText(html: string, maxChars: number = 30000): string {
  let text = html;

  // Remove script, style, noscript blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Preserve JSON-LD structured data (valuable for extraction)
  const jsonLdBlocks: string[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    jsonLdBlocks.push(`[JSON-LD]: ${match[1].trim()}`);
  }

  // Replace tags with spaces (preserve paragraph breaks)
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?(p|div|h[1-6]|li|tr|section|article|header|footer)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Compress whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');
  text = text.trim();

  // Prepend JSON-LD if found
  if (jsonLdBlocks.length > 0) {
    text = jsonLdBlocks.join('\n') + '\n\n' + text;
  }

  return text.slice(0, maxChars);
}

// ============================================================
// Social link extraction (regex — no LLM needed)
// ============================================================

function extractSocialLinks(html: string): SocialLinks {
  const links: SocialLinks = {
    linkedin: null,
    facebook: null,
    instagram: null,
    twitter: null,
    youtube: null,
    other: [],
  };

  const urlRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = urlRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.includes('linkedin.com/') && !links.linkedin) links.linkedin = href;
    else if (href.includes('facebook.com/') && !links.facebook) links.facebook = href;
    else if (href.includes('instagram.com/') && !links.instagram) links.instagram = href;
    else if ((href.includes('twitter.com/') || href.includes('x.com/')) && !links.twitter) links.twitter = href;
    else if (href.includes('youtube.com/') && !links.youtube) links.youtube = href;
  }

  return links;
}

// ============================================================
// JSON parsing (tolerant of markdown wrapping)
// ============================================================

function parseJsonResponse(text: string): Record<string, unknown> | null {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Try extracting from markdown code block
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]);
    } catch { /* continue */ }
  }

  // Try finding first { to last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch { /* continue */ }
  }

  return null;
}

// ============================================================
// System prompt
// ============================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a business data extraction engine. Given website text content, extract structured business information.

Return ONLY valid JSON with this exact schema (use null for missing fields):

{
  "business_name": "string or null",
  "description": "1-3 sentence business description or null",
  "address": {
    "street": "string or null",
    "suburb": "city/suburb or null",
    "state": "state/province or null",
    "postcode": "postal/zip code or null",
    "country": "country name or null"
  },
  "contact": {
    "phone": "string or null",
    "email": "string or null"
  },
  "services": [
    {
      "name": "service name",
      "description": "brief description or null",
      "price_signal": "any pricing info found or null"
    }
  ],
  "pricing_signals": ["$X/hr", "from $Y", "free quote", etc],
  "hours": "business hours summary or null",
  "social_links": {
    "linkedin": "url or null",
    "facebook": "url or null",
    "instagram": "url or null",
    "twitter": "url or null",
    "youtube": "url or null",
    "other": []
  },
  "industry": "industry/category or null",
  "founded_year": 2020,
  "team_size": "string description or null",
  "certifications": ["list of certifications, licences, memberships"],
  "confidence": 0.85
}

Rules:
- Extract ONLY what is explicitly stated on the page. Never infer or hallucinate.
- For services, extract every distinct service offering mentioned.
- For pricing_signals, capture any dollar amounts, rate descriptions, or "get a quote" language.
- For certifications, include trade licences, industry memberships, ISO certs, etc.
- confidence: 0.0-1.0 based on how much data you could extract. 0.9+ if most fields filled.
- Return valid JSON only. No markdown. No explanation.`;

// ============================================================
// Type guard
// ============================================================

export function isExtractionError(
  result: BusinessProfile | ExtractionError
): result is ExtractionError {
  return 'error' in result;
}
