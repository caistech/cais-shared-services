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
  llmModel?: string;          // Default: 'gpt-4o-mini'
  temperature?: number;       // Default: 0.7

  // Webhook
  webhookUrl: string;
  webhookEvents?: string[];   // Default: ['conversation.transcript', 'conversation.ended']
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

export interface ConvAITool {
  type: ToolType;
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
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
      };
      first_message: string;
      language: string;
    };
    tts: {
      voice_id: string;
      model_id: string;
    };
  };
  platform_settings?: {
    webhook?: {
      url: string;
      events: string[];
    };
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

export interface VoiceWidgetProps {
  agentId: string;
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

  // UI
  autoConnect?: boolean;
  className?: string;
}
