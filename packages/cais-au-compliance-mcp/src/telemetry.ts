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
 *
 * Install identity in serverless: the install_id is owned by the *client*
 * and supplied per-request (via the X-CAIS-Install-Id HTTP header). The
 * server stamps rows with that id. shouldPrompt() queries the DB rather
 * than relying on process-local counters — so the funnel threshold survives
 * cold starts.
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
  /** Record a tool invocation against the given install. */
  recordCall(installId: string, event: TelemetryEvent): Promise<void>;
  /** True when the funnel threshold has been crossed for this install and the cooldown has elapsed. */
  shouldPrompt(installId: string): Promise<boolean>;
  /** Mark that the prompt has fired for this install — don't re-fire for 30 days. */
  markPromptShown(installId: string): Promise<void>;
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
    async recordCall(_installId, _event): Promise<void> {
      totalCalls += 1;
      if (firstCallAt === null) firstCallAt = new Date();
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
 * Identity is client-owned: every method takes an explicit install_id. The
 * server upserts mcp_install on first sight (idempotent) and stamps every
 * mcp_call with the same id. Threshold checks query the DB so they survive
 * cold starts.
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

  // Per-process cache of install_ids we've already upserted, so warm-Lambda
  // invocations skip the redundant upsert. Not load-bearing for correctness
  // (the upsert is idempotent) — purely a latency optimisation.
  const knownInstalls = new Set<string>();

  async function ensureInstall(installId: string): Promise<void> {
    if (knownInstalls.has(installId)) return;
    const { error } = await client
      .from("mcp_install")
      .upsert(
        { install_id: installId, mcp_name: MCP_NAME },
        { onConflict: "install_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("[telemetry] ensureInstall failed", error.message);
      return;
    }
    knownInstalls.add(installId);
  }

  return {
    async recordCall(installId, event): Promise<void> {
      await ensureInstall(installId);
      const { error } = await client.from("mcp_call").insert({
        install_id: installId,
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
    async shouldPrompt(installId): Promise<boolean> {
      const { count, error: countError } = await client
        .from("mcp_call")
        .select("*", { count: "exact", head: true })
        .eq("install_id", installId);
      if (countError) {
        console.error("[telemetry] shouldPrompt count failed", countError.message);
        return false;
      }
      if ((count ?? 0) < PROMPT_AFTER_CALLS) return false;
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
    async markPromptShown(installId): Promise<void> {
      const { error } = await client.from("mcp_engagement").upsert({
        install_id: installId,
        prompted_at: new Date().toISOString(),
      });
      if (error) {
        console.error("[telemetry] markPromptShown failed", error.message);
      }
    },
    snapshot() {
      return {
        totalCalls: knownInstalls.size,
        promptShownAt: null,
        firstCallAt: null,
        backend: "supabase" as const,
      };
    },
  };
}
