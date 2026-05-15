/**
 * @caistech/ai-client — Anthropic SDK init config + OpenRouter routing.
 *
 * Returns the constructor args for `new Anthropic(...)` based on which keys
 * are provided. The consumer constructs the SDK themselves with their own
 * installed version — this keeps the package free of any direct SDK
 * dependency and avoids "two physical SDK installs" type-collision when
 * developing across linked workspaces.
 *
 * Usage:
 *   import Anthropic from '@anthropic-ai/sdk';
 *   import { getClaudeClientConfig, resolveClaudeModel } from '@caistech/ai-client';
 *
 *   const client = new Anthropic(getClaudeClientConfig({
 *     openrouterKey: process.env.OPENROUTER_API_KEY,
 *     anthropicKey: process.env.ANTHROPIC_API_KEY,
 *     referer: process.env.NEXT_PUBLIC_APP_URL,
 *     appTitle: 'InvestorPilot',
 *   }));
 *   const model = resolveClaudeModel({
 *     openrouterKey: process.env.OPENROUTER_API_KEY,
 *     override: process.env.AGENT_MODEL,
 *   });
 *   const reply = await client.messages.create({ model, max_tokens: 1024, messages: [...] });
 */

export interface GetClaudeClientConfigOptions {
  /** OpenRouter API key. When present, the config routes through OpenRouter. */
  openrouterKey?: string | undefined;
  /** Direct Anthropic API key. Used when openrouterKey is absent. */
  anthropicKey?: string | undefined;
  /** Referer header for OpenRouter analytics (typically the app's public URL). */
  referer?: string | undefined;
  /** App title for OpenRouter analytics dashboards. */
  appTitle?: string | undefined;
}

export interface ClaudeClientConfig {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
}

export interface ResolveClaudeModelOptions {
  /** OpenRouter key — selects between OpenRouter and direct Anthropic model IDs. */
  openrouterKey?: string | undefined;
  /** Explicit model ID. When set, returned verbatim regardless of provider. */
  override?: string | undefined;
}

/** Default model for the OpenRouter path (`anthropic/...` namespace). */
export const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.5';
/** Default model for the direct-Anthropic path. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';

/**
 * Build the constructor args for `new Anthropic(...)` based on which keys are
 * provided. Routes through OpenRouter when `openrouterKey` is set, otherwise
 * uses the direct Anthropic API.
 *
 * Throws if neither key is provided — callers must surface configuration
 * errors rather than silently degrading.
 */
export function getClaudeClientConfig(options: GetClaudeClientConfigOptions): ClaudeClientConfig {
  const { openrouterKey, anthropicKey, referer, appTitle } = options;

  if (!openrouterKey && !anthropicKey) {
    throw new Error('getClaudeClientConfig: openrouterKey or anthropicKey is required');
  }

  if (openrouterKey) {
    const headers: Record<string, string> = {};
    if (referer) headers['HTTP-Referer'] = referer;
    if (appTitle) headers['X-Title'] = appTitle;

    const config: ClaudeClientConfig = {
      apiKey: openrouterKey,
      baseURL: 'https://openrouter.ai/api',
    };
    if (Object.keys(headers).length > 0) config.defaultHeaders = headers;
    return config;
  }

  return { apiKey: anthropicKey! };
}

/**
 * Resolve the model ID to use for a Claude call, accounting for the OpenRouter
 * vs direct-Anthropic naming difference.
 *
 * Precedence:
 *   1. `override` (if set, returned verbatim — caller knows best)
 *   2. OpenRouter default when `openrouterKey` is present
 *   3. Direct-Anthropic default otherwise
 */
export function resolveClaudeModel(options: ResolveClaudeModelOptions): string {
  if (options.override) return options.override;
  return options.openrouterKey ? DEFAULT_OPENROUTER_MODEL : DEFAULT_ANTHROPIC_MODEL;
}
