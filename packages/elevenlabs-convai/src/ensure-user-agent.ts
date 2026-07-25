import type { SupabaseClient } from '@supabase/supabase-js';
import { provisionVoiceAgent, setAgentTools, type ProvisionVoiceAgentOptions, type ProvisionResult } from './provision.js';
import { createConversationTools } from './conversation-tools.js';
import type { TableNames } from './webhook-handlers.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, any, any>;

/**
 * ONE AGENT PER USER — the canonical identity model, made reusable.
 *
 * This is the orchestration every memory-bearing product was re-implementing
 * by hand (Kira's scripts/reprovision-kira-agents.mjs `buildToolsForUser`
 * appended `?uid=` and the secret header itself, and each new product copied
 * the idea). The PRIMITIVES were already canonical — provisionVoiceAgent,
 * createConversationTools({secret, identity}) — but the loop around them was
 * not, so it kept getting forked. It lives here now.
 *
 * WHY one-agent-per-user at all: ElevenLabs does NOT pass the conversation id
 * to server-tool webhooks — the agent sends only the LLM-filled params — so a
 * recall_memory tool receiving `{query}` cannot bind a conversation and recall
 * silently returns nothing. With an agent per user the owner is known at
 * PROVISION time: bake it into the tool URL (`?uid=…`) and the route resolves
 * identity server-side, never trusting anything the agent says.
 *
 * Idempotent: an existing binding short-circuits, so this is safe to call on
 * every page load / sign-in. Pass `refreshTools: true` after rotating the
 * secret or changing the tool set to re-push tool config to a bound agent.
 */
export interface EnsureUserAgentOptions {
  /** SERVICE-ROLE client — this writes the binding row. */
  supabase: Supabase;
  /** ElevenLabs API key (BYOK — the operator's key). */
  apiKey: string;
  /** The owner. The agent is bound to this id and it is baked into the tools. */
  userId: string;
  /** Public base URL for webhooks + allowlist, e.g. https://app.example.com */
  baseUrl: string;
  /** Where the convai webhook routes are mounted. */
  webhookBasePath?: string;
  /** Tool-webhook auth secret; baked as x-convai-tool-secret on every tool. */
  toolSecret?: string;
  /** Table overrides — defaults to the canonical convai_* names. */
  tableNames?: Pick<TableNames, 'agents'>;
  /** Everything provisionVoiceAgent needs except `tools` and `baseUrl`. */
  agent: Omit<ProvisionVoiceAgentOptions, 'tools' | 'baseUrl'>;
  /** Re-push tool config to an already-bound agent (secret rotation, new tools). */
  refreshTools?: boolean;
}

export interface EnsureUserAgentResult {
  agentId: string;
  /** True when this call provisioned the agent (vs reusing an existing binding). */
  created: boolean;
  /** Present only on the run that created the workspace webhook. Store it. */
  webhookSecret?: string;
}

export async function ensureUserAgent(
  options: EnsureUserAgentOptions
): Promise<EnsureUserAgentResult> {
  const {
    supabase,
    apiKey,
    userId,
    baseUrl,
    webhookBasePath = '/api/convai/webhooks',
    toolSecret,
    tableNames,
    agent,
    refreshTools = false,
  } = options;

  if (!apiKey?.trim()) throw new Error('ensureUserAgent: an ElevenLabs API key is required (BYOK).');
  if (!userId?.trim()) throw new Error('ensureUserAgent: userId is required.');
  if (!baseUrl?.trim()) throw new Error('ensureUserAgent: baseUrl is required.');

  const agentsTable = tableNames?.agents ?? 'convai_agents';

  // Tools carry the owner (?uid=) and the auth header. This is the whole point:
  // identity is fixed at provision time, never supplied by the agent.
  const tools = createConversationTools(baseUrl, webhookBasePath, {
    secret: toolSecret,
    identity: { value: userId },
  });

  // Existing binding? Reuse it.
  const { data: existing } = await supabase
    .from(agentsTable)
    .select('elevenlabs_agent_id')
    .eq('user_id', userId)
    .maybeSingle();

  const existingAgentId = existing?.elevenlabs_agent_id as string | undefined;

  if (existingAgentId && !refreshTools) {
    return { agentId: existingAgentId, created: false };
  }

  if (existingAgentId && refreshTools) {
    await setAgentTools(apiKey, existingAgentId, tools);
    return { agentId: existingAgentId, created: false };
  }

  // THE AGENT NAME MUST BE UNIQUE PER USER.
  //
  // provisionVoiceAgent is idempotent BY NAME (findAgentsByName). If every user
  // is provisioned under the same constant name — the obvious thing for a
  // consumer to pass — then user #2 gets handed user #1's agent, and the
  // binding insert then fails on the unique elevenlabs_agent_id. Observed in
  // BucketLyst production: the second buyer's dashboard logged "duplicate key
  // value violates unique constraint convai_agents_elevenlabs_agent_id_key"
  // and silently fell back to no voice agent at all.
  //
  // Scoping the name here rather than documenting it means a consumer cannot
  // get this wrong.
  const perUserAgentName = `${agent.config.agentName} · ${userId.slice(0, 8)}`;

  const result: ProvisionResult = await provisionVoiceAgent(apiKey, {
    ...agent,
    config: { ...agent.config, agentName: perUserAgentName },
    baseUrl,
    tools,
  });

  // Bind the agent to its owner. Without this row the webhook routes cannot
  // resolve identity from elevenlabs_agent_id on start_conversation.
  const { error } = await supabase.from(agentsTable).insert({
    user_id: userId,
    agent_name: result.agentName,
    elevenlabs_agent_id: result.agentId,
    status: 'active',
  });

  if (error) {
    throw new Error(
      `ensureUserAgent: agent ${result.agentId} was provisioned but the binding row failed to write ` +
        `(${error.message}). Identity cannot resolve without it — reconcile before using this agent.`
    );
  }

  return { agentId: result.agentId, created: true, webhookSecret: result.webhookSecret };
}
