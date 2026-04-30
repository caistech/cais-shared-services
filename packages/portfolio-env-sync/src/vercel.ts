import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VercelEnvVar, VercelTarget } from "./types.js";

const VERCEL_API = "https://api.vercel.com";

export interface VercelClientOptions {
  /** Bearer token. Falls back to VERCEL_TOKEN env, then ~/.vercel-token. */
  token?: string;
  teamId: string;
}

export class VercelAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VercelAuthError";
  }
}

function readTokenFile(): string | undefined {
  try {
    const path = join(homedir(), ".vercel-token");
    const contents = readFileSync(path, "utf8").trim();
    return contents.length > 0 ? contents : undefined;
  } catch {
    return undefined;
  }
}

export class VercelClient {
  private readonly token: string;
  private readonly teamId: string;

  constructor(opts: VercelClientOptions) {
    const token = opts.token ?? process.env.VERCEL_TOKEN ?? readTokenFile();
    if (!token) {
      throw new VercelAuthError(
        "Vercel token not found. Set VERCEL_TOKEN env var or write the token to ~/.vercel-token. Generate one at https://vercel.com/account/tokens"
      );
    }
    this.token = token;
    this.teamId = opts.teamId;
  }

  /**
   * List env vars for a project. Returns one record per (key, target) tuple
   * — Vercel sometimes returns the same key as multiple records for different
   * environments, sometimes as one record with multiple targets. The shape
   * we return collapses to one VercelEnvVar per unique key.
   */
  async listEnv(projectIdOrName: string): Promise<VercelEnvVar[]> {
    const url = `${VERCEL_API}/v9/projects/${encodeURIComponent(projectIdOrName)}/env?teamId=${encodeURIComponent(this.teamId)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (res.status === 401 || res.status === 403) {
      throw new VercelAuthError(
        `VERCEL_TOKEN rejected (${res.status}) — check token scope and expiry`
      );
    }
    if (res.status === 404) {
      throw new Error(`Vercel project '${projectIdOrName}' not found in team ${this.teamId}`);
    }
    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { envs?: RawVercelEnv[] };
    if (!Array.isArray(data.envs)) return [];

    return collapseByKey(data.envs);
  }
}

interface RawVercelEnv {
  key: string;
  target: VercelTarget[] | VercelTarget;
  type: VercelEnvVar["type"];
}

/**
 * Vercel returns env vars one row per record, but for vars that span multiple
 * environments the API may return them as either:
 *   { key: "X", target: ["preview", "production"] }            // collapsed
 *   { key: "X", target: ["preview"] }, { key: "X", target: ["production"] }  // split
 *
 * We normalise to one record per key with all targets unioned.
 */
function collapseByKey(rows: RawVercelEnv[]): VercelEnvVar[] {
  const byKey = new Map<string, VercelEnvVar>();
  for (const row of rows) {
    const targets = Array.isArray(row.target) ? row.target : [row.target];
    const existing = byKey.get(row.key);
    if (existing) {
      for (const t of targets) {
        if (!existing.target.includes(t)) existing.target.push(t);
      }
    } else {
      byKey.set(row.key, { key: row.key, target: [...targets], type: row.type });
    }
  }
  return Array.from(byKey.values());
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
