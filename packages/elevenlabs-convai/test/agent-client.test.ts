import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAgent, listAgents, findAgentsByName } from '../src/agent-client';
import type { ConvAIAgentConfig } from '../src/types';

const baseConfig: ConvAIAgentConfig = {
  agentName: 'Test Agent',
  voiceId: 'voice_123',
  llmModel: 'gpt-4o-mini',
  temperature: 0.5,
};

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('createAgent', () => {
  let captured: { url: string; init: RequestInit | undefined }[] = [];

  beforeEach(() => {
    captured = [];
    global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      captured.push({ url: String(url), init: init as RequestInit });
      return okJson({ agent_id: 'agent_new' }) as unknown as Response;
    }) as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it('REGRESSION: does not emit platform_settings.webhook (the legacy leak shape)', async () => {
    await createAgent('key', {
      config: { ...baseConfig, webhookUrl: 'https://app.example.com/api/convai/webhook' },
      systemPrompt: 'hello',
      firstMessage: 'hi',
    });
    const body = JSON.parse((captured[0].init!.body as string));
    // webhook block must be absent — post-call binding is workspace-scoped now.
    expect(body.platform_settings?.webhook).toBeUndefined();
  });

  it('emits platform_settings.overrides only when enableOverrides is set', async () => {
    await createAgent('key', { config: baseConfig, systemPrompt: 'p', firstMessage: 'm' });
    let body = JSON.parse((captured[0].init!.body as string));
    expect(body.platform_settings?.overrides).toBeUndefined();

    captured = [];
    await createAgent('key', { config: baseConfig, systemPrompt: 'p', firstMessage: 'm', enableOverrides: true });
    body = JSON.parse((captured[0].init!.body as string));
    expect(body.platform_settings.overrides.conversation_config_override.agent.first_message).toBe(true);
  });

  it('returns the created agent id', async () => {
    const res = await createAgent('key', { config: baseConfig, systemPrompt: 'p', firstMessage: 'm' });
    expect(res.agentId).toBe('agent_new');
    expect(res.agentName).toBe('Test Agent');
  });

  it('throws on a non-ok response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 422, text: async () => 'bad' }) as unknown as Response) as unknown as typeof fetch;
    await expect(createAgent('key', { config: baseConfig, systemPrompt: 'p', firstMessage: 'm' })).rejects.toThrow(/422/);
  });
});

describe('listAgents / findAgentsByName', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows cursor pagination to completion', async () => {
    const pages = [
      { agents: [{ agent_id: 'a1', name: 'One' }], has_more: true, next_cursor: 'c2' },
      { agents: [{ agent_id: 'a2', name: 'Two' }], has_more: false, next_cursor: null },
    ];
    let call = 0;
    global.fetch = vi.fn(async () => okJson(pages[call++]) as unknown as Response) as unknown as typeof fetch;

    const agents = await listAgents('key');
    expect(agents.map((a) => a.agentId)).toEqual(['a1', 'a2']);
    expect(call).toBe(2);
  });

  it('findAgentsByName returns only exact name matches', async () => {
    global.fetch = vi.fn(async () => okJson({
      agents: [
        { agent_id: 'a1', name: 'Dup' },
        { agent_id: 'a2', name: 'Dup' },
        { agent_id: 'a3', name: 'Other' },
      ],
      has_more: false,
    }) as unknown as Response) as unknown as typeof fetch;

    const matches = await findAgentsByName('key', 'Dup');
    expect(matches.map((m) => m.agentId)).toEqual(['a1', 'a2']);
  });
});
