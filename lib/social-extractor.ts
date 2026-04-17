/**
 * Social media profile extractor.
 * Fetches public social media pages and uses an LLM to extract
 * business narrative, services, team info, and other signals.
 *
 * Works with LinkedIn company pages, Facebook business pages,
 * and Instagram business profiles (public content only).
 *
 * Framework-agnostic — same LLM injection pattern as profile-extractor.
 *
 * Used by: storefront-mcp, f2k-checkpoint, connexions, raiseready
 */

import type { SocialLinks } from './profile-extractor.js';

// ============================================================
// Types
// ============================================================

export interface SocialProfile {
  platform: string;
  url: string;
  business_name: string | null;
  tagline: string | null;
  description: string | null;
  services_mentioned: string[];
  team_signals: string[];
  follower_signal: string | null;
  recent_activity: string | null;
  narrative: string | null;
}

export interface SocialExtractionResult {
  profiles: SocialProfile[];
  combined_narrative: string | null;
  combined_services: string[];
  /** Aggregate confidence 0-1 */
  confidence: number;
}

export interface SocialExtractorOptions {
  llm: (system: string, prompt: string) => Promise<string>;
  fetchTimeout?: number;
  maxChars?: number;
  userAgent?: string;
}

// ============================================================
// Core extraction
// ============================================================

/**
 * Extract business data from all provided social media URLs.
 * Fetches each public page and sends to LLM for extraction.
 * Combines results into a unified narrative.
 */
export async function extractSocialProfiles(
  links: SocialLinks,
  options: SocialExtractorOptions
): Promise<SocialExtractionResult> {
  const {
    llm,
    fetchTimeout = 10000,
    maxChars = 15000,
    userAgent = 'StoreFrontMCP-Audit/2.0',
  } = options;

  const urls: Array<{ platform: string; url: string }> = [];
  if (links.linkedin) urls.push({ platform: 'LinkedIn', url: links.linkedin });
  if (links.facebook) urls.push({ platform: 'Facebook', url: links.facebook });
  if (links.instagram) urls.push({ platform: 'Instagram', url: links.instagram });

  if (urls.length === 0) {
    return { profiles: [], combined_narrative: null, combined_services: [], confidence: 0 };
  }

  // Fetch all social pages in parallel
  const profiles: SocialProfile[] = [];
  const results = await Promise.allSettled(
    urls.map(async ({ platform, url }) => {
      const pageText = await fetchAndClean(url, fetchTimeout, maxChars, userAgent);
      if (!pageText) return null;

      const prompt = `Extract business information from this ${platform} page.\n\nURL: ${url}\n\n---\n${pageText}\n---\n\nRespond with ONLY valid JSON. No markdown.`;

      const response = await llm(SOCIAL_SYSTEM_PROMPT, prompt);
      const parsed = parseJson(response);
      if (!parsed) return null;

      return {
        platform,
        url,
        business_name: parsed.business_name || null,
        tagline: parsed.tagline || null,
        description: parsed.description || null,
        services_mentioned: Array.isArray(parsed.services_mentioned)
          ? parsed.services_mentioned.map(String) : [],
        team_signals: Array.isArray(parsed.team_signals)
          ? parsed.team_signals.map(String) : [],
        follower_signal: parsed.follower_signal || null,
        recent_activity: parsed.recent_activity || null,
        narrative: parsed.narrative || null,
      } satisfies SocialProfile;
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      profiles.push(r.value);
    }
  }

  // Combine across all profiles
  const allServices = [...new Set(profiles.flatMap(p => p.services_mentioned))];
  const narratives = profiles.map(p => p.narrative).filter(Boolean);
  const combined = narratives.length > 0
    ? narratives.join(' ')
    : null;

  return {
    profiles,
    combined_narrative: combined,
    combined_services: allServices,
    confidence: profiles.length > 0 ? Math.min(0.7 + profiles.length * 0.1, 0.95) : 0,
  };
}

// ============================================================
// Helpers
// ============================================================

async function fetchAndClean(
  url: string,
  timeout: number,
  maxChars: number,
  userAgent: string
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    let text = await res.text();

    // Strip scripts, styles, HTML tags
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    text = text.replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();

    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch { /* continue */ }
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1]); } catch { /* continue */ } }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch { /* continue */ } }
  return null;
}

// ============================================================
// System prompt
// ============================================================

const SOCIAL_SYSTEM_PROMPT = `You are a business intelligence extractor. Given social media page content, extract business signals.

Return ONLY valid JSON with this schema (null for missing):

{
  "business_name": "string or null",
  "tagline": "company tagline/slogan or null",
  "description": "what the business does in 1-2 sentences or null",
  "services_mentioned": ["list of services or products mentioned"],
  "team_signals": ["key people, roles, team size indicators"],
  "follower_signal": "follower/like count if visible or null",
  "recent_activity": "summary of recent posts/activity or null",
  "narrative": "A 2-3 sentence narrative about this business compiled from the social profile. What do they do, who do they serve, what makes them different."
}

Rules:
- Extract ONLY what is explicitly stated. Never infer or hallucinate.
- Social pages often have limited public content — extract what's available.
- For narrative, synthesize the profile into a natural description suitable for a business directory.
- Return valid JSON only. No markdown. No explanation.`;
