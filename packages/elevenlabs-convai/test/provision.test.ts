import { describe, it, expect, afterEach, vi } from 'vitest';
import { provisionVoiceAgent, standardAllowlist } from '../src/provision';
import type { ConvAIAgentConfig } from '../src/types';

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

interface FetchLog {
  createAgent: number;
  getAgent: number;
  listAgents: number;
  patchAgent: { url: string; body: Record<string, unknown> }[];
  wsList: number;
  wsCreate: number;
}

function installFetch(opts: {
  nameMatches?: { agent_id: string; name: string }[];
  existingWebhookUrl?: string;
}): FetchLog {
  const log: FetchLog = { createAgent: 0, getAgent: 0, listAgents: 0, patchAgent: [], wsList: 0, wsCreate: 0 };
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as unknown as Response;

  global.fetch = vi.fn(async (urlArg: unknown, init?: unknown) => {
    const url = String(urlArg);
    const i = (init || {}) as RequestInit;
    const method = (i.method || 'GET').toUpperCase();
    const body = i.body ? JSON.parse(i.body as string) : {};

    if (method === 'POST' && url.includes('/workspace/webhooks')) { log.wsCreate++; return ok({ webhook_id: 'wh_new' }); }
    if (method === 'GET' && url.includes('/workspace/webhooks')) {
      log.wsList++;
      const webhooks = opts.existingWebhookUrl ? [{ url: opts.existingWebhookUrl, webhook_id: 'wh_existing' }] : [];
      return ok({ webhooks });
    }
    if (method === 'POST' && url.includes('/agents/create')) { log.createAgent++; return ok({ agent_id: 'agent_created' }); }
    if (method === 'GET' && /\/agents\/[^?]+$/.test(url)) { log.getAgent++; return ok({ agent_id: 'agent_existing', name: 'Concierge' }); }
    if (method === 'GET' && url.includes('/agents')) { log.listAgents++; return ok({ agents: opts.nameMatches || [], has_more: false }); }
    if (method === 'PATCH' && url.includes('/agents/')) { log.patchAgent.push({ url, body }); return ok({}); }

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
    expect(log.getAgent).toBe(1);
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

describe('provisionVoiceAgent — webhook + guards', () => {
  it('creates a workspace webhook then binds the agent via post_call_webhook_id', async () => {
    const log = installFetch({ nameMatches: [] });
    const res = await provisionVoiceAgent('key', baseOpts);
    expect(log.wsCreate).toBe(1);
    expect(res.webhookId).toBe('wh_new');
    const bind = log.patchAgent.find((p) => p.body.platform_settings && (p.body.platform_settings as Record<string, unknown>).post_call_webhook_id);
    expect(bind).toBeTruthy();
    expect((bind!.body.platform_settings as Record<string, unknown>).post_call_webhook_id).toBe('wh_new');
  });

  it('reuses an existing workspace webhook with the same URL (no duplicate create)', async () => {
    const log = installFetch({ nameMatches: [], existingWebhookUrl: 'https://app.example.com/api/convai/webhooks/post-call' });
    const res = await provisionVoiceAgent('key', baseOpts);
    expect(log.wsCreate).toBe(0);
    expect(res.webhookId).toBe('wh_existing');
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
