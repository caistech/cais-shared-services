/**
 * BYOK — session-scoped credential handling.
 *
 * Phase 1 ships with env-var fallbacks; future versions will accept
 * per-session credentials passed via MCP request metadata.
 *
 * Critical security invariant: BYOK secrets must NEVER be logged or
 * persisted. Read-on-demand, use, discard. The Anthropic key in particular
 * is the user's billing relationship — losing it is unacceptable.
 */

export interface SessionCredentials {
  /** Anthropic API key for cert-extractor vision calls. */
  anthropicApiKey?: string;
  /** Optional Tianyancha (or other CN registry) provider key. */
  tianyanchaApiKey?: string;
}

/**
 * Read credentials from environment variables. In a hosted MCP, these
 * variables MUST be unset on the server — the user supplies them via
 * MCP session config instead. Env-var fallback only exists for local dev.
 */
export function readCredentialsFromEnv(): SessionCredentials {
  return {
    anthropicApiKey: nonEmpty(process.env.ANTHROPIC_API_KEY),
    tianyanchaApiKey: nonEmpty(process.env.TIANYANCHA_API_KEY),
  };
}

function nonEmpty(v: string | undefined): string | undefined {
  return v && v.length > 0 ? v : undefined;
}

export class MissingCredentialError extends Error {
  readonly credentialName: string;
  readonly nextStepHint: string;
  constructor(credentialName: string, nextStepHint: string) {
    super(
      `Missing credential '${credentialName}'. ${nextStepHint}`,
    );
    this.name = "MissingCredentialError";
    this.credentialName = credentialName;
    this.nextStepHint = nextStepHint;
  }
}
