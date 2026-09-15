import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeGateway } from './omniroute';

const resolvedModel = {
  logicalService: 'kira-testing' as const,
  modelCombo: 'kira-testing',
  method: 'env:KIRA_TESTING_MODEL_COMBO',
};

const baseRequest = {
  resolvedModel,
  messages: [
    { role: 'system' as const, content: 'You are a tester.' },
    { role: 'user' as const, content: 'Test this.' },
  ],
  requestId: 'req-1',
};

const env = {
  KIRA_TESTING_OMNIROUTE_BASE_URL: 'http://omniroute.test',
  KIRA_TESTING_OMNIROUTE_API_KEY: 'test-key',
};

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('invokeGateway (OmniRoute)', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('constructs an OpenAI-compatible request for the resolved combo and normalises success', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-1',
        model: 'stepfun/step-3.7-flash',
        choices: [{ message: { role: 'assistant', content: 'pass: all good' } }],
        usage: { total_tokens: 5 },
      })
    );

    const result = await invokeGateway(baseRequest, { env });

    expect(result.success).toBe(true);
    expect(result.output).toBe('pass: all good');
    expect(result.resolvedProvider).toBe('stepfun/step-3.7-flash');
    expect(result.usage?.total_tokens).toBe(5);

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('http://omniroute.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('kira-testing');
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
  });

  it('falls back to OMNIROUTE_API_KEY and OMNIROUTE_BASE_URL when dedicated vars are absent', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      })
    );

    const result = await invokeGateway(baseRequest, {
      env: { OMNIROUTE_BASE_URL: 'http://shared.test', OMNIROUTE_API_KEY: 'shared-key' },
    });

    expect(result.success).toBe(true);
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('http://shared.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer shared-key');
  });

  it('returns a gateway error when no API key is configured', async () => {
    const result = await invokeGateway(baseRequest, { env: {} });
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe('gateway');
    expect(result.error).toMatch(/API key/);
    expect(globalThis.fetch as any).not.toHaveBeenCalled();
  });

  it('classifies HTTP 429 (rate limit) as a gateway error', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse(429, { error: { message: 'All credentials for model are cooling down' } })
    );
    const result = await invokeGateway(baseRequest, { env });
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe('gateway');
    expect(result.httpStatus).toBe(429);
    expect(result.error).toMatch(/cooling down/);
  });

  it('classifies HTTP 502 (upstream provider) as a gateway error', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse(502, { error: { message: '[zai-web/glm-5.2] Provider returned empty content' } })
    );
    const result = await invokeGateway(baseRequest, { env });
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe('gateway');
    expect(result.httpStatus).toBe(502);
    expect(result.error).toMatch(/Provider returned empty content/);
  });

  it('classifies a malformed (non-JSON) success body as normalisation', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    );
    const result = await invokeGateway(baseRequest, { env });
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe('normalisation');
  });

  it('classifies a JSON body with no message content as normalisation', async () => {
    (globalThis.fetch as any).mockResolvedValue(jsonResponse(200, { choices: [] }));
    const result = await invokeGateway(baseRequest, { env });
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe('normalisation');
  });

  it('captures a network error as a gateway error', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await invokeGateway(baseRequest, { env });
    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe('gateway');
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it('captures the raw HTTP status and normalises on a 4xx client error', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse(400, { error: { message: 'invalid request' } })
    );
    const result = await invokeGateway(baseRequest, { env });
    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(400);
    expect(result.errorCategory).toBe('gateway');
    expect(result.error).toMatch(/invalid request/);
  });
});
