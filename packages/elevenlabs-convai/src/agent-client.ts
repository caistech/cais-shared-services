// elevenlabs-convai/agent-client.ts
// Server-side ElevenLabs Conversational AI agent management.
// CRUD operations for agents via the ElevenLabs API.
// No project-specific imports — pass config and API key at call site.

import type { ConvAIAgentConfig, ElevenLabsAgentConfig, ConvAITool } from './types';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1/convai';

// ElevenLabs rejects multilingual TTS models for English-only agents (April 2026).
// English agents must use an English-only model: eleven_flash_v2 or eleven_turbo_v2.
// Multilingual agents (32 languages) use eleven_turbo_v2_5.
const VOICE_MODEL_ENGLISH_DEFAULT = 'eleven_flash_v2';
const VOICE_MODEL_MULTILINGUAL_DEFAULT = 'eleven_turbo_v2_5';

export function defaultVoiceModelFor(language: string): string {
  return language === 'en' ? VOICE_MODEL_ENGLISH_DEFAULT : VOICE_MODEL_MULTILINGUAL_DEFAULT;
}

// =============================================================================
// AGENT CREATION
// =============================================================================

export interface CreateAgentOptions {
  config: ConvAIAgentConfig;
  systemPrompt: string;
  firstMessage: string;
  language?: string;          // Default: 'en'
  tools?: ConvAITool[];
}

export async function createAgent(
  apiKey: string,
  options: CreateAgentOptions
): Promise<{ agentId: string; agentName: string }> {
  const { config, systemPrompt, firstMessage, language = 'en', tools } = options;

  const agentConfig: ElevenLabsAgentConfig = {
    name: config.agentName,
    conversation_config: {
      agent: {
        prompt: {
          prompt: systemPrompt,
          llm: config.llmModel || 'gpt-4o-mini',
          temperature: config.temperature || 0.7,
        },
        first_message: firstMessage,
        language,
      },
      tts: {
        voice_id: config.voiceId,
        model_id: config.voiceModel || defaultVoiceModelFor(language),
      },
    },
    platform_settings: {
      webhook: {
        url: config.webhookUrl,
        events: config.webhookEvents || ['conversation.transcript', 'conversation.ended'],
      },
    },
  };

  // Add webhook tools if defined
  if (tools && tools.length > 0) {
    const webhookTools = tools
      .filter(t => t.type === 'webhook')
      .map(t => ({
        type: 'webhook',
        name: t.name,
        description: t.description,
        webhook: {
          url: t.webhook?.url || `${config.webhookUrl.replace(/\/webhook$/, '')}/tools/${t.name}`,
          method: t.webhook?.method || 'POST',
          headers: t.webhook?.headers || { 'Content-Type': 'application/json' },
        },
        parameters: t.parameters,
      }));

    if (webhookTools.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agentConfig as any).conversation_config.agent.tools = webhookTools;
    }
  }

  const response = await fetch(`${ELEVENLABS_API}/agents/create`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(agentConfig),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs agent creation failed: ${response.status} ${error}`);
  }

  const result = await response.json();

  return {
    agentId: result.agent_id,
    agentName: config.agentName,
  };
}

// =============================================================================
// AGENT UPDATE
// =============================================================================

export interface UpdateAgentOptions {
  systemPrompt?: string;
  llmModel?: string;
  temperature?: number;
  voiceId?: string;
  voiceModel?: string;
  firstMessage?: string;
  language?: string;          // Only used when voiceId is set + voiceModel is not; defaults to 'en'
}

export async function updateAgent(
  apiKey: string,
  agentId: string,
  options: UpdateAgentOptions
): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (options.systemPrompt) {
    updates.conversation_config = {
      agent: {
        prompt: {
          prompt: options.systemPrompt,
          llm: options.llmModel || 'gpt-4o-mini',
          temperature: options.temperature || 0.7,
        },
      },
    };
  }

  if (options.voiceId) {
    const existing = (updates.conversation_config as Record<string, unknown>) || {};
    updates.conversation_config = {
      ...existing,
      tts: {
        voice_id: options.voiceId,
        model_id: options.voiceModel || defaultVoiceModelFor(options.language || 'en'),
      },
    };
  }

  if (Object.keys(updates).length === 0) return;

  const response = await fetch(`${ELEVENLABS_API}/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs agent update failed: ${response.status} ${error}`);
  }
}

// =============================================================================
// AGENT DELETE
// =============================================================================

export async function deleteAgent(
  apiKey: string,
  agentId: string
): Promise<void> {
  const response = await fetch(`${ELEVENLABS_API}/agents/${agentId}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs agent deletion failed: ${response.status} ${error}`);
  }
}

// =============================================================================
// AGENT FETCH
// =============================================================================

export async function getAgent(
  apiKey: string,
  agentId: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${ELEVENLABS_API}/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs agent fetch failed: ${response.status} ${error}`);
  }

  return response.json();
}

// =============================================================================
// CONVERSATION HISTORY
// =============================================================================

export async function getConversationHistory(
  apiKey: string,
  conversationId: string
): Promise<Array<{ role: string; content: string; timestamp: string }>> {
  const response = await fetch(
    `${ELEVENLABS_API}/conversations/${conversationId}`,
    { headers: { 'xi-api-key': apiKey } }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch conversation: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.messages || [];
}
