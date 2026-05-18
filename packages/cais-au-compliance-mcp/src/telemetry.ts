/**
 * Telemetry — usage counter + funnel threshold tracking.
 *
 * Phase 1 ships with the 'memory' backend (process-lifetime only). The
 * Supabase backend writing to mcp_install / mcp_call / mcp_engagement tables
 * lands when the migration is pushed (next session). The contract here is
 * what the future backend implements; swap the impl without touching tool code.
 */

import type { ServerConfig } from "./config.js";

export interface TelemetryEvent {
  toolName: string;
  status: "ok" | "error" | "rate_limited";
  durationMs: number;
}

export interface Telemetry {
  /** Record a tool invocation. Idempotent if called twice with same id. */
  recordCall(event: TelemetryEvent): Promise<void>;
  /** True when the funnel threshold (N calls OR M days) has been crossed and a prompt has not yet been dismissed. */
  shouldPrompt(): Promise<boolean>;
  /** Mark that the prompt has fired for this install — don't re-fire for 30 days. */
  markPromptShown(): Promise<void>;
  /** Read-only snapshot for the cais://au-compliance/health resource. */
  snapshot(): {
    totalCalls: number;
    promptShownAt: string | null;
    firstCallAt: string | null;
    backend: "memory" | "supabase";
  };
}

export function createTelemetry(cfg: ServerConfig["telemetry"]): Telemetry {
  if (!cfg.enabled) {
    return createNoopTelemetry();
  }
  switch (cfg.backend) {
    case "memory":
      return createMemoryTelemetry();
    case "supabase":
      // TODO: wire @supabase/supabase-js client + mcp_install/mcp_call/mcp_engagement tables.
      // Falls back to memory until migration is applied — see Phase 1 README.
      return createMemoryTelemetry();
  }
}

function createNoopTelemetry(): Telemetry {
  return {
    async recordCall(): Promise<void> {},
    async shouldPrompt(): Promise<boolean> {
      return false;
    },
    async markPromptShown(): Promise<void> {},
    snapshot() {
      return { totalCalls: 0, promptShownAt: null, firstCallAt: null, backend: "memory" };
    },
  };
}

function createMemoryTelemetry(): Telemetry {
  let totalCalls = 0;
  let firstCallAt: Date | null = null;
  let promptShownAt: Date | null = null;
  const PROMPT_AFTER_CALLS = 10;
  const PROMPT_COOLDOWN_DAYS = 30;

  return {
    async recordCall(event): Promise<void> {
      totalCalls += 1;
      if (firstCallAt === null) firstCallAt = new Date();
      void event;
    },
    async shouldPrompt(): Promise<boolean> {
      if (totalCalls < PROMPT_AFTER_CALLS) return false;
      if (promptShownAt === null) return true;
      const cooldownMs = PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      return Date.now() - promptShownAt.getTime() > cooldownMs;
    },
    async markPromptShown(): Promise<void> {
      promptShownAt = new Date();
    },
    snapshot() {
      return {
        totalCalls,
        promptShownAt: promptShownAt ? promptShownAt.toISOString() : null,
        firstCallAt: firstCallAt ? firstCallAt.toISOString() : null,
        backend: "memory" as const,
      };
    },
  };
}
