/**
 * @caistech/openrouter-client — OpenRouter LLM wrapper with retry logic.
 * Used by any project that calls LLMs via OpenRouter.
 *
 * Usage:
 *   import { chatCompletion, chatCompletionStream } from '@caistech/openrouter-client';
 *   const reply = await chatCompletion(messages, process.env.OPENROUTER_API_KEY!);
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  /** Referer header for OpenRouter analytics. Default: caller should set. */
  referer?: string;
  /** App title for OpenRouter analytics. */
  appTitle?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Non-streaming chat completion via OpenRouter.
 * Retries on 429 (rate limit) up to MAX_RETRIES times with exponential backoff.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  apiKey: string,
  options?: ChatOptions
): Promise<string> {
  const model = options?.model || DEFAULT_MODEL;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (options?.referer) headers['HTTP-Referer'] = options.referer;
      if (options?.appTitle) headers['X-Title'] = options.appTitle;

      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          max_tokens: options?.maxTokens || 1024,
          temperature: options?.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || '';
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error('Chat completion failed');
}

/**
 * Streaming chat completion via OpenRouter.
 * Returns the raw ReadableStream for SSE consumption.
 * No retry — streaming requests should be retried at the caller level.
 */
export async function chatCompletionStream(
  messages: ChatMessage[],
  apiKey: string,
  options?: ChatOptions
): Promise<ReadableStream<Uint8Array>> {
  const model = options?.model || DEFAULT_MODEL;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (options?.referer) headers['HTTP-Referer'] = options.referer;
  if (options?.appTitle) headers['X-Title'] = options.appTitle;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter stream error (${response.status}): ${errorText}`);
  }

  if (!response.body) throw new Error('No response body');
  return response.body;
}
