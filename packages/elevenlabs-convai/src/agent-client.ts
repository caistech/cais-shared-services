// elevenlabs-convai/agent-client.ts
// Server-side ElevenLabs Conversational AI agent management.
// CRUD operations for agents via the ElevenLabs API.
// No project-specific imports — pass config and API key at call site.

import type { ConvAIAgentConfig, ElevenLabsAgentConfig, ConvAITool } from './types.js';

export const ELEVENLABS_API = 'https://api.elevenlabs.io/v1/convai';

// ElevenLabs rejects multilingual TTS models for English-only agents (April 2026).
// English agents must use an English-only model: eleven_flash_v2 or eleven_turbo_v2.
// Multilingual agents (32 languages) use eleven_turbo_v2_5.
const VOICE_MODEL_ENGLISH_DEFAULT = 'eleven_flash_v2';
const VOICE_MODEL_MULTILINGUAL_DEFAULT = 'eleven_turbo_v2_5';

export function defaultVoiceModelFor(language: string): string {
  return language === 'en' ? VOICE_MODEL_ENGLISH_DEFAULT : VOICE_MODEL_MULTILINGUAL_DEFAULT;
}

/**
 * Map generic ConvAITool definitions to the ElevenLabs agent-tools wire shape.
 * Shared by createAgent (on create) and provision.ts setAgentTools (on re-provision)
 * so the tool payload is built one way only. `fallbackBaseUrl` derives a per-tool URL
 * for any tool that didn't carry an explicit webhook URL (createConversationTools
 * always sets one, so the fallback is rarely exercised).
 */
export function toElevenLabsTools(tools: ConvAITool[], fallbackBaseUrl?: string) {
  return tools
    .filter((t) => t.type === 'webhook')
    .map((t) => {
      const derivedUrl = fallbackBaseUrl
        ? `${fallbackBaseUrl.replace(/\/webhook$/, '')}/tools/${t.name}`
        : undefined;
      return {
        type: 'webhook' as const,
        name: t.name,
        description: t.description,
        webhook: {
          url: t.webhook?.url || derivedUrl,
          method: t.webhook?.method || 'POST',
          headers: t.webhook?.headers || { 'Content-Type': 'application/json' },
        },
        parameters: t.parameters,
      };
    });
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
  // Enable per-session conversation_config_override (first_message / prompt /
  // language). Required for the VoiceWidget clarifier use case — without it
  // ElevenLabs silently ignores client-sent overrides. Default: false.
  enableOverrides?: boolean;
  // Arbitrary additional platform_settings keys merged into the outgoing payload
  // (widget, evaluation, etc.). The post-call webhook is NOT bound here — it is
  // workspace-scoped via bindWorkspaceWebhook() in provision.ts.
  platformSettings?: Record<string, unknown>;
}

// Override-enablement block written into platform_settings.overrides.
// Lets a client (VoiceWidget) override these fields per session at connect time.
// NOTE: confirm this shape against the live ElevenLabs API before relying on it in
// production — the dashboard stopped surfacing these toggles and the API field has
// moved between revisions (see CLAUDE.md voice failure-modes). Verification is runtime:
// if per-session language/greeting/prompt overrides take effect, this is correct.
export function buildOverrideEnablement(): Record<string, unknown> {
  return {
    conversation_config_override: {
      agent: {
        prompt: { prompt: true },
        first_message: true,
        language: true,
      },
    },
  };
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
  };

  // Build platform_settings. The post-call webhook is intentionally NOT bound here:
  // per-agent platform_settings.webhook is the deprecated shape that previously bound
  // one product's agent to another product's workspace webhook (cross-product transcript
  // leak). Post-call delivery is now workspace-scoped — see bindWorkspaceWebhook().
  const platformSettings: Record<string, unknown> = { ...(options.platformSettings || {}) };

  if (options.enableOverrides) {
    platformSettings.overrides = buildOverrideEnablement();
  }

  if (Object.keys(platformSettings).length > 0) {
    agentConfig.platform_settings = platformSettings as ElevenLabsAgentConfig['platform_settings'];
  }

  // Add webhook tools if defined
  if (tools && tools.length > 0) {
    const webhookTools = toElevenLabsTools(tools, config.webhookUrl);
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
  name?: string;              // Top-level agent display name
}

export async function updateAgent(
  apiKey: string,
  agentId: string,
  options: UpdateAgentOptions
): Promise<void> {
  const updates: Record<string, unknown> = {};
  const agentPatch: Record<string, unknown> = {};

  if (options.systemPrompt) {
    agentPatch.prompt = {
      prompt: options.systemPrompt,
      llm: options.llmModel || 'gpt-4o-mini',
      temperature: options.temperature || 0.7,
    };
  }
  if (options.firstMessage) {
    agentPatch.first_message = options.firstMessage;
  }

  if (Object.keys(agentPatch).length > 0) {
    updates.conversation_config = { agent: agentPatch };
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

  if (options.name) {
    updates.name = options.name;
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

// =============================================================================
// AGENT LIST / SEARCH (idempotent provisioning)
// =============================================================================

export interface AgentSummary {
  agentId: string;
  name: string;
}

/**
 * List all agents in the workspace, following cursor pagination to completion.
 * Used by provisionVoiceAgent() to find an existing agent before creating one.
 */
export async function listAgents(apiKey: string): Promise<AgentSummary[]> {
  const out: AgentSummary[] = [];
  let cursor: string | undefined;

  // Bound the loop defensively so a malformed cursor can never spin forever.
  for (let page = 0; page < 1000; page++) {
    const url = new URL(`${ELEVENLABS_API}/agents`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString(), {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs agent list failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    for (const a of data.agents || []) {
      out.push({ agentId: a.agent_id, name: a.name });
    }

    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return out;
}

/**
 * Find every agent whose name matches exactly. Returns 0, 1, or many — the caller
 * decides what to do (provisionVoiceAgent aborts on 2+ to avoid touching the wrong one).
 */
export async function findAgentsByName(apiKey: string, name: string): Promise<AgentSummary[]> {
  const agents = await listAgents(apiKey);
  return agents.filter((a) => a.name === name);
}
