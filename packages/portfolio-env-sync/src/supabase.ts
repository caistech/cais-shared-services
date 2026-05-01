import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SUPABASE_API = "https://api.supabase.com";

/**
 * Token-rejection error from Supabase Management API. Surfaced as a
 * config error (exit 2) by the CLI, since it indicates missing /
 * misscoped credentials rather than per-project drift.
 */
export class SupabaseAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

interface SupabaseApiKey {
  name: "anon" | "service_role" | string;
  api_key: string;
}

function readTokenFile(): string | undefined {
  try {
    const path = join(homedir(), ".supabase-token");
    const contents = readFileSync(path, "utf8").trim();
    return contents.length > 0 ? contents : undefined;
  } catch {
    return undefined;
  }
}

interface CachedProject {
  url?: string;
  anon?: string;
  service?: string;
}

/**
 * Resolves manifest `from_supabase:` bindings against the Supabase
 * Management API. Caches per-project results for the run so a manifest
 * that references the same project across many keys only hits the API
 * twice (once for project info, once for keys).
 */
export class SupabaseManagementClient {
  private readonly token: string;
  private readonly cache = new Map<string, CachedProject>();

  constructor(token?: string) {
    // SUPABASE_ACCESS_TOKEN is the standard name used by the Supabase
    // CLI; SUPABASE_MANAGEMENT_TOKEN is a more explicit synonym we
    // also honour. ~/.supabase-token (chmod 600) is the persistent
    // file fallback, mirroring the ~/.vercel-token pattern.
    const t =
      token ??
      process.env.SUPABASE_ACCESS_TOKEN ??
      process.env.SUPABASE_MANAGEMENT_TOKEN ??
      readTokenFile();
    if (!t) {
      throw new SupabaseAuthError(
        "Supabase access token not found. Set SUPABASE_ACCESS_TOKEN env var or write the token to ~/.supabase-token. Generate one at https://supabase.com/dashboard/account/tokens"
      );
    }
    this.token = t;
  }

  /**
   * Resolve one binding for a project ref. Throws if the API rejects
   * the token (SupabaseAuthError) or if the project lacks the requested
   * key (Error).
   */
  async resolveBinding(
    ref: string,
    kind: "url" | "anon_key" | "service_role_key"
  ): Promise<string> {
    if (kind === "url") {
      // Supabase hosted projects expose the API at <ref>.supabase.co.
      // Self-hosted or custom-domain projects would need an explicit
      // override field on the manifest — out of scope for v0.6.
      const cached = this.cache.get(ref) ?? {};
      if (!cached.url) {
        cached.url = `https://${ref}.supabase.co`;
        this.cache.set(ref, cached);
      }
      return cached.url;
    }

    let cached = this.cache.get(ref) ?? {};
    if (!cached.anon || !cached.service) {
      const url = `${SUPABASE_API}/v1/projects/${encodeURIComponent(ref)}/api-keys`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.status === 401 || res.status === 403) {
        throw new SupabaseAuthError(
          `SUPABASE_MANAGEMENT_TOKEN rejected (${res.status}) — check token scope`
        );
      }
      if (res.status === 404) {
        throw new Error(`Supabase project '${ref}' not found`);
      }
      if (!res.ok) {
        const body = await safeText(res);
        throw new Error(`Supabase API ${res.status} for ${ref}: ${body.slice(0, 200)}`);
      }

      const keys = (await res.json()) as SupabaseApiKey[];
      for (const k of keys) {
        if (k.name === "anon") cached.anon = k.api_key;
        else if (k.name === "service_role") cached.service = k.api_key;
      }
      this.cache.set(ref, cached);
    }

    if (kind === "anon_key") {
      if (!cached.anon) {
        throw new Error(`Supabase project '${ref}' returned no anon key`);
      }
      return cached.anon;
    }
    if (kind === "service_role_key") {
      if (!cached.service) {
        throw new Error(`Supabase project '${ref}' returned no service_role key`);
      }
      return cached.service;
    }

    throw new Error(`Unknown from_supabase kind: ${kind}`);
  }

  /**
   * Read the live Supabase Auth config for a project. Returns the full
   * /v1/projects/<ref>/config/auth response — caller picks which fields
   * to compare/diff.
   */
  async getAuthConfig(ref: string): Promise<Record<string, unknown>> {
    const url = `${SUPABASE_API}/v1/projects/${encodeURIComponent(ref)}/config/auth`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 401 || res.status === 403) {
      throw new SupabaseAuthError(
        `SUPABASE_ACCESS_TOKEN rejected (${res.status}) — check token scope`
      );
    }
    if (res.status === 404) {
      throw new Error(`Supabase project '${ref}' not found`);
    }
    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(
        `Supabase auth-config GET ${res.status} for ${ref}: ${body.slice(0, 200)}`
      );
    }
    return (await res.json()) as Record<string, unknown>;
  }

  /**
   * PATCH the Supabase Auth config for a project. Only the fields in
   * `body` are changed; other Auth config fields are untouched.
   */
  async patchAuthConfig(
    ref: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = `${SUPABASE_API}/v1/projects/${encodeURIComponent(ref)}/config/auth`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      throw new SupabaseAuthError(
        `SUPABASE_ACCESS_TOKEN rejected (${res.status})`
      );
    }
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(
        `Supabase auth-config PATCH ${res.status} for ${ref}: ${text.slice(0, 300)}`
      );
    }
    return (await res.json()) as Record<string, unknown>;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
