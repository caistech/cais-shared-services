// elevenlabs-convai/agent-client.ts
// Server-side ElevenLabs Conversational AI agent management.
// CRUD operations for agents via the ElevenLabs API.
// No project-specific imports — pass config and API key at call site.

import type { ConvAIAgentConfig, ElevenLabsAgentConfig, ConvAITool } from './types.js';

export const ELEVENLABS_API = 'https://api.elevenlabs.io/v1/convai';
// Workspace tool entities. Since ~April 2026 ElevenLabs no longer accepts inline agent
// tools (conversation_config.agent.tools) — those are SILENTLY STRIPPED, leaving the
// agent with zero tools. Tools must be created as workspace entities here, then
// referenced by the agent via conversation_config.agent.prompt.tool_ids.
export const WORKSPACE_TOOLS_API = `${ELEVENLABS_API}/tools`;

// ElevenLabs rejects multilingual TTS models for English-only agents (April 2026).
// English agents must use an English-only model: eleven_flash_v2 or eleven_turbo_v2.
// Multilingual agents (32 languages) use eleven_turbo_v2_5.
const VOICE_MODEL_ENGLISH_DEFAULT = 'eleven_flash_v2';
const VOICE_MODEL_MULTILINGUAL_DEFAULT = 'eleven_turbo_v2_5';

// Portfolio-standard reasoning LLM for ALL ElevenLabs agents (the non-Claude-Code workhorse).
// gpt-4o-mini dropped tool calls over long conversations (the SayFix intake lost 20 min of
// field capture); gpt-4.1-mini is the same cheap/low-latency tier but materially more reliable at
// function-calling + instruction-following. Set at the hub so every agent inherits it — override
// per-agent via config.llmModel only for a deliberate exception.
export const DEFAULT_AGENT_LLM = 'gpt-4.1-mini';

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

/**
 * Map a generic ConvAITool to the ElevenLabs WORKSPACE tool entity wire shape
 * (POST /v1/convai/tools). The LLM-filled parameters become the webhook POST body,
 * so they map to `api_schema.request_body_schema`. Supersedes the inline shape that
 * `toElevenLabsTools` produced (which ElevenLabs now silently strips).
 */
export function toWorkspaceToolConfig(tool: ConvAITool, fallbackBaseUrl?: string) {
  const derivedUrl = fallbackBaseUrl
    ? `${fallbackBaseUrl.replace(/\/webhook$/, '')}/tools/${tool.name}`
    : undefined;
  return {
    type: 'webhook' as const,
    name: tool.name,
    description: tool.description,
    response_timeout_secs: 20,
    api_schema: {
      url: tool.webhook?.url || derivedUrl,
      method: tool.webhook?.method || 'POST',
      request_headers: tool.webhook?.headers || { 'Content-Type': 'application/json' },
      request_body_schema: tool.parameters,
    },
  };
}

type WorkspaceToolRow = {
  id?: string;
  tool_config?: { name?: string; api_schema?: { url?: string } };
};

/** Hard bound on pagination. 200 pages × 100 = 20,000 tools — far past any real workspace,
 *  and present only so a malformed cursor cannot spin forever inside a live voice call. */
const MAX_TOOL_PAGES = 200;

/**
 * List EVERY workspace tool, following the cursor to the end.
 *
 * ⚠️ THIS MUST BE COMPLETE OR IT MUST THROW — there is no useful middle. The list is used to
 * decide "does this tool already exist?", so a partial list does not degrade the answer, it
 * INVERTS it: every tool the caller could not see is reported absent and then created again.
 *
 * That is not hypothetical. This function fetched a single unpaginated page for its whole life,
 * and the endpoint pages at 100. The portfolio's workspace reached 702 tools, so provisioning
 * matched against 14% of them and duplicated the rest — measured 2026-08-10: 534 of 702 tools
 * attached to no live agent. It fails silently, it looks exactly like normal operation, and it
 * ACCELERATES: more tools → smaller visible fraction → more duplicates.
 *
 * A failed page therefore throws rather than returning what it has. The old code did the
 * opposite (`listRes.ok ? … : []`), so one blip on the list call meant "the workspace is
 * empty" and re-created every tool — and `ensureUserAgent` is documented as safe to call on
 * every page load, which is the frequency that turns a blip into hundreds of orphans.
 * A refused provision is retryable and visible; duplicates are permanent and this package has
 * no delete.
 */
async function listAllWorkspaceTools(apiKey: string): Promise<WorkspaceToolRow[]> {
  const all: WorkspaceToolRow[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_TOOL_PAGES; page++) {
    const url = new URL(WORKSPACE_TOOLS_API);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    // One retry, because the alternative to a transient failure here is not "no tools" but
    // "duplicate everything". Retrying a read is free; getting this wrong is not.
    let res = await fetch(url, { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) res = await fetch(url, { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) {
      throw new Error(
        `ElevenLabs workspace tool list failed on page ${page + 1}: ${res.status} ${await res.text()} — ` +
          `refusing to continue, because an incomplete list causes every unseen tool to be duplicated.`
      );
    }

    const body = (await res.json()) as {
      tools?: WorkspaceToolRow[];
      has_more?: boolean;
      next_cursor?: string;
    };
    all.push(...(body.tools ?? []));
    if (!body.has_more || !body.next_cursor) return all;
    cursor = body.next_cursor;
  }

  throw new Error(
    `ElevenLabs workspace tool list exceeded ${MAX_TOOL_PAGES} pages — refusing to continue rather than provision against a truncated list.`
  );
}

/**
 * Ensure each webhook tool exists as a WORKSPACE tool entity; return their ids in the
 * same order as `tools`. Idempotent on (name + url): workspace tools are workspace-scoped
 * (shared across every agent + product), so reusing by NAME ALONE would bind product B's
 * agent to product A's tool (which points at A's webhook URL) — the same cross-product
 * leak class as the per-agent webhook bug. Matching name+url keeps each product on its own.
 *
 * The url half of that key also carries per-user identity where a product bakes `?uid=`
 * (see createConversationTools), so name-alone would additionally hand one owner's agent
 * another owner's tool. Measured in the Kira workspace: 47 distinct names across 702 tools.
 */
export async function ensureWorkspaceTools(
  apiKey: string,
  tools: ConvAITool[],
  fallbackBaseUrl?: string
): Promise<string[]> {
  const webhookTools = tools.filter((t) => t.type === 'webhook');
  if (webhookTools.length === 0) return [];

  const existing = await listAllWorkspaceTools(apiKey);

  const ids: string[] = [];
  for (const tool of webhookTools) {
    const cfg = toWorkspaceToolConfig(tool, fallbackBaseUrl);
    const match = existing.find(
      (e) =>
        e.tool_config?.name === cfg.name &&
        e.tool_config?.api_schema?.url === cfg.api_schema.url
    );
    if (match?.id) {
      // A workspace tool with this name+url already exists. UPDATE its config in place rather than
      // reuse-as-is — otherwise a changed header (e.g. the tool secret), request-body schema, or
      // description silently never propagates, and re-provisioning appears to do nothing. Best-effort:
      // a failed PATCH is non-fatal (we still reference the existing tool).
      const patchRes = await fetch(`${WORKSPACE_TOOLS_API}/${match.id}`, {
        method: 'PATCH',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_config: cfg }),
      });
      if (!patchRes.ok) {
        console.warn(
          `[convai] workspace tool update failed for "${cfg.name}" (${match.id}): ${patchRes.status} — reusing existing config`
        );
      }
      ids.push(match.id);
      continue;
    }
    const res = await fetch(WORKSPACE_TOOLS_API, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_config: cfg }),
    });
    if (!res.ok) {
      throw new Error(
        `ElevenLabs workspace tool create failed for "${cfg.name}": ${res.status} ${await res.text()}`
      );
    }
    const created = await res.json();
    if (!created.id) {
      throw new Error(`ElevenLabs workspace tool create returned no id for "${cfg.name}".`);
    }
    ids.push(created.id);
  }
  return ids;
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
  // Max conversation length in seconds. ElevenLabs defaults to 600 (10 min) — too short for a
  // discovery/coaching call. Defaults to 1200 (20 min). The agent should also be told in its prompt
  // to warn the user when the chat is nearly up ("we keep each chat to ~20 minutes").
  maxDurationSeconds?: number;
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
  const { config, systemPrompt, firstMessage, language = 'en', tools, maxDurationSeconds = 1200 } = options;

  const agentConfig: ElevenLabsAgentConfig = {
    name: config.agentName,
    conversation_config: {
      agent: {
        prompt: {
          prompt: systemPrompt,
          llm: config.llmModel || DEFAULT_AGENT_LLM,
          temperature: config.temperature || 0.7,
        },
        first_message: firstMessage,
        language,
      },
      tts: {
        voice_id: config.voiceId,
        model_id: config.voiceModel || defaultVoiceModelFor(language),
      },
      // 20-min default (vs ElevenLabs' 600s) so a discovery/coaching call isn't cut short.
      conversation: {
        max_duration_seconds: maxDurationSeconds,
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

  // Register tools as WORKSPACE tool entities and reference them by id on the prompt.
  // The deprecated inline conversation_config.agent.tools shape is silently stripped by
  // ElevenLabs (~April 2026) — an agent created that way ends up with zero tools.
  if (tools && tools.length > 0) {
    const toolIds = await ensureWorkspaceTools(apiKey, tools, config.webhookUrl);
    if (toolIds.length > 0) {
      agentConfig.conversation_config.agent.prompt.tool_ids = toolIds;
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
      llm: options.llmModel || DEFAULT_AGENT_LLM,
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

// =============================================================================
// WORKSPACE TOOL PRUNE — deleting what nothing references
// =============================================================================

/**
 * Delete a workspace tool.
 *
 * Returns `'in_use'` rather than throwing when ElevenLabs refuses because an agent still
 * references it (the same refusal shape as `webhook_in_use` on webhook deletion). That refusal
 * is a SAFETY NET, not the safety model — never rely on it to catch a mistaken delete, because
 * it is the vendor's opinion and it is not documented as exhaustive.
 */
export async function deleteWorkspaceTool(
  apiKey: string,
  toolId: string
): Promise<'deleted' | 'in_use'> {
  const res = await fetch(`${WORKSPACE_TOOLS_API}/${toolId}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': apiKey },
  });
  if (res.ok) return 'deleted';

  const body = await res.text();
  if (res.status === 405 || res.status === 409 || /in_use|in use/i.test(body)) return 'in_use';
  throw new Error(`ElevenLabs workspace tool delete failed for ${toolId}: ${res.status} ${body}`);
}

export type OrphanScan = {
  /** Tools referenced by no agent in the workspace. */
  orphans: Array<{ id: string; name?: string; url?: string }>;
  totalTools: number;
  referencedTools: number;
  agentsScanned: number;
};

/**
 * Find workspace tools that NO agent references.
 *
 * ⚠️ THE REFERENCE SET MUST BE COMPLETE OR THIS MUST THROW, and this is the whole design.
 *
 * The workspace is SHARED BY EVERY PRODUCT — measured 2026-08-10, one workspace held 212 agents
 * and 702 tools across eleven products. So "orphan" is only meaningful against **every agent in
 * the workspace**, not the agents of the product asking. Scan one product's agents and you will
 * classify another product's LIVE tools as orphans and delete them; the first symptom would be
 * someone else's voice agent losing its tools, in a repo nobody had touched.
 *
 * That is exactly the mistake the first orphan count in this investigation made — 534 was computed
 * against Kira's agents alone, so it counted every other product's live tools as unreferenced. It
 * is a fine number for "how many tools is Kira not using" and a catastrophic one to delete by.
 *
 * Therefore: any failure to enumerate agents or to read one agent's tool_ids throws. A partial
 * reference set does not make the answer approximate, it makes it dangerously wrong in one
 * direction — everything unseen looks deletable.
 *
 * ⚠️ "UNREFERENCED" IS NECESSARY BUT NOT SUFFICIENT. Do not read this function as "safe to
 * delete". ElevenLabs tracks dependencies this API cannot see: in the live 2026-08-10 prune, 65
 * tools that no agent's `tool_ids` referenced were refused with
 *
 *     409 conflict — "Tool is still in use by: Unknown / Main.
 *                     Please remove the dependency or use Force Delete."
 *
 * and one of them carried a LIVE owner's `?uid=`. Whatever "Unknown / Main" is, it is not
 * enumerable from `listAgents` + `tool_ids`, so this scan proposes and the VENDOR adjudicates.
 * That is also the honest account of why the 340 deletions in that run were safe: not because
 * this model was complete, but because ElevenLabs refused the ones it wasn't.
 *
 * A `Force Delete` exists. This package deliberately does not offer it — overriding the only
 * party that can see the dependency, on tools carrying real users' identity, to reclaim rows in
 * a list is not a trade worth making. Add it only with a named, reasoned call site.
 */
export async function findOrphanedWorkspaceTools(apiKey: string): Promise<OrphanScan> {
  const tools = await listAllWorkspaceTools(apiKey);
  const agents = await listAgents(apiKey); // paginates + throws on failure

  const referenced = new Set<string>();
  for (const summary of agents) {
    // getAgent throws on a non-ok response, which is what we want: an agent we could not read
    // may hold references, and proceeding would treat its tools as free to delete.
    const agent = (await getAgent(apiKey, summary.agentId)) as {
      conversation_config?: { agent?: { prompt?: { tool_ids?: string[] } } };
    };
    for (const id of agent.conversation_config?.agent?.prompt?.tool_ids ?? []) {
      referenced.add(id);
    }
  }

  const orphans = tools
    .filter((t) => t.id && !referenced.has(t.id))
    .map((t) => ({ id: t.id as string, name: t.tool_config?.name, url: t.tool_config?.api_schema?.url }));

  return {
    orphans,
    totalTools: tools.length,
    referencedTools: referenced.size,
    agentsScanned: agents.length,
  };
}

export type PruneOptions = {
  /** Defaults to TRUE. Destruction is opt-in, never the default of a function you called to look. */
  dryRun?: boolean;
  /** Narrow to the caller's own tools — e.g. `(t) => t.url?.includes('myproduct.com')`. */
  filter?: (tool: { id: string; name?: string; url?: string }) => boolean;
  /**
   * Cap on tools actually DELETED in this run — not on attempts.
   *
   * It counted attempts until 0.15.1, which is wrong in the one case that matters: a refused
   * tool consumed the budget, so a `limit: 100` batch against a list whose first 37 entries were
   * all refusals deleted 63. Batching then converged far slower than the numbers implied, and a
   * caller watching "deleted: 63" against a limit of 100 has no way to tell throttling from
   * exhaustion. Refusals are free; only deletions are spent.
   */
  limit?: number;
  /**
   * Tool ids to skip outright — in practice, ids a previous run reported in `inUse`.
   *
   * Candidates come back in a stable order, so refusals sit at the FRONT of every subsequent
   * batch and get re-attempted forever. In the live 2026-08-10 prune that meant the same 65
   * ids were retried in each pass, and the refusal list printed to the operator grew every
   * batch — which reads like a spreading problem rather than the same wall hit repeatedly.
   */
  skipIds?: readonly string[];
};

/**
 * Delete workspace tools that no agent references.
 *
 * `dryRun` defaults to TRUE: this reports what it would remove and removes nothing until a caller
 * explicitly says otherwise. There is no undo, and the tools carry per-user identity in their URLs.
 *
 * Pass `filter` to scope a prune to your own product's tools. In a shared workspace that is the
 * difference between tidying your own debris and tidying someone else's live install — see the
 * warning on `findOrphanedWorkspaceTools`.
 *
 * ⚠️ RACE: an agent provisioned between the scan and the delete would have its brand-new tools
 * classified as orphans. Prune when provisioning is quiet, keep `limit` small, and prefer running
 * it twice with a `dryRun` in between over one large sweep.
 *
 * ⚠️ FEED `inUse` BACK IN AS `skipIds` when batching, or every batch re-attempts the same wall.
 */
export async function pruneOrphanedWorkspaceTools(
  apiKey: string,
  opts: PruneOptions = {}
): Promise<{ scanned: OrphanScan; candidates: OrphanScan['orphans']; deleted: string[]; inUse: string[]; dryRun: boolean }> {
  const dryRun = opts.dryRun !== false;
  const scanned = await findOrphanedWorkspaceTools(apiKey);

  const skip = new Set(opts.skipIds ?? []);
  let candidates = scanned.orphans.filter((t) => !skip.has(t.id));
  if (opts.filter) candidates = candidates.filter(opts.filter);

  const deleted: string[] = [];
  const inUse: string[] = [];
  if (!dryRun) {
    for (const tool of candidates) {
      // `limit` caps DELETIONS, so stop only once that many have actually gone. A refusal costs
      // nothing and must not consume the budget — see PruneOptions.limit.
      if (opts.limit !== undefined && deleted.length >= opts.limit) break;
      const outcome = await deleteWorkspaceTool(apiKey, tool.id);
      (outcome === 'deleted' ? deleted : inUse).push(tool.id);
    }
  } else if (opts.limit !== undefined) {
    // Nothing is deleted in a dry run, so the honest preview is "the first `limit` we would try".
    candidates = candidates.slice(0, opts.limit);
  }

  return { scanned, candidates, deleted, inUse, dryRun };
}
