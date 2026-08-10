import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAgent, listAgents, findAgentsByName, ensureWorkspaceTools, pruneOrphanedWorkspaceTools } from '../src/agent-client';
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

// ─────────────────────────────────────────────────────────────────────────────
// ensureWorkspaceTools — the list must be COMPLETE or it must throw.
//
// The failure these pin is silent and self-accelerating: the list decides "does this tool
// already exist?", so a tool the caller cannot see is reported absent and created again.
// The real workspace reached 702 tools against a 100-per-page endpoint that was fetched once.
// ─────────────────────────────────────────────────────────────────────────────
describe('ensureWorkspaceTools pagination', () => {
  const tool = {
    type: 'webhook' as const,
    name: 'save_memory',
    description: 'd',
    webhook: { url: 'https://app.example.com/api/tools/save_memory?uid=USER_A', method: 'POST' as const },
    parameters: { type: 'object' as const, properties: {} },
  };

  /** A workspace whose matching tool sits on page 2 — invisible to a single-page fetch. */
  function pagedWorkspace(opts: { failPage?: number; failuresBeforeSuccess?: number } = {}) {
    const calls: { method: string; url: string }[] = [];
    let transientLeft = opts.failuresBeforeSuccess ?? 0;
    global.fetch = vi.fn(async (input: unknown, init?: unknown) => {
      const url = String(input);
      const method = ((init as RequestInit)?.method ?? 'GET').toUpperCase();
      calls.push({ method, url });

      if (method === 'GET') {
        const cursor = new URL(url).searchParams.get('cursor');
        const page = cursor === 'PAGE2' ? 2 : 1;
        if (opts.failPage === page) {
          if (transientLeft > 0) { transientLeft--; return { ok: false, status: 500, text: async () => 'boom' } as unknown as Response; }
          if (opts.failuresBeforeSuccess === undefined) {
            return { ok: false, status: 500, text: async () => 'boom' } as unknown as Response;
          }
        }
        if (page === 1) {
          // 100 unrelated tools, exactly filling the page. The match is NOT here.
          return okJson({
            tools: Array.from({ length: 100 }, (_, i) => ({
              id: `filler_${i}`,
              tool_config: { name: `other_${i}`, api_schema: { url: `https://app.example.com/x/${i}` } },
            })),
            has_more: true,
            next_cursor: 'PAGE2',
          }) as unknown as Response;
        }
        return okJson({
          tools: [{ id: 'tool_existing', tool_config: { name: tool.name, api_schema: { url: tool.webhook.url } } }],
          has_more: false,
        }) as unknown as Response;
      }
      if (method === 'PATCH') return okJson({ id: 'tool_existing' }) as unknown as Response;
      return okJson({ id: 'tool_CREATED' }) as unknown as Response; // POST
    }) as unknown as typeof fetch;
    return calls;
  }

  afterEach(() => vi.restoreAllMocks());

  it('follows the cursor and REUSES a tool that sits beyond page one', async () => {
    // THE REGRESSION. Revert to a single unpaginated fetch and this returns tool_CREATED —
    // a duplicate of a tool that already existed, which is the 534-orphan bug.
    const calls = pagedWorkspace();
    const ids = await ensureWorkspaceTools('key', [tool]);

    expect(ids).toEqual(['tool_existing']);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('requests an explicit page_size rather than trusting the default', async () => {
    const calls = pagedWorkspace();
    await ensureWorkspaceTools('key', [tool]);
    expect(new URL(calls[0].url).searchParams.get('page_size')).toBe('100');
  });

  it('THROWS on a failed page instead of provisioning against a truncated list', async () => {
    // Returning what it has would report every unseen tool as absent and duplicate it.
    pagedWorkspace({ failPage: 2 });
    await expect(ensureWorkspaceTools('key', [tool])).rejects.toThrow(/page 2/i);
  });

  it('THROWS rather than treating an unreachable list as an empty workspace', async () => {
    // The old behaviour was `listRes.ok ? … : []` — one blip meant "nothing exists".
    pagedWorkspace({ failPage: 1 });
    await expect(ensureWorkspaceTools('key', [tool])).rejects.toThrow(/refusing to continue/i);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1); // retried
  });

  it('retries a transient list failure once and then succeeds', async () => {
    const calls = pagedWorkspace({ failPage: 1, failuresBeforeSuccess: 1 });
    const ids = await ensureWorkspaceTools('key', [tool]);
    expect(ids).toEqual(['tool_existing']);
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(3); // fail, retry, page 2
  });

  it('still CREATES when the name matches but the url does not — per-user/per-product isolation', async () => {
    // name+url is the key precisely because ?uid= makes the url carry identity. Matching on
    // name alone would hand this owner another owner's tool.
    pagedWorkspace();
    const otherOwner = { ...tool, webhook: { ...tool.webhook, url: 'https://app.example.com/api/tools/save_memory?uid=USER_B' } };
    const ids = await ensureWorkspaceTools('key', [otherOwner]);
    expect(ids).toEqual(['tool_CREATED']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orphan prune. The dangerous direction is DELETING A LIVE TOOL, and the way that happens is
// an incomplete reference set — one product scanning its own agents in a workspace shared by
// eleven, or one unreadable agent whose tools then look free.
// ─────────────────────────────────────────────────────────────────────────────
describe('pruneOrphanedWorkspaceTools', () => {
  /** 3 tools; tool_live is referenced by an agent belonging to ANOTHER product. */
  function workspace(opts: { agentFails?: string; deleteStatus?: number; refuseIds?: string[] } = {}) {
    const deleted: string[] = [];
    global.fetch = vi.fn(async (input: unknown, init?: unknown) => {
      const url = String(input);
      const method = ((init as RequestInit)?.method ?? 'GET').toUpperCase();

      if (method === 'DELETE') {
        const id = url.split('/').pop()!;
        if (opts.deleteStatus || opts.refuseIds?.includes(id)) return { ok: false, status: opts.deleteStatus ?? 409, text: async () => 'tool_in_use' } as unknown as Response;
        deleted.push(id);
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response;
      }
      if (new URL(url).pathname.endsWith('/convai/tools')) {
        return okJson({
          tools: [
            { id: 'tool_live', tool_config: { name: 'save_memory', api_schema: { url: 'https://other-product.com/t' } } },
            { id: 'tool_orphan_a', tool_config: { name: 'save_memory', api_schema: { url: 'https://mine.com/t?uid=OLD' } } },
            { id: 'tool_orphan_b', tool_config: { name: 'recall', api_schema: { url: 'https://other-product.com/t?uid=OLD' } } },
          ],
          has_more: false,
        }) as unknown as Response;
      }
      if (new URL(url).pathname.endsWith('/convai/agents')) {
        return okJson({ agents: [{ agent_id: 'agent_other', name: 'OtherProduct' }], has_more: false }) as unknown as Response;
      }
      if (/\/agents\/[^?]+$/.test(url)) {
        const id = url.split('/').pop()!;
        if (opts.agentFails === id) return { ok: false, status: 500, text: async () => 'boom' } as unknown as Response;
        return okJson({ conversation_config: { agent: { prompt: { tool_ids: ['tool_live'] } } } }) as unknown as Response;
      }
      throw new Error(`unmatched fetch: ${method} ${url}`);
    }) as unknown as typeof fetch;
    return deleted;
  }

  afterEach(() => vi.restoreAllMocks());

  it('DEFAULTS to a dry run — finding orphans deletes nothing', async () => {
    const deleted = workspace();
    const res = await pruneOrphanedWorkspaceTools('key');
    expect(res.dryRun).toBe(true);
    expect(res.candidates.map((c) => c.id)).toEqual(['tool_orphan_a', 'tool_orphan_b']);
    expect(deleted).toEqual([]);
  });

  it('never proposes a tool an agent still references', async () => {
    workspace();
    const res = await pruneOrphanedWorkspaceTools('key', { dryRun: false });
    expect(res.candidates.map((c) => c.id)).not.toContain('tool_live');
    expect(res.deleted).not.toContain('tool_live');
  });

  it('THROWS when an agent cannot be read, rather than treating its tools as free', async () => {
    // THE DANGEROUS ONE. An unreadable agent's tools appear unreferenced, so proceeding would
    // delete live tools. Mutation: swallow the getAgent error and this deletes tool_live.
    workspace({ agentFails: 'agent_other' });
    await expect(pruneOrphanedWorkspaceTools('key', { dryRun: false })).rejects.toThrow(/agent fetch failed/i);
  });

  it('filter scopes a prune to the caller’s own tools in a shared workspace', async () => {
    const deleted = workspace();
    const res = await pruneOrphanedWorkspaceTools('key', {
      dryRun: false,
      filter: (t) => !!t.url?.includes('mine.com'),
    });
    expect(deleted).toEqual(['tool_orphan_a']);   // other-product's orphan untouched
  });

  it('limit caps DELETIONS, not attempts — a refusal must not spend the budget', async () => {
    // 0.15.1. Counting attempts meant a batch whose first entries were all refusals deleted far
    // fewer than asked, so batching converged slower than the numbers implied and the caller
    // could not tell throttling from exhaustion.
    // DISCRIMINATING: the FIRST candidate refuses. Old behaviour sliced candidates to 1, spent
    // the budget on the refusal and deleted NOTHING. New behaviour skips past it and deletes one.
    const deleted = workspace({ refuseIds: ['tool_orphan_a'] });
    const res = await pruneOrphanedWorkspaceTools('key', { dryRun: false, limit: 1 });
    expect(res.inUse).toEqual(['tool_orphan_a']);
    expect(res.deleted).toEqual(['tool_orphan_b']);
    expect(deleted).toEqual(['tool_orphan_b']);
  });

  it('skipIds omits ids a previous batch reported in_use, instead of re-attempting them', async () => {
    // Candidates come back in a stable order, so refusals sit at the front of every later batch
    // and are retried forever — the live prune re-attempted the same 65 ids in every pass.
    const deleted = workspace();
    const res = await pruneOrphanedWorkspaceTools('key', {
      dryRun: false,
      skipIds: ['tool_orphan_a'],
    });
    expect(res.candidates.map((c) => c.id)).toEqual(['tool_orphan_b']);
    expect(deleted).toEqual(['tool_orphan_b']);
  });

  it('reports in_use instead of throwing when the vendor refuses', async () => {
    workspace({ deleteStatus: 405 });
    const res = await pruneOrphanedWorkspaceTools('key', { dryRun: false });
    expect(res.inUse).toEqual(['tool_orphan_a', 'tool_orphan_b']);
    expect(res.deleted).toEqual([]);
  });
});
