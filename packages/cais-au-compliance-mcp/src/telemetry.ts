/**
 * Telemetry — usage counter + funnel threshold tracking.
 *
 * Two backends:
 *   - 'memory'    process-lifetime only; stateless serverless functions
 *                 effectively have no continuity. Local-dev fallback.
 *   - 'supabase'  writes mcp_install / mcp_call / mcp_engagement rows.
 *                 Required for production install tracking + funnel.
 *
 * The Supabase backend is selected via env: TELEMETRY_BACKEND=supabase
 * plus SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ServerConfig } from "./config.js";

export interface TelemetryEvent {
  toolName: string;
  status: "ok" | "error" | "rate_limited";
  durationMs: number;
  /** Provenance of the BYOK credentials used (for funnel-source analytics, never the values). */
  credentialSource?: "headers" | "env" | "merged" | "none";
}

export interface Telemetry {
  /** Record a tool invocation. */
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

const MCP_NAME = "cais-au-compliance";
const PROMPT_AFTER_CALLS = 10;
const PROMPT_COOLDOWN_DAYS = 30;

export function createTelemetry(cfg: ServerConfig["telemetry"]): Telemetry {
  if (!cfg.enabled) {
    return createNoopTelemetry();
  }
  switch (cfg.backend) {
    case "memory":
      return createMemoryTelemetry();
    case "supabase":
      return createSupabaseTelemetry() ?? createMemoryTelemetry();
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

/**
 * Supabase-backed telemetry. Returns null when env vars aren't set so the
 * factory can fall back to memory mode (e.g. local dev without DB).
 *
 * Each Vercel request is a fresh server with a fresh telemetry instance.
 * The install_id is allocated lazily — the first recordCall in a process
 * creates one row in mcp_install (anonymous, no PII), and subsequent calls
 * append to mcp_call with that install_id. Cross-request continuity needs
 * a session cookie or similar (deferred to a future stage).
 */
function createSupabaseTelemetry(): Telemetry | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(
      "[cais-au-compliance-mcp] TELEMETRY_BACKEND=supabase requested but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing; falling back to memory",
    );
    return null;
  }
  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let installId: string | null = null;
  let firstCallAt: Date | null = null;
  let totalCalls = 0;
  let promptShownAt: Date | null = null;

  async function ensureInstall(userAgent?: string): Promise<string | null> {
    if (installId) return installId;
    const { data, error } = await client
      .from("mcp_install")
      .insert({ mcp_name: MCP_NAME, user_agent: userAgent ?? null })
      .select("install_id")
      .single();
    if (error || !data) {
      console.error("[telemetry] ensureInstall failed", error?.message);
      return null;
    }
    installId = data.install_id as string;
    return installId;
  }

  return {
    async recordCall(event): Promise<void> {
      const id = await ensureInstall();
      totalCalls += 1;
      if (firstCallAt === null) firstCallAt = new Date();
      const { error } = await client.from("mcp_call").insert({
        install_id: id,
        mcp_name: MCP_NAME,
        tool_name: event.toolName,
        duration_ms: event.durationMs,
        status: event.status,
        credential_source: event.credentialSource ?? null,
      });
      if (error) {
        console.error("[telemetry] recordCall failed", error.message);
      }
    },
    async shouldPrompt(): Promise<boolean> {
      if (totalCalls < PROMPT_AFTER_CALLS) return false;
      if (!installId) return false;
      const { data } = await client
        .from("mcp_engagement")
        .select("prompted_at")
        .eq("install_id", installId)
        .maybeSingle();
      const lastPrompted = data?.prompted_at ? new Date(data.prompted_at as string) : null;
      if (!lastPrompted) return true;
      const cooldownMs = PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      return Date.now() - lastPrompted.getTime() > cooldownMs;
    },
    async markPromptShown(): Promise<void> {
      if (!installId) return;
      promptShownAt = new Date();
      const { error } = await client.from("mcp_engagement").upsert({
        install_id: installId,
        prompted_at: promptShownAt.toISOString(),
      });
      if (error) {
        console.error("[telemetry] markPromptShown failed", error.message);
      }
    },
    snapshot() {
      return {
        totalCalls,
        promptShownAt: promptShownAt ? promptShownAt.toISOString() : null,
        firstCallAt: firstCallAt ? firstCallAt.toISOString() : null,
        backend: "supabase" as const,
      };
    },
  };
}
