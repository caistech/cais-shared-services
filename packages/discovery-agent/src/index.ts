/**
 * @caistech/discovery-agent
 *
 * A config-driven AI voice discovery/interview agent. A consuming product supplies ONLY:
 *   - purpose        the outcome desired (customised per product)
 *   - persona        voice, opening, signature
 *   - stages         the question arc (staged, re-grounded per stage)
 *   - primeContext   what we already know, PUSHED into the agent so it walks in informed
 *   - extraction     the transcript -> structured-output schema (the "outcome"), + model tier
 *   - onResult       where the structured result goes
 *
 * Everything else is SHARED and lives here: convai provisioning, the staged conversation +
 * per-stage re-grounding, the persistent memory loop, HMAC-verified post-call webhook, and the
 * transcript -> structured-extraction orchestration.
 *
 * It sits on `@caistech/elevenlabs-convai` (the voice stack) — it does NOT re-implement voice.
 * This is the extraction of the pattern forked in Connexions, LingoPure and Singify.
 *
 * Extraction seeds (the build-out lifts from these, generalised): LingoPure `score-discovery.ts`
 * (Zod structured output + evidence quotes) + `discovery-session.tsx` (live agent); Connexions
 * `analyze-interview` + `insights/*` (multi-interview aggregation).
 */

import type { ZodType } from "zod";

// --- model tiering (the encode-once hook) ------------------------------------------------------
/** Which model runs a step. The live interview wants a cheap model; the extraction/judgment
 *  step wants a frontier model (e.g. "claude-fable-5") — that split is the point. */
export interface ModelRef {
  provider: "anthropic" | "openrouter";
  model: string; // e.g. "claude-fable-5" (extraction) | "gpt-4.1-mini" (interview)
}

/** Runs a structured-output completion. Default adapter uses `@caistech/ai-client`; a product may
 *  inject its own (e.g. to route the frontier step through a specific key). */
export interface StructuredRunner {
  run<T>(args: { model: ModelRef; system: string; input: string; schema: ZodType<T> }): Promise<{
    result: T;
    usage?: { input: number; output: number };
  }>;
}

// --- config the product supplies ---------------------------------------------------------------
export interface DiscoveryPersona {
  name: string; // the agent's name (e.g. "Kindred")
  voiceId?: string; // ElevenLabs voice; omit to use the portfolio default
  opening: string; // first spoken line on arrival (proactive greet)
  signature?: string; // consistent sign-off
  systemPrompt: string; // the persona + the PURPOSE, in the agent's own voice
}

export interface DiscoveryStage {
  id: string;
  goal: string; // what this stage is trying to learn
  firstMessage?: string; // opener when the stage becomes active
  context: string; // surface-context pushed via sendContextualUpdate on stage entry
  mustCover?: string[]; // the specific gaps/questions this stage must fill
}

export interface DiscoveryExtraction<T> {
  schema: ZodType<T>; // the structured OUTCOME shape
  system: string; // how to distil the transcript into the schema
  model: ModelRef; // TIER THIS: frontier model for the judgment step
  requireEvidence?: boolean; // attach the transcript quote grounding each field (recommended)
}

export interface DiscoveryMeta {
  conversationId: string;
  subjectId: string;
  transcript: string;
  durationSeconds?: number;
}

export interface DiscoveryConfig<T> {
  slug: string; // product/agent identity (e.g. "kindred")
  purpose: string; // the outcome desired — the ONE thing customised per product
  persona: DiscoveryPersona;
  stages: DiscoveryStage[]; // the question arc
  extraction: DiscoveryExtraction<T>;
  /** PUSH what we already know into the agent before the call (the divergence from Singify's
   *  strict pull-only memory): returns a context string primed as a per-session prompt override. */
  primeContext?: (subjectId: string) => Promise<string>;
  /** Where the distilled structured result goes (persist to the product's own store). */
  onResult: (result: T, meta: DiscoveryMeta) => Promise<void>;
  /** Cheap model for the live call. Defaults to the convai DEFAULT_AGENT_LLM. */
  interviewModel?: ModelRef;
  /** Length cap + spoken wrap-up warning (built on the browser onConnect timer). */
  maxDurationSeconds?: number; // default 1200 (per @caistech/elevenlabs-convai)
  wrapWarningSeconds?: number; // default 120 — "about 2 minutes to go"
}

// --- the instance a product gets back ----------------------------------------------------------
export interface Discovery<T> {
  readonly config: DiscoveryConfig<T>;
  /** Idempotently provision the ElevenLabs agent (wraps convai createAgent + bindWorkspaceWebhook,
   *  applying persona.systemPrompt + the stage arc + maxDurationSeconds). Returns the agent id to
   *  scaffold into the product's voice.config.ts. */
  provision(): Promise<{ agentId: string }>;
  /** Start a session for a subject: runs primeContext and returns the signed session token +
   *  the per-session prompt override (the pushed context) for the widget. */
  startSession(subjectId: string): Promise<{ token: string; promptOverride?: string }>;
  /** Next.js post-call webhook routes (wraps convai createConvaiWebhookRoutes): verifies HMAC,
   *  persists the transcript via the memory loop, runs `distil`, then calls `onResult`. */
  webhookRoutes(): unknown; // NextRouteHandlers — typed loosely to avoid a Next peer dep
  /** Transcript -> structured outcome, using the FRONTIER extraction model. Exposed for reruns/tests. */
  distil(meta: DiscoveryMeta): Promise<T>;
}

/**
 * Define a discovery agent from config. Returns the shared orchestration bound to the product's
 * purpose + extraction. The heavy wiring (convai provisioning, staged re-grounding, webhook,
 * memory loop) is implemented once here and lifted from the extraction seeds during build-out.
 *
 * @param config  purpose + persona + stages + extraction + sink (the only per-product surface)
 * @param deps    injectables — the structured-output runner (defaults to @caistech/ai-client) and
 *                the convai handles; injected so the package stays framework-light and testable.
 */
export function defineDiscovery<T>(
  config: DiscoveryConfig<T>,
  deps: { runner: StructuredRunner; convai?: unknown }
): Discovery<T> {
  const distil = async (meta: DiscoveryMeta): Promise<T> => {
    const input = config.extraction.requireEvidence
      ? `${meta.transcript}\n\nFor every field, attach the transcript quote that grounds it.`
      : meta.transcript;
    const { result } = await deps.runner.run({
      model: config.extraction.model, // <- frontier tier (e.g. claude-fable-5)
      system: config.extraction.system,
      input,
      schema: config.extraction.schema,
    });
    return result;
  };

  return {
    config,
    distil,
    async provision() {
      // Wraps @caistech/elevenlabs-convai createAgent(persona.systemPrompt + stages,
      // { maxDurationSeconds }) + bindWorkspaceWebhook(...). Implemented in build-out.
      throw new Error("provision(): wire to @caistech/elevenlabs-convai during build-out");
    },
    async startSession(subjectId: string) {
      const promptOverride = config.primeContext ? await config.primeContext(subjectId) : undefined;
      // Wraps convai handleStartConversation + mints the session token, passing promptOverride as
      // overrides.agent.prompt (the PUSH). Implemented in build-out.
      return { token: "", promptOverride };
    },
    webhookRoutes() {
      // Wraps convai createConvaiWebhookRoutes({ onConversationComplete }) so post-call:
      //   verify HMAC -> persist transcript (memory loop) -> distil(meta) -> config.onResult(...)
      throw new Error("webhookRoutes(): wire to @caistech/elevenlabs-convai during build-out");
    },
  };
}

export const DEFAULTS = { maxDurationSeconds: 1200, wrapWarningSeconds: 120 } as const;
