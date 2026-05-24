import { describe, it, expect, afterEach, vi } from 'vitest';
import { provisionVoiceAgent, standardAllowlist } from '../src/provision';
import type { ConvAIAgentConfig, ConvAITool } from '../src/types';

const config: ConvAIAgentConfig = {
  agentName: 'Concierge',
  voiceId: 'voice_real',
  llmModel: 'gpt-4o-mini',
  temperature: 0.6,
};

const baseOpts = {
  config,
  systemPrompt: 'You are helpful.',
  firstMessage: 'Hi.',
  baseUrl: 'https://app.example.com',
  allowedOrigins: standardAllowlist('app.example.com'),
};

const tool: ConvAITool = {
  type: 'webhook',
  name: 'recall_memory',
  description: 'Recall a memory.',
  parameters: { type: 'object', properties: {}, required: [] },
  webhook: { url: 'https://app.example.com/api/convai/webhooks/recall_memory', method: 'POST' },
};

interface FetchLog {
  createAgent: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createAgentBody?: any;
  getAgent: number;
  listAgents: number;
  patchAgent: { url: string; body: Record<string, unknown> }[];
  wsList: number;
  wsCreate: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wsCreateBody?: any;
  toolList: number;
  toolCreate: number;
  createdToolIds: string[];
  agentToolIds?: string[];   // tool_ids actually set on the agent (created OR reused)
  boundWebhookId?: string;
}

function installFetch(opts: {
  nameMatches?: { agent_id: string; name: string }[];
  existingWebhookUrl?: string;
  existingTools?: { id: string; name: string; url: string }[];
  verifyToolIds?: string[];   // override what the self-verify GET reports (simulate a strip)
}): FetchLog {
  const log: FetchLog = {
    createAgent: 0, getAgent: 0, listAgents: 0, patchAgent: [],
    wsList: 0, wsCreate: 0, toolList: 0, toolCreate: 0, createdToolIds: [],
  };
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as unknown as Response;

  global.fetch = vi.fn(async (urlArg: unknown, init?: unknown) => {
    const url = String(urlArg);
    const i = (init || {}) as RequestInit;
    const method = (i.method || 'GET').toUpperCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = i.body ? JSON.parse(i.body as string) : {};

    // workspace webhooks
    if (method === 'POST' && url.includes('/workspace/webhooks')) { log.wsCreate++; log.wsCreateBody = body; return ok({ webhook_id: 'wh_new', webhook_secret: 'sek_123' }); }
    if (method === 'GET' && url.includes('/workspace/webhooks')) {
      log.wsList++;
      const webhooks = opts.existingWebhookUrl ? [{ webhook_url: opts.existingWebhookUrl, webhook_id: 'wh_existing' }] : [];
      return ok({ webhooks });
    }

    // workspace tools (post-April-2026 shape: entities referenced by prompt.tool_ids)
    if (method === 'POST' && url.endsWith('/convai/tools')) { log.toolCreate++; const id = `tool_${log.toolCreate}`; log.createdToolIds.push(id); return ok({ id }); }
    if (method === 'GET' && url.endsWith('/convai/tools')) {
      log.toolList++;
      const tools = (opts.existingTools || []).map((t) => ({ id: t.id, tool_config: { name: t.name, api_schema: { url: t.url } } }));
      return ok({ tools });
    }

    // agents
    if (method === 'POST' && url.includes('/agents/create')) {
      log.createAgent++;
      log.createAgentBody = body;
      log.agentToolIds = body?.conversation_config?.agent?.prompt?.tool_ids ?? log.agentToolIds ?? [];
      return ok({ agent_id: 'agent_created' });
    }
    if (method === 'GET' && /\/agents\/[^?]+$/.test(url)) {
      log.getAgent++;
      const tool_ids = opts.verifyToolIds ?? log.agentToolIds ?? [];
      return ok({
        agent_id: 'agent_existing',
        name: 'Concierge',
        conversation_config: { agent: { prompt: { prompt: 'sys', llm: 'gpt-4o-mini', temperature: 0.6, tool_ids } } },
        platform_settings: {
          overrides: { conversation_config_override: { agent: {} } },
          workspace_overrides: { webhooks: { post_call_webhook_id: log.boundWebhookId } },
        },
      });
    }
    if (method === 'GET' && url.includes('/agents')) { log.listAgents++; return ok({ agents: opts.nameMatches || [], has_more: false }); }
    if (method === 'PATCH' && url.includes('/agents/')) {
      log.patchAgent.push({ url, body });
      const promptToolIds = body?.conversation_config?.agent?.prompt?.tool_ids;
      if (promptToolIds) log.agentToolIds = promptToolIds;
      const bound = body?.platform_settings?.workspace_overrides?.webhooks?.post_call_webhook_id;
      if (bound) log.boundWebhookId = bound;
      return ok({});
    }

    throw new Error(`unmatched fetch: ${method} ${url}`);
  }) as unknown as typeof fetch;

  return log;
}

afterEach(() => vi.restoreAllMocks());

describe('provisionVoiceAgent — idempotency', () => {
  it('creates a new agent when none exists by name', async () => {
    const log = installFetch({ nameMatches: [] });
    const res = await provisionVoiceAgent('key', baseOpts);
    expect(res.created).toBe(true);
    expect(res.agentId).toBe('agent_created');
    expect(log.createAgent).toBe(1);
  });

  it('updates in place when existingAgentId is supplied (no create)', async () => {
    const log = installFetch({});
    const res = await provisionVoiceAgent('key', { ...baseOpts, existingAgentId: 'agent_existing' });
    expect(res.created).toBe(false);
    expect(res.agentId).toBe('agent_existing');
    // 2 GETs: the idempotency existence check + the final self-verify read.
    expect(log.getAgent).toBe(2);
    expect(log.createAgent).toBe(0);
  });

  it('adopts the single existing agent found by name (no create)', async () => {
    const log = installFetch({ nameMatches: [{ agent_id: 'agent_adopt', name: 'Concierge' }] });
    const res = await provisionVoiceAgent('key', baseOpts);
    expect(res.created).toBe(false);
    expect(res.agentId).toBe('agent_adopt');
    expect(log.createAgent).toBe(0);
  });

  it('ABORTS when 2+ agents share the name (never guesses)', async () => {
    installFetch({ nameMatches: [
      { agent_id: 'dup1', name: 'Concierge' },
      { agent_id: 'dup2', name: 'Concierge' },
    ] });
    await expect(provisionVoiceAgent('key', baseOpts)).rejects.toThrow(/2 agents named/);
  });
});

describe('provisionVoiceAgent — tools (workspace entities + tool_ids)', () => {
  it('creates each tool as a workspace entity and references it on prompt.tool_ids (never inline)', async () => {
    const log = installFetch({ nameMatches: [] });
    await provisionVoiceAgent('key', { ...baseOpts, tools: [tool] });
    expect(log.toolCreate).toBe(1);
    const prompt = log.createAgentBody.conversation_config.agent.prompt;
    expect(prompt.tool_ids).toEqual(['tool_1']);
    // the deprecated inline shape must NOT be sent (ElevenLabs silently strips it)
    expect(log.createAgentBody.conversation_config.agent.tools).toBeUndefined();
  });

  it('reuses an existing workspace tool matching BOTH name AND url (no duplicate create)', async () => {
    const log = installFetch({
      nameMatches: [],
      existingTools: [{ id: 'tool_existing', name: 'recall_memory', url: 'https://app.example.com/api/convai/webhooks/recall_memory' }],
    });
    await provisionVoiceAgent('key', { ...baseOpts, tools: [tool] });
    expect(log.toolCreate).toBe(0);
    expect(log.createAgentBody.conversation_config.agent.prompt.tool_ids).toEqual(['tool_existing']);
  });

  it('does NOT reuse a same-named tool with a different url (product isolation)', async () => {
    const log = installFetch({
      nameMatches: [],
      existingTools: [{ id: 'tool_otherproduct', name: 'recall_memory', url: 'https://other.example.com/api/convai/webhooks/recall_memory' }],
    });
    await provisionVoiceAgent('key', { ...baseOpts, tools: [tool] });
    expect(log.toolCreate).toBe(1);   // created its own; did not grab the other product's tool
    expect(log.createAgentBody.conversation_config.agent.prompt.tool_ids).toEqual(['tool_1']);
  });
});

describe('provisionVoiceAgent — self-verify (presence != working)', () => {
  it('THROWS when the live agent comes back with fewer tool_ids than expected (silent strip)', async () => {
    installFetch({ nameMatches: [], verifyToolIds: [] }); // agent reports zero tools despite one being passed
    await expect(provisionVoiceAgent('key', { ...baseOpts, tools: [tool] })).rejects.toThrow(/verification FAILED|tool_ids/);
  });
});

describe('provisionVoiceAgent — webhook + guards', () => {
  it('creates a workspace webhook, binds via workspace_overrides.webhooks.post_call_webhook_id, and returns the secret', async () => {
    const log = installFetch({ nameMatches: [] });
    const res = await provisionVoiceAgent('key', baseOpts);
    expect(log.wsCreate).toBe(1);
    expect(res.webhookId).toBe('wh_new');
    expect(res.webhookSecret).toBe('sek_123');   // secret captured on create + returned (no longer discarded)
    expect(log.wsCreateBody.settings).toMatchObject({
      auth_type: 'hmac',
      webhook_url: 'https://app.example.com/api/convai/webhooks/post-call',
    });
    const bind = log.patchAgent.find((p) => {
      const ps = p.body.platform_settings as Record<string, unknown> | undefined;
      const wo = ps?.workspace_overrides as Record<string, unknown> | undefined;
      const wh = wo?.webhooks as Record<string, unknown> | undefined;
      return wh?.post_call_webhook_id;
    });
    expect(bind).toBeTruthy();
  });

  it('reuses an existing workspace webhook with the same URL (no duplicate create); secret undefined on reuse', async () => {
    const log = installFetch({ nameMatches: [], existingWebhookUrl: 'https://app.example.com/api/convai/webhooks/post-call' });
    const res = await provisionVoiceAgent('key', baseOpts);
    expect(log.wsCreate).toBe(0);
    expect(res.webhookId).toBe('wh_existing');
    expect(res.webhookSecret).toBeUndefined();
  });

  it('writes the Security allowlist', async () => {
    const log = installFetch({ nameMatches: [] });
    await provisionVoiceAgent('key', baseOpts);
    const allow = log.patchAgent.find((p) => {
      const ps = p.body.platform_settings as Record<string, unknown> | undefined;
      return ps && (ps.auth as Record<string, unknown> | undefined)?.allowlist;
    });
    expect(allow).toBeTruthy();
  });

  it('throws on the placeholder voiceId', async () => {
    installFetch({ nameMatches: [] });
    await expect(provisionVoiceAgent('key', {
      ...baseOpts,
      config: { ...config, voiceId: 'REPLACE_WITH_CANONICAL_ELEVENLABS_VOICE_ID' },
    })).rejects.toThrow(/placeholder/);
  });

  it('throws when baseUrl is missing', async () => {
    installFetch({ nameMatches: [] });
    await expect(provisionVoiceAgent('key', { ...baseOpts, baseUrl: '' })).rejects.toThrow(/baseUrl/);
  });
});
