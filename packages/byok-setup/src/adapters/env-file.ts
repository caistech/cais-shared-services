import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { basename } from "node:path";

export interface EnvFileResult {
  written: string[];
  kept: string[];
}

/** Parse a dotenv file into a flat map. Ignores blanks and # comments. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
}

/**
 * Refuse to write the env file unless it's gitignored — a secret-bearing file
 * that isn't ignored is one `git add` away from a leak.
 */
export function assertGitignored(envFilePath: string, gitignorePath: string): void {
  const name = basename(envFilePath);
  if (!existsSync(gitignorePath)) {
    throw new Error(`No .gitignore found; refusing to write ${name} (risk of committing secrets). Create .gitignore with ${name} first.`);
  }
  const lines = readFileSync(gitignorePath, "utf8").split("\n").map((l) => l.trim());
  const ignored = lines.some(
    (l) => l === name || l === `/${name}` || (l.endsWith("*") && name.startsWith(l.slice(0, -1)))
  );
  if (!ignored) {
    throw new Error(`${name} is not gitignored; refusing to write it (risk of committing secrets). Add it to .gitignore.`);
  }
}

/**
 * Merge values into an env file. Keep-existing by default (idempotent re-runs);
 * force overwrites. Written atomically via a temp file + rename.
 */
export function writeEnvFile(
  envFilePath: string,
  values: Record<string, string>,
  opts: { force?: boolean } = {}
): EnvFileResult {
  const existing = existsSync(envFilePath) ? parseEnvFile(readFileSync(envFilePath, "utf8")) : {};
  const merged = { ...existing };
  const written: string[] = [];
  const kept: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (existing[k] !== undefined && !opts.force) {
      kept.push(k);
      continue;
    }
    merged[k] = v;
    written.push(k);
  }
  const body = Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  const tmp = `${envFilePath}.tmp`;
  writeFileSync(tmp, body, { mode: 0o600 });
  renameSync(tmp, envFilePath);
  return { written, kept };
}
