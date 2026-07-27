// elevenlabs-convai/types.ts
// Generic types for ElevenLabs Conversational AI integration.
// De-coupled from any specific project (Kira, MOVA, etc).

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================

/**
 * Base configuration for creating an ElevenLabs ConvAI agent.
 * Every project provides these; the shared module handles the rest.
 */
export interface ConvAIAgentConfig {
  // Identity
  agentName: string;
  agentId?: string;           // ElevenLabs agent ID (if pre-created)

  // Voice
  voiceId: string;
  voiceModel?: string;        // Default: language-aware — 'eleven_flash_v2' for English, 'eleven_turbo_v2_5' for multilingual. See defaultVoiceModelFor().

  // LLM
  llmModel?: string;          // Default: DEFAULT_AGENT_LLM ('gpt-4.1-mini') — the portfolio-standard agent reasoning model. Override only for a deliberate exception.
  temperature?: number;       // Default: 0.7

  // Webhook — optional. When omitted, no webhook block is sent to ElevenLabs.
  webhookUrl?: string;
  webhookEvents?: string[];   // Default (only when webhookUrl set): ['conversation.transcript', 'conversation.ended']
}

/**
 * Context passed to the agent at conversation start.
 * Projects extend this with their own fields.
 */
export interface ConvAIContext {
  userId?: string;
  userName?: string;
  firstName?: string;
  sessionId?: string;
  [key: string]: unknown;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export type ToolType = 'webhook' | 'client';

/**
 * One parameter of a tool's request body — `parameters` is passed straight through as
 * `api_schema.request_body_schema` (see agent-client.ts), so this mirrors ElevenLabs'
 * `ObjectJsonSchemaProperty` exactly.
 *
 * A property's VALUE SOURCE is chosen by which of these fields is present, and ElevenLabs treats
 * them as MUTUALLY EXCLUSIVE with `description`:
 *
 *   - `description` only        → the LLM fills it (the default, and the only shape this package
 *                                 emitted before 0.11.0)
 *   - `dynamic_variable`        → the PLATFORM fills it from a dynamic variable
 *   - `constant_value`          → a fixed value
 *   - `is_system_provided`      → ElevenLabs supplies it
 *   - `is_omitted`              → dropped from the request entirely
 *
 * The distinction is load-bearing, not cosmetic. Identity parameters — `conversation_id`,
 * `elevenlabs_agent_id` — were declared as LLM-filled properties with a description, and an LLM has
 * no way to know either value: ElevenLabs does not tell the agent its own conversation id. So the
 * model omitted them (400) or invented one (a lookup that finds nothing), and every memory tool
 * returned nothing in every real call while unit tests that supply the id passed. Binding those
 * parameters to `system__conversation_id` / `system__agent_id` is what makes server-derived identity
 * reachable for a product whose agent serves MANY users (one agent per site/repo), where the
 * `?uid=`-baked-at-provision route in createConversationTools cannot apply.
 */
export interface ConvAIToolProperty {
  type: string;
  /** LLM-filled description. Mutually exclusive with the value-source fields below. */
  description?: string;
  enum?: string[];
  items?: { type: string };
  /**
   * Name of the ElevenLabs dynamic variable supplying this value, e.g. `system__conversation_id`
   * or `system__agent_id`. Set this INSTEAD of `description` — sending both is rejected.
   */
  dynamic_variable?: string;
  constant_value?: string | number | boolean;
  is_system_provided?: boolean;
  is_omitted?: boolean;
}

export interface ConvAITool {
  type: ToolType;
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ConvAIToolProperty>;
    required?: string[];
  };
  webhook?: {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
  };
  handler?: (params: Record<string, unknown>) => Promise<unknown>;
}

// =============================================================================
// ELEVENLABS API TYPES
// =============================================================================

export interface ElevenLabsAgentConfig {
  name: string;
  conversation_config: {
    agent: {
      prompt: {
        prompt: string;
        llm: string;
        temperature: number;
        // Workspace tool entity ids the agent may call. The deprecated inline
        // `agent.tools` shape is silently stripped by ElevenLabs — tools are
        // referenced here instead (see ensureWorkspaceTools()).
        tool_ids?: string[];
      };
      first_message: string;
      language: string;
    };
    tts: {
      voice_id: string;
      model_id: string;
    };
    // Conversation-level limits/behaviour. `max_duration_seconds` caps the call length;
    // ElevenLabs defaults to 600s (10 min) when omitted — coaching/discovery calls need longer,
    // so createAgent sets a 20-min default (see CreateAgentOptions.maxDurationSeconds).
    conversation?: {
      max_duration_seconds?: number;
      [key: string]: unknown;
    };
  };
  platform_settings?: {
    webhook?: {
      url: string;
      events: string[];
    };
    // ElevenLabs accepts arbitrary platform-settings keys (widget, evaluation, etc.);
    // consumers can pass additional keys via CreateAgentOptions.platformSettings.
    [key: string]: unknown;
  };
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

/**
 * Post-call webhook payload from ElevenLabs.
 * This is the shape ElevenLabs sends to your webhook URL after a call ends.
 */
export interface ElevenLabsPostCallPayload {
  type: string;
  event_timestamp?: number;
  data: {
    agent_id: string;
    conversation_id: string;
    status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed';
    transcript: Array<{
      role: 'user' | 'agent';
      message: string;
      tool_call?: unknown;
      tool_result?: unknown;
      time_in_call_secs: number;
      end_time_in_call_secs?: number;
    }>;
    metadata: {
      start_time_unix_secs: number;
      end_time_unix_secs?: number;
      call_duration_secs: number;
      cost?: number;
      termination_reason?: string;
    };
    analysis?: {
      transcript_summary?: string;
      call_successful?: string;
      data_collection_results?: Record<string, unknown>;
    };
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, string>;
    };
  };
}

/**
 * Simplified webhook event (for the generic event types).
 */
export interface ConvAIWebhookEvent {
  type: 'conversation.started' | 'conversation.transcript' | 'conversation.ended';
  conversation_id: string;
  agent_id: string;
  data: {
    transcript?: string;
    messages?: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
    }>;
    duration_seconds?: number;
    metadata?: Record<string, unknown>;
  };
}

// =============================================================================
// CONVERSATION & MEMORY TYPES
// =============================================================================

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ConversationSession {
  id: string;
  agentId: string;
  userId?: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: Date;
  endedAt?: Date;
  lastTopic?: string;
  topics?: string[];
  messageCount?: number;
  transcript?: ConversationMessage[];
  metadata?: Record<string, unknown>;
}

export type MemoryType =
  | 'preference'
  | 'context'
  | 'goal'
  | 'decision'
  | 'followup'
  | 'correction'
  | 'insight';

export interface MemoryEntry {
  id: string;
  userId: string;
  agentId: string;
  memoryType: MemoryType;
  content: string;
  importance: number;       // 1-10
  tags: string[];
  active: boolean;
  recallCount: number;
  lastRecalledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// COMPONENT PROPS (for React consumers)
// =============================================================================

export type VoicePlacement = 'floating' | 'sidebar' | 'header' | 'inline' | 'fullpage';
export type VoiceMode = 'greeting' | 'clarifier' | 'discovery' | 'interview';

/**
 * Shared base for the scaffold-time VoiceConfig (wizard output) and the runtime
 * VoiceWidgetProps. One declaration for the fields both need, so they cannot drift.
 */
export interface VoiceConfigBase {
  agentId: string;
  placement?: VoicePlacement;
  mode?: VoiceMode;
  /** Fall back to a text input when the ElevenLabs key / voice is unavailable. */
  textFallback?: boolean;
}

/**
 * Scaffold-time config emitted by the voice wizard. Adds fields the runtime widget
 * never needs (persona source, provisioning allowlist).
 */
export interface VoiceConfig extends VoiceConfigBase {
  /** Path/identifier of the canonical persona used at provision time (voice-config.json). */
  personaRef?: string;
  /** Origins written to the agent Security allowlist at provision time. */
  allowedOrigins?: string[];
}

/** Runtime props for the React VoiceWidget (PR2). Extends the shared base. */
export interface VoiceWidgetProps extends Omit<VoiceConfigBase, 'agentId'> {
  /** Public agent id — the default connect path. OPTIONAL when `signedUrl`/`getSignedUrl` is
   *  supplied (a private, owner-gated agent whose access is authorized server-side). */
  agentId?: string;
  /** Start from a pre-issued ElevenLabs signed URL instead of a public `agentId` — for private,
   *  owner-gated agents. Prefer `getSignedUrl` when the URL may expire before the user connects. */
  signedUrl?: string;
  /** Async source for a fresh signed URL, resolved at connect time; takes precedence over
   *  `agentId`. Use for owner-gated private agents: your route checks auth, then returns the URL. */
  getSignedUrl?: () => Promise<string>;
  userId?: string;
  sessionId?: string;

  // Session overrides sent to ElevenLabs at connect time
  overrides?: {
    agent?: {
      prompt?: { prompt: string };
      firstMessage?: string;
    };
  };

  // Client-side tools the agent can call
  clientTools?: Record<string, (params: Record<string, unknown>) => Promise<string>>;

  // Callbacks
  onConnect?: (conversationId: string) => void;
  onDisconnect?: () => void;
  onMessage?: (role: string, text: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: VoiceConnectionStatus) => void;
  /** Called when the user submits via the text fallback (no voice). */
  onTextFallbackSubmit?: (text: string) => void;

  // UI
  /** Explanatory header shown at the top of the open panel. Has a sensible default. */
  title?: string;
  /**
   * Open the panel on mount WITHOUT connecting — shows the greeting/header + a one-tap "start"
   * button (the proactive "greets-then-connects" pattern, mic only on the tap). Distinct from
   * `autoConnect`, which connects (and requests mic) on load. Use for a proactive greeter on a
   * public page where mic-on-load would be too aggressive.
   */
  autoOpen?: boolean;
  autoConnect?: boolean;
  /** A face for the coach (URL to an image in the consumer's /public, e.g. "/female_avatar.jpeg").
   * When set, the panel shows a circular avatar + name and the launcher shows the face — people
   * speak more freely to a face than a mic icon. The standard portfolio coach surface. */
  avatarUrl?: string;
  /** The coach's display name shown under the avatar (e.g. "Morgan"). */
  coachName?: string;
  className?: string;

  /**
   * Render a persistent text box in the connected panel (alongside voice), wired to
   * `sendUserMessage` so the user can type/paste INTO the live conversation — the agent sees it as
   * a user turn. Off by default (other consumers are voice-only). Distinct from `textFallback`,
   * which only appears when voice can't run. Use this when users need to paste data mid-call.
   */
  textInput?: boolean;

  /**
   * Embedded placements (`inline` / `fullpage`) only. Render a scrolling conversation transcript
   * (the message history) between the avatar and the controls — the avatar-on-top → scrolling-box →
   * Begin-button shape used on landing/intake surfaces. Leave OFF when the consumer already provides
   * its own conversation box below the coach (then the embedded coach is just avatar + Begin).
   */
  transcript?: boolean;

  /**
   * Called once the live session is connected, with imperative controls into THIS conversation.
   * Lets the consumer push messages the user didn't type — e.g. a timed "wrap up, ~2 min left"
   * contextual update the agent speaks, or a programmatic user message. No-op before connect.
   */
  onReady?: (controls: VoiceControls) => void;
}

/** Imperative handle into a live conversation, handed to `onReady`. */
export interface VoiceControls {
  /** Send a USER turn into the conversation (the agent responds to it). */
  sendUserMessage: (text: string) => void;
  /** Send non-spoken context that steers the agent's next turn (e.g. a time-remaining nudge). */
  sendContextualUpdate: (text: string) => void;
}

export type VoiceConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
