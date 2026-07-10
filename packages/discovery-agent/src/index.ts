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
 * The frontier extraction step (transcript -> schema) runs through an INJECTED `StructuredRunner`
 * (the "inject any LLM" pattern shared with @caistech/extractors + cert-extractor) — the package
 * stays LLM-agnostic and unit-testable; the README shows a ~15-line Anthropic runner.
 */

import type { ZodType } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  provisionVoiceAgent,
  mintAnonSessionToken,
  verifyAnonSessionToken,
  createConvaiWebhookRoutes,
  getConversationHistory,
  createConversationTools,
  DEFAULT_AGENT_LLM,
  type ConvaiWebhookRoutes,
  type ConvaiRouteContext,
  type TableNames,
} from "@caistech/elevenlabs-convai";

// --- model tiering (the encode-once hook) ------------------------------------------------------
/** Which model runs a step. The live interview wants a cheap model; the extraction/judgment
 *  step wants a frontier model (e.g. "claude-fable-5") — that split is the point. */
export interface ModelRef {
  provider: "anthropic" | "openrouter";
  model: string; // e.g. "claude-fable-5" (extraction) | "gpt-4.1-mini" (interview)
}

/** Runs a structured-output completion. Injected by the product (see README for an Anthropic one);
 *  the package never constructs an LLM client itself, so it carries no model SDK weight. */
export interface StructuredRunner {
  run<T>(args: { model: ModelRef; system: string; input: string; schema: ZodType<T> }): Promise<{
    result: T;
    usage?: { input: number; output: number };
  }>;
}

// --- config the product supplies ---------------------------------------------------------------
export interface DiscoveryPersona {
  name: string; // the agent's name (e.g. "Kindred")
  voiceId?: string; // ElevenLabs voice; omit to use deps.voiceId / the portfolio default
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
  /** Length cap + spoken wrap-up warning (built on the browser onConnect timer, per the VOICE AI
   *  standard — the reliable elapsed-time source). Defaults: 1200s cap, 120s warning. */
  maxDurationSeconds?: number;
  wrapWarningSeconds?: number;
}

/** Runtime handles the shared orchestration needs (the convai wiring the product plugs in once).
 *  All secrets stay server-side; only the signed session token ever reaches the client. */
export interface DiscoveryDeps {
  /** The frontier extraction runner (transcript -> schema). INJECTED — see README. */
  runner: StructuredRunner;
  /** ElevenLabs API key — provisioning + pulling the post-call transcript. */
  elevenLabsApiKey: string;
  /** HMAC secret for minting/verifying the anonymous session token (the client-held identity). */
  sessionSecret: string;
  /** Service-role Supabase client for the convai webhook routes (conversation + memory tables). */
  supabase: SupabaseClient<any, any, any>;
  /** Public base URL of the consuming app — derives the webhook URL + the default allowlist. */
  baseUrl: string;
  /** Origins allowed to embed the widget. Defaults to [host(baseUrl)]. */
  allowedOrigins?: string[];
  /** Agent voice; falls back to persona.voiceId then the portfolio default. */
  voiceId?: string;
  /** convai table names (defaults live in @caistech/elevenlabs-convai). */
  tableNames?: TableNames;
  /** The provisioned agent id — required by startSession()/webhookRoutes(); returned by provision(). */
  existingAgentId?: string;
  /** Post-call webhook HMAC secret (captured from provision()). When set, post-call is verified. */
  postCallSecret?: string;
}

// --- the instance a product gets back ----------------------------------------------------------
export interface Discovery<T> {
  readonly config: DiscoveryConfig<T>;
  /** Idempotently provision the ElevenLabs agent (persona + stage arc + memory tools + per-session
   *  prompt overrides). Pass the returned agentId back in as deps.existingAgentId (+ webhookSecret
   *  as deps.postCallSecret) to scaffold into the product's voice.config.ts. */
  provision(): Promise<{ agentId: string; webhookSecret?: string }>;
  /** Start a session for a subject: runs primeContext and returns the signed session token, the
   *  agent id to mount, and the per-session prompt override (the pushed context) for the widget. */
  startSession(subjectId: string): Promise<{ token: string; agentId: string; promptOverride?: string }>;
  /** Next.js/Request post-call webhook routes: verifies HMAC, persists via the memory loop, then on
   *  completion pulls the transcript, runs `distil`, and calls `onResult`. */
  webhookRoutes(): ConvaiWebhookRoutes;
  /** Transcript -> structured outcome, using the FRONTIER extraction model. Exposed for reruns/tests. */
  distil(meta: DiscoveryMeta): Promise<T>;
}

export const DEFAULTS = { maxDurationSeconds: 1200, wrapWarningSeconds: 120 } as const;

// --- pure helpers (unit-tested; no live services) ----------------------------------------------

/** Compose the agent system prompt from persona + purpose + the stage arc. Stages are embedded as
 *  text because ElevenLabs agents take a single prompt string, not a structured stage field. */
export function buildDiscoverySystemPrompt<T>(config: DiscoveryConfig<T>): string {
  const arc = config.stages
    .map((s, i) => {
      const cover = s.mustCover?.length ? `\n   Must cover: ${s.mustCover.join("; ")}.` : "";
      return `${i + 1}. [${s.id}] ${s.goal}${cover}`;
    })
    .join("\n");
  const sign = config.persona.signature ? `\n\nSign off with: "${config.persona.signature}"` : "";
  return (
    `${config.persona.systemPrompt.trim()}\n\n` +
    `Your purpose in this conversation: ${config.purpose.trim()}\n\n` +
    `Move through these stages in order, one topic at a time, re-grounding as the surface context ` +
    `updates. Do not rush; confirm you understood before advancing.\n${arc}${sign}`
  );
}

/** Extract + verify the signed session token that carries identity. The client passes the token as
 *  the VoiceWidget `userId` (→ the `user_id` dynamic variable) and/or an explicit field/header; we
 *  verify it server-side so identity is unforgeable (the VOICE_MEMORY_STANDARD "server-derived
 *  identity" rule — the client never asserts a bare user id). */
export function resolveDiscoverySession(
  req: Request,
  body: Record<string, unknown>,
  sessionSecret: string
): ConvaiRouteContext | null {
  const fromBody = ["user_id", "userId", "session_token", "sessionId", "session_id"]
    .map((k) => body[k])
    .find((v): v is string => typeof v === "string" && v.length > 0);
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7) : undefined;
  const raw = fromBody ?? bearer ?? req.headers.get("x-discovery-session") ?? undefined;
  if (!raw) return null;
  const claims = verifyAnonSessionToken(sessionSecret, raw);
  if (!claims) return null;
  return { userId: claims.sid, anonSessionId: claims.sid };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatTranscript(turns: Array<{ role: string; content: string }>): string {
  return turns
    .filter((t) => t.content?.trim())
    .map((t) => `${t.role === "assistant" ? "Agent" : "User"}: ${t.content.trim()}`)
    .join("\n");
}

/**
 * Define a discovery agent from config + the runtime deps that plug it into the shared voice stack.
 * Returns the orchestration bound to the product's purpose + extraction; the heavy wiring (convai
 * provisioning, the post-call transcript->extraction seam, the session token) is implemented here.
 *
 * @param config  purpose + persona + stages + extraction + sink (the only per-product surface)
 * @param deps    the injected runner + the convai/ElevenLabs/Supabase handles + base URL/secrets
 */
export function defineDiscovery<T>(config: DiscoveryConfig<T>, deps: DiscoveryDeps): Discovery<T> {
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
    return config.extraction.schema.parse(result); // validate the frontier output against the schema
  };

  const requireAgentId = (): string => {
    if (!deps.existingAgentId) {
      throw new Error(
        "discovery-agent: deps.existingAgentId is required — call provision() first and pass the returned agentId back in."
      );
    }
    return deps.existingAgentId;
  };

  return {
    config,
    distil,

    async provision() {
      const voiceId = deps.voiceId ?? config.persona.voiceId;
      if (!voiceId) {
        throw new Error(
          "discovery-agent: a voiceId is required — set deps.voiceId or config.persona.voiceId."
        );
      }
      const result = await provisionVoiceAgent(deps.elevenLabsApiKey, {
        config: {
          agentName: config.persona.name,
          agentId: deps.existingAgentId,
          voiceId,
          llmModel: config.interviewModel?.model ?? DEFAULT_AGENT_LLM,
        },
        systemPrompt: buildDiscoverySystemPrompt(config),
        firstMessage: config.persona.opening,
        tools: createConversationTools(deps.baseUrl), // the memory loop (recall/save/topic)
        baseUrl: deps.baseUrl,
        allowedOrigins: deps.allowedOrigins ?? [hostOf(deps.baseUrl)],
        existingAgentId: deps.existingAgentId, // idempotency key
        enableOverrides: true, // required so startSession() can PUSH the per-session prompt
      });
      return { agentId: result.agentId, webhookSecret: result.webhookSecret };
    },

    async startSession(subjectId: string) {
      const agentId = requireAgentId();
      const promptOverride = config.primeContext ? await config.primeContext(subjectId) : undefined;
      // sid = the subject, so memory accrues per subject and resolveSession recovers the identity
      // from the signed token (never a bare client-asserted id).
      const { token } = mintAnonSessionToken(deps.sessionSecret, { agentId, sid: subjectId });
      return { token, agentId, promptOverride };
    },

    webhookRoutes() {
      return createConvaiWebhookRoutes({
        supabase: deps.supabase,
        tableNames: deps.tableNames,
        postCallSecret: deps.postCallSecret,
        resolveSession: (req, body) => resolveDiscoverySession(req, body, deps.sessionSecret),
        // Post-call: convai has already persisted the transcript + run the memory loop; now pull the
        // authoritative transcript from ElevenLabs, distil it to the schema, and hand it to the sink.
        onConversationComplete: async (conversation) => {
          const turns = await getConversationHistory(
            deps.elevenLabsApiKey,
            conversation.elevenlabsConversationId
          );
          const meta: DiscoveryMeta = {
            conversationId: conversation.elevenlabsConversationId,
            subjectId: conversation.userId,
            transcript: formatTranscript(turns),
          };
          const result = await distil(meta);
          await config.onResult(result, meta);
        },
      });
    },
  };
}
