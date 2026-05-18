/**
 * Server configuration — env vars + session-scoped credentials.
 *
 * BYOK keys (Anthropic, etc.) live in session scope and are never read here.
 * This module is for server-wide config only.
 */

export interface ServerConfig {
  abr: {
    /** ABR Web Services GUID — required for lookup_abn / search_business_by_name. */
    guid: string | null;
  };
  rateLimits: {
    /** Per-tool, per-install daily cap on free tier. */
    freeTierDailyPerTool: number;
  };
  telemetry: {
    enabled: boolean;
    /** 'memory' | 'supabase' — Phase 1 ships with 'memory'; Supabase wiring comes next. */
    backend: "memory" | "supabase";
  };
  funnel: {
    /** Threshold N — prompt user after this many calls. */
    promptAfterCalls: number;
    /** Threshold M — or after this many days of active use, whichever first. */
    promptAfterDays: number;
    interviewUrl: string;
    /**
     * Connexions Platform Trust Sprint intake URL — live since 2026-05-14.
     * For-someone-else triage outcomes route here; for-yourself outcomes are
     * captured data-only by the interview agent (Path C, decision 2026-05-18 —
     * prelabz routing deferred until funnel data validates demand).
     */
    connexionsIntakeUrl: string;
  };
}

function envOr<T>(name: string, fallback: T): string | T {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): ServerConfig {
  return {
    abr: {
      guid: typeof process.env.ABR_GUID === "string" && process.env.ABR_GUID.length > 0
        ? process.env.ABR_GUID
        : null,
    },
    rateLimits: {
      freeTierDailyPerTool: envInt("FREE_TIER_DAILY_PER_TOOL", 100),
    },
    telemetry: {
      enabled: envOr("TELEMETRY_ENABLED", "true") === "true",
      backend: (envOr("TELEMETRY_BACKEND", "memory") as "memory" | "supabase"),
    },
    funnel: {
      promptAfterCalls: envInt("FUNNEL_PROMPT_AFTER_CALLS", 10),
      promptAfterDays: envInt("FUNNEL_PROMPT_AFTER_DAYS", 7),
      interviewUrl: envOr("INTERVIEW_AGENT_URL", "https://cais.com/interview") as string,
      connexionsIntakeUrl: envOr(
        "CONNEXIONS_INTAKE_URL",
        "https://connexions-silk.vercel.app/p/platform-trust-sprint-intake",
      ) as string,
    },
  };
}
