// elevenlabs-convai/provision.ts
// Idempotent end-to-end provisioning for an ElevenLabs ConvAI agent.
//
// Codifies the four documented provisioning failure modes (see CLAUDE.md voice rules):
//   1. Duplicate agents      → idempotency: stored id first, name-search fallback,
//                              ABORT on 2+ matches (never guess which one).
//   2. Open allowlist        → always write the Security allowlist.
//   3. Wrong webhook binding  → workspace-scoped create-then-bind via
//                              post_call_webhook_id, NEVER the deprecated per-agent
//                              platform_settings.webhook.url (that leaked one product's
//                              transcripts into another product's pipeline).
//   4. Overrides ignored      → enable conversation_config_override so the VoiceWidget
//                              clarifier can override prompt/first_message/language.
//
// API field shapes marked "CONFIRM" should be verified against the live ElevenLabs API
// before relying on them in production — the dashboard has moved these between revisions.
// The orchestration logic (idempotency, ordering, abort) is independent of those shapes
// and is what the test suite pins.

import {
  ELEVENLABS_API,
  createAgent,
  updateAgent,
  getAgent,
  findAgentsByName,
  toElevenLabsTools,
  buildOverrideEnablement,
} from './agent-client.js';
import type { ConvAIAgentConfig, ConvAITool } from './types.js';

const WORKSPACE_WEBHOOKS = `${ELEVENLABS_API}/workspace/webhooks`;
const PLACEHOLDER_VOICE_ID = 'REPLACE_WITH_CANONICAL_ELEVENLABS_VOICE_ID';

// =============================================================================
// ALLOWLIST
// =============================================================================

/**
 * Standard origin allowlist for a BYOK public agent: production host, Vercel preview
 * deploys, and local dev. Pass the bare hostname(s) — no scheme.
 */
export function standardAllowlist(prodHostname: string): string[] {
  return [prodHostname, '*.vercel.app', 'localhost:3000'];
}

/**
 * Write the agent's Security → Allowlist. Without this, anyone who reads the agent ID
 * from the client bundle can spin up free voice calls on the workspace's ElevenLabs key.
 */
export async function setAllowlist(
  apiKey: string,
  agentId: string,
  hostnames: string[]
): Promise<void> {
  const body = {
    // CONFIRM: Security → Allowlist lives under platform_settings.auth.{enable_overrides_*, allowlist}.
    platform_settings: {
      auth: {
        allowlist: hostnames.map((h) => ({ hostname: h })),
      },
    },
  };
  const res = await fetch(`${ELEVENLABS_API}/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs allowlist update failed: ${res.status} ${await res.text()}`);
  }
}

// =============================================================================
// OVERRIDE ENABLEMENT (adopt/update path; createAgent does it on create)
// =============================================================================

export async function setAgentOverrides(apiKey: string, agentId: string): Promise<void> {
  const res = await fetch(`${ELEVENLABS_API}/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform_settings: { overrides: buildOverrideEnablement() } }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs override enablement failed: ${res.status} ${await res.text()}`);
  }
}

// =============================================================================
// TOOLS (adopt/update path; createAgent wires tools on create)
// =============================================================================

export async function setAgentTools(
  apiKey: string,
  agentId: string,
  tools: ConvAITool[]
): Promise<void> {
  const res = await fetch(`${ELEVENLABS_API}/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_config: { agent: { tools: toElevenLabsTools(tools) } },
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs tool update failed: ${res.status} ${await res.text()}`);
  }
}

// =============================================================================
// WORKSPACE WEBHOOK (create-or-reuse, then bind)
// =============================================================================

/**
 * Ensure a workspace-scoped webhook for `url` exists, then bind the agent to it via
 * post_call_webhook_id. Reuses an existing workspace webhook with the same URL rather
 * than creating duplicates. Returns the workspace webhook id.
 */
export async function bindWorkspaceWebhook(
  apiKey: string,
  agentId: string,
  opts: { name: string; url: string; events?: string[] }
): Promise<string> {
  // 1. Reuse an existing workspace webhook with this exact URL if present.
  let webhookId: string | undefined;
  const listRes = await fetch(WORKSPACE_WEBHOOKS, { headers: { 'xi-api-key': apiKey } });
  if (listRes.ok) {
    const data = await listRes.json();
    const existing = (data.webhooks || []).find(
      (w: { url?: string; webhook_id?: string; id?: string }) => w.url === opts.url
    );
    if (existing) webhookId = existing.webhook_id || existing.id;
  }

  // 2. Create one if none matched.
  if (!webhookId) {
    const createRes = await fetch(WORKSPACE_WEBHOOKS, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: opts.name,
        url: opts.url,
        // CONFIRM event names vs live API.
        events: opts.events || ['conversation.ended', 'conversation.transcript'],
      }),
    });
    if (!createRes.ok) {
      throw new Error(`ElevenLabs workspace webhook create failed: ${createRes.status} ${await createRes.text()}`);
    }
    const created = await createRes.json();
    webhookId = created.webhook_id || created.id;
  }

  if (!webhookId) {
    throw new Error('ElevenLabs workspace webhook: no webhook_id returned by create/list.');
  }

  // 3. Bind the agent to the workspace webhook (the correct, non-leaking shape).
  const bindRes = await fetch(`${ELEVENLABS_API}/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform_settings: { post_call_webhook_id: webhookId } }),
  });
  if (!bindRes.ok) {
    throw new Error(`ElevenLabs agent webhook bind failed: ${bindRes.status} ${await bindRes.text()}`);
  }

  return webhookId;
}

// =============================================================================
// PROVISION (orchestrator)
// =============================================================================

export interface ProvisionVoiceAgentOptions {
  /** Agent identity + voice + LLM config (from voice-config.json + per-product name). */
  config: ConvAIAgentConfig;
  systemPrompt: string;
  firstMessage: string;
  language?: string;                 // Default: 'en'
  tools?: ConvAITool[];              // Usually createConversationTools(baseUrl)
  /** Your app's public URL — used to derive the post-call webhook URL. */
  baseUrl: string;
  postCallWebhookPath?: string;      // Default: '/api/convai/webhooks/post-call'
  /** Origins allowed to use the agent ID (e.g. standardAllowlist('myapp.com')). */
  allowedOrigins: string[];
  /** Stored elevenlabs_agent_id, if known — the primary idempotency key. */
  existingAgentId?: string;
  enableOverrides?: boolean;         // Default: true
}

export interface ProvisionResult {
  agentId: string;
  agentName: string;
  created: boolean;          // true if a new agent was created, false if an existing one was updated
  webhookId: string;
}

export async function provisionVoiceAgent(
  apiKey: string,
  options: ProvisionVoiceAgentOptions
): Promise<ProvisionResult> {
  const {
    config,
    systemPrompt,
    firstMessage,
    language = 'en',
    tools,
    baseUrl,
    postCallWebhookPath = '/api/convai/webhooks/post-call',
    allowedOrigins,
    existingAgentId,
    enableOverrides = true,
  } = options;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('provisionVoiceAgent: an ElevenLabs API key is required (BYOK).');
  }
  if (!baseUrl || baseUrl.trim() === '') {
    throw new Error('provisionVoiceAgent: baseUrl is required (your app public URL).');
  }
  if (!config.voiceId || config.voiceId === PLACEHOLDER_VOICE_ID) {
    throw new Error(
      'provisionVoiceAgent: config.voiceId is missing or still the placeholder. ' +
      'Set the canonical voice ID in voice-config.json before provisioning.'
    );
  }
  if (!allowedOrigins || allowedOrigins.length === 0) {
    throw new Error('provisionVoiceAgent: allowedOrigins must be non-empty (Security allowlist).');
  }

  const updateOpts = {
    systemPrompt,
    firstMessage,
    llmModel: config.llmModel,
    temperature: config.temperature,
    voiceId: config.voiceId,
    voiceModel: config.voiceModel,
    language,
    name: config.agentName,
  };

  let agentId: string;
  let created = false;

  // --- Idempotency: stored id first, then name-search fallback (abort on 2+) ---
  if (existingAgentId) {
    await getAgent(apiKey, existingAgentId);   // throws if it no longer exists
    agentId = existingAgentId;
    await updateAgent(apiKey, agentId, updateOpts);
  } else {
    const matches = await findAgentsByName(apiKey, config.agentName);
    if (matches.length > 1) {
      throw new Error(
        `provisionVoiceAgent: ${matches.length} agents named "${config.agentName}" already exist ` +
        `(${matches.map((m) => m.agentId).join(', ')}). Refusing to guess which one to use — ` +
        `pass existingAgentId explicitly or remove the duplicates.`
      );
    }
    if (matches.length === 1) {
      agentId = matches[0].agentId;
      await updateAgent(apiKey, agentId, updateOpts);
    } else {
      const result = await createAgent(apiKey, {
        config,
        systemPrompt,
        firstMessage,
        language,
        tools,
        enableOverrides,
      });
      agentId = result.agentId;
      created = true;
    }
  }

  // --- On the adopt/update path, refresh overrides + tools (create already set them) ---
  if (!created) {
    if (enableOverrides) await setAgentOverrides(apiKey, agentId);
    if (tools && tools.length > 0) await setAgentTools(apiKey, agentId, tools);
  }

  // --- Security allowlist (always) ---
  await setAllowlist(apiKey, agentId, allowedOrigins);

  // --- Workspace-scoped post-call webhook (always; create-or-reuse + bind) ---
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}${postCallWebhookPath}`;
  const webhookId = await bindWorkspaceWebhook(apiKey, agentId, {
    name: `${config.agentName} post-call`,
    url: webhookUrl,
  });

  return { agentId, agentName: config.agentName, created, webhookId };
}
