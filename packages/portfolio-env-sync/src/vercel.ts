import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VercelEnvRecord, VercelEnvVar, VercelTarget } from "./types.js";

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

  /**
   * Same as listEnv but preserves per-record ids and does NOT collapse.
   * Used by apply mode to PATCH a specific record's targets.
   */
  async listEnvRaw(projectIdOrName: string): Promise<VercelEnvRecord[]> {
    const url = `${VERCEL_API}/v9/projects/${encodeURIComponent(projectIdOrName)}/env?teamId=${encodeURIComponent(this.teamId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 401 || res.status === 403) {
      throw new VercelAuthError(
        `VERCEL_TOKEN rejected (${res.status}) — check token scope and expiry`
      );
    }
    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { envs?: RawVercelEnv[] };
    if (!Array.isArray(data.envs)) return [];
    return data.envs
      .filter((r): r is RawVercelEnv & { id: string } => typeof r.id === "string")
      .map((r) => ({
        id: r.id,
        key: r.key,
        target: Array.isArray(r.target) ? [...r.target] : [r.target],
        type: r.type,
      }));
  }

  /**
   * Create a new env entry on the given targets. Vercel rejects with
   * ENV_ALREADY_EXISTS if (key, any-target) already has a row — caller
   * must verify absence first via the audit.
   */
  async createEnv(opts: {
    projectIdOrName: string;
    key: string;
    value: string;
    targets: VercelTarget[];
    type?: "encrypted" | "plain" | "sensitive";
  }): Promise<void> {
    const url = `${VERCEL_API}/v10/projects/${encodeURIComponent(opts.projectIdOrName)}/env?teamId=${encodeURIComponent(this.teamId)}`;
    const body = {
      key: opts.key,
      value: opts.value,
      type: opts.type ?? "encrypted",
      target: opts.targets,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      throw new VercelAuthError(`VERCEL_TOKEN rejected (${res.status})`);
    }
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`Vercel POST env failed (${res.status}): ${text.slice(0, 300)}`);
    }
  }

  /**
   * PATCH an existing env entry's targets without changing its value.
   * Vercel preserves the encrypted value; only the target array is
   * replaced with what we send.
   */
  async updateEnvTargets(opts: {
    projectIdOrName: string;
    envId: string;
    targets: VercelTarget[];
  }): Promise<void> {
    const url = `${VERCEL_API}/v9/projects/${encodeURIComponent(opts.projectIdOrName)}/env/${encodeURIComponent(opts.envId)}?teamId=${encodeURIComponent(this.teamId)}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: opts.targets }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new VercelAuthError(`VERCEL_TOKEN rejected (${res.status})`);
    }
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`Vercel PATCH env failed (${res.status}): ${text.slice(0, 300)}`);
    }
  }
}

interface RawVercelEnv {
  id?: string;
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
