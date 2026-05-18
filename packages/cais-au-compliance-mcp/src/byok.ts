/**
 * BYOK — session-scoped credential handling.
 *
 * Two sources, in priority order:
 *   1. HTTP request headers (production hosted MCP — users send their key per request)
 *   2. Environment variables (local dev + stdio transport fallback)
 *
 * Critical security invariants:
 *   - BYOK secrets must NEVER be logged or persisted. Read-on-demand, use, discard.
 *   - The Anthropic key is the user's billing relationship — losing it is unacceptable.
 *   - When both sources are present, the header wins (explicit > implicit).
 */

export interface SessionCredentials {
  /** Anthropic API key for cert-extractor vision calls. */
  anthropicApiKey?: string;
  /** Optional Tianyancha (or other CN registry) provider key. */
  tianyanchaApiKey?: string;
  /** Optional ABR Web Services GUID override (otherwise server-default is used). */
  abrGuid?: string;
  /** Where the resolved credentials came from. Telemetry-only — never logs the values. */
  source: "headers" | "env" | "merged" | "none";
}

/**
 * Header names the MCP recognises. Case-insensitive (matched lowercase).
 * Underscored equivalents accepted as a convenience for clients that
 * struggle with hyphenated custom headers.
 */
const HEADER_MAP: Record<keyof Omit<SessionCredentials, "source">, readonly string[]> = {
  anthropicApiKey: ["x-anthropic-api-key", "x_anthropic_api_key"],
  tianyanchaApiKey: ["x-tianyancha-api-key", "x_tianyancha_api_key"],
  abrGuid: ["x-abr-guid", "x_abr_guid"],
};

type HeaderInput = Record<string, string | string[] | undefined>;

/**
 * Extract credentials from incoming HTTP headers. Returns undefined for
 * missing/empty fields. Header values are NOT logged or echoed.
 */
export function readCredentialsFromHeaders(headers: HeaderInput): SessionCredentials {
  const lower = lowercaseHeaderKeys(headers);
  const out: SessionCredentials = { source: "none" };
  let anyFound = false;
  for (const [key, candidates] of Object.entries(HEADER_MAP) as Array<
    [keyof typeof HEADER_MAP, readonly string[]]
  >) {
    const v = pickFirst(lower, candidates);
    if (v) {
      out[key] = v;
      anyFound = true;
    }
  }
  out.source = anyFound ? "headers" : "none";
  return out;
}

/**
 * Read credentials from environment variables. Local-dev / stdio-transport fallback.
 */
export function readCredentialsFromEnv(): SessionCredentials {
  const anthropic = nonEmpty(process.env.ANTHROPIC_API_KEY);
  const tianyancha = nonEmpty(process.env.TIANYANCHA_API_KEY);
  const abr = nonEmpty(process.env.ABR_GUID);
  const anyFound = !!anthropic || !!tianyancha || !!abr;
  return {
    anthropicApiKey: anthropic,
    tianyanchaApiKey: tianyancha,
    abrGuid: abr,
    source: anyFound ? "env" : "none",
  };
}

/**
 * Merge credential sources. Earlier sources win over later (header > env).
 * The merged credential set's `source` describes provenance for telemetry.
 */
export function mergeCredentials(...sources: SessionCredentials[]): SessionCredentials {
  const merged: SessionCredentials = { source: "none" };
  const provenance = new Set<SessionCredentials["source"]>();
  for (const src of sources) {
    if (merged.anthropicApiKey === undefined && src.anthropicApiKey) {
      merged.anthropicApiKey = src.anthropicApiKey;
      provenance.add(src.source);
    }
    if (merged.tianyanchaApiKey === undefined && src.tianyanchaApiKey) {
      merged.tianyanchaApiKey = src.tianyanchaApiKey;
      provenance.add(src.source);
    }
    if (merged.abrGuid === undefined && src.abrGuid) {
      merged.abrGuid = src.abrGuid;
      provenance.add(src.source);
    }
  }
  if (provenance.size === 0) merged.source = "none";
  else if (provenance.size === 1) merged.source = [...provenance][0];
  else merged.source = "merged";
  return merged;
}

function lowercaseHeaderKeys(headers: HeaderInput): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function pickFirst(
  headers: Record<string, string | string[] | undefined>,
  keys: readonly string[],
): string | undefined {
  for (const k of keys) {
    const raw = headers[k];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v && v.length > 0) return v;
  }
  return undefined;
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
