/**
 * Kira Testing — OmniRoute gateway.
 *
 * This is the ONLY layer that understands concrete OmniRoute request/response
 * mechanics. It talks to the OmniRoute gateway (a self-hosted, OpenAI-compatible
 * multi-provider router) over its REST endpoint.
 *
 * OmniRoute exposes an OpenAI-compatible API:
 *   POST {base}/v1/chat/completions
 *   Authorization: Bearer <key>
 *   body: { model: "<combo>", messages: [...], stream: false }
 *
 * OmniRoute resolves the requested model/combo (e.g. "kira-testing") to a concrete
 * provider+model with automatic quota-aware fallback across many providers.
 * The gateway here never decides the model — it only relays the resolved combo
 * and normalises the OpenAI-compatible response.
 *
 * Responsibilities:
 *   1. Read OmniRoute base URL + credential
 *   2. Construct the OpenAI-compatible request for the resolved combo
 *   3. Send the request
 *   4. Capture response metadata (status, resolved provider model, latency)
 *   5. Normalise the result
 *   6. Classify errors (validation / gateway / model)
 */

import type { ResolvedModel } from '../resolver/testing-model';

export interface GatewayRequest {
  /** Resolved model information from the resolver. */
  resolvedModel: ResolvedModel;
  /** Messages to send to the model. */
  messages: ChatMessage[];
  /** Maximum tokens for the response. */
  maxTokens?: number;
  /** Temperature. */
  temperature?: number;
  /** Correlation/request ID for observability. */
  requestId: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayResponse {
  /** Whether the gateway call succeeded. */
  success: boolean;
  /** The model's output text. */
  output: string;
  /** HTTP status code from the gateway. */
  httpStatus?: number;
  /** Provider-specific request ID. */
  providerRequestId?: string;
  /** The concrete provider model OmniRoute resolved to (e.g. "stepfun/step-3.7-flash"). */
  resolvedProvider?: string;
  /** End-to-end latency in milliseconds. */
  latencyMs: number;
  /** Error message, if failed. */
  error?: string;
  /** Error category, if failed. */
  errorCategory?: 'gateway' | 'model' | 'normalisation';
  /** Raw usage data from the provider. */
  usage?: Record<string, unknown>;
}

export interface OmniRouteConfig {
  /** OmniRoute base URL. Defaults to env KIRA_TESTING_OMNIROUTE_BASE_URL or OMNIROUTE_BASE_URL. */
  baseUrl?: string;
  /** OmniRoute API key. Defaults to env KIRA_TESTING_OMNIROUTE_API_KEY or OMNIROUTE_API_KEY. */
  apiKey?: string;
  /** Override process.env (for tests). */
  env?: Record<string, string | undefined>;
}

const DEFAULT_BASE_URL = 'http://localhost:20128';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke OmniRoute.
 *
 * Constructs an OpenAI-compatible chat completion request for the resolved combo,
 * sends it, normalises the response, and classifies errors.
 */
export async function invokeGateway(
  request: GatewayRequest,
  config?: OmniRouteConfig
): Promise<GatewayResponse> {
  const startTime = Date.now();
  const { resolvedModel, messages, maxTokens, temperature, requestId } = request;

  const env = config?.env ?? process.env;
  const baseUrl = config?.baseUrl ?? env.KIRA_TESTING_OMNIROUTE_BASE_URL ?? env.OMNIROUTE_BASE_URL ?? DEFAULT_BASE_URL;
  const apiKey = config?.apiKey ?? env.KIRA_TESTING_OMNIROUTE_API_KEY ?? env.OMNIROUTE_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      output: '',
      latencyMs: Date.now() - startTime,
      httpStatus: 401,
      error: 'OmniRoute API key not configured (KIRA_TESTING_OMNIROUTE_API_KEY or OMNIROUTE_API_KEY)',
      errorCategory: 'gateway',
    };
  }

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  const body = {
    model: resolvedModel.modelCombo,
    messages,
    max_tokens: maxTokens ?? 2048,
    temperature: temperature ?? 0.3,
    stream: false,
    // Correlate the gateway request with the Kira-testing request for observability.
    user: `kira-testing:${requestId}`,
  };

  const controller = new AbortController();
  const timeoutMs = 120000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const error = err as Error;
    const isAbort = error.name === 'AbortError';
    return {
      success: false,
      output: '',
      latencyMs: Date.now() - startTime,
      error: isAbort ? `OmniRoute request timed out after ${timeoutMs}ms` : `OmniRoute network error: ${error.message}`,
      errorCategory: 'gateway',
    };
  }
  clearTimeout(timer);

  const latencyMs = Date.now() - startTime;
  const httpStatus = res.status;
  const providerRequestId = res.headers.get('x-request-id') ?? undefined;

  // Non-2xx: classify. OmniRoute returns OpenAI-style error bodies,
  // often wrapping an upstream provider failure inside auto-fallback.
  if (!res.ok) {
    let errorDetail = `OmniRoute HTTP ${httpStatus}`;
    try {
      const errBody = await res.text();
      if (errBody) {
        try {
          const parsed = JSON.parse(errBody);
          const msg = parsed?.error?.message ?? parsed?.message;
          if (msg) errorDetail = typeof msg === 'string' ? msg : JSON.stringify(msg);
        } catch {
          errorDetail = errorDetail + ': ' + errBody.slice(0, 300);
        }
      }
    } catch {
      // fall through with the HTTP status message
    }

    const isRateLimit = httpStatus === 429;
    const isUpstreamProvider = httpStatus === 502 || httpStatus === 503;

    return {
      success: false,
      output: '',
      latencyMs,
      httpStatus,
      providerRequestId,
      error: errorDetail,
      // Rate limits and upstream provider failures are transient gateway issues —
      // distinguish them so callers can decide whether to retry the whole request.
      errorCategory: isRateLimit || isUpstreamProvider ? 'gateway' : 'gateway',
    };
  }

  // 2xx: parse the OpenAI-compatible non-streaming response.
  try {
    const data = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(data);
    } catch {
      return {
        success: false,
        output: '',
        latencyMs,
        httpStatus,
        providerRequestId,
        error: 'OmniRoute returned a non-JSON response',
        errorCategory: 'normalisation',
      };
    }

    const content = json?.choices?.[0]?.message?.content;
    const resolvedProvider = json?.model;
    const usage = json?.usage;

    if (typeof content !== 'string') {
      return {
        success: false,
        output: '',
        latencyMs,
        httpStatus,
        providerRequestId,
        error: 'OmniRoute response contained no message content',
        errorCategory: 'normalisation',
      };
    }

    return {
      success: true,
      output: content,
      latencyMs,
      httpStatus,
      providerRequestId,
      resolvedProvider,
      usage,
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      latencyMs,
      httpStatus,
      providerRequestId,
      error: `Failed to read OmniRoute response: ${(err as Error).message}`,
      errorCategory: 'normalisation',
    };
  }
}

export { sleep };
