/**
 * Filesystem helpers — read / walk / write with the same ignore conventions
 * the rest of the @caistech/* enforcement tooling uses (`node_modules`,
 * `dist`, `.next`, etc.).
 *
 * Every helper here is a thin wrapper over `node:fs/promises` plus a couple
 * of opinions about what counts as repo content. No third-party deps.
 */

import {
  mkdir as fsMkdir,
  readdir,
  readFile as fsReadFile,
  stat,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'out',
  '_archive',
  '_vite-legacy',
  '.git',
  '.vercel',
  'coverage',
  '.gate-snapshots',
]);

export interface WalkOptions {
  /** Additional directory names to skip on top of the defaults. */
  extraIgnore?: Set<string>;
  /** File extensions to keep (e.g. `['.ts', '.tsx']`). If absent — keep all. */
  extensions?: string[];
}

/**
 * Recursively walk a directory and return absolute paths of every matching
 * file. Returns an empty array if the root doesn't exist.
 */
export async function walkFiles(
  root: string,
  options: WalkOptions = {}
): Promise<string[]> {
  const ignore = new Set([
    ...DEFAULT_IGNORE_DIRS,
    ...(options.extraIgnore ?? []),
  ]);
  const allowedExts = options.extensions;
  const out: string[] = [];
  await walk(root, ignore, allowedExts, out);
  return out;
}

async function walk(
  current: string,
  ignore: Set<string>,
  allowedExts: string[] | undefined,
  acc: string[]
): Promise<void> {
  let entries: Array<{
    name: string;
    isDirectory: () => boolean;
    isFile: () => boolean;
  }>;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) continue;
      await walk(full, ignore, allowedExts, acc);
    } else if (entry.isFile()) {
      if (
        allowedExts &&
        !allowedExts.some((ext) => entry.name.endsWith(ext))
      ) {
        continue;
      }
      acc.push(full);
    }
  }
}

/**
 * Read a file as UTF-8, returning `null` if absent / unreadable rather than
 * throwing. Mirrors `readFileOptional` from portfolio-gate so the audit
 * helpers feel familiar.
 */
export async function readFileOptional(path: string): Promise<string | null> {
  try {
    return await fsReadFile(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Read a file as UTF-8 or throw a friendly error.
 */
export async function readFileStrict(path: string): Promise<string> {
  return fsReadFile(path, 'utf8');
}

/**
 * Test whether a path exists (file OR directory). Returns false on any
 * error — including permission errors — because the migrator treats
 * "can't see" as "not there" for planning purposes.
 */
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert an absolute path into a repo-relative one with forward slashes
 * regardless of platform. Suitable for embedding in markdown / JSON.
 */
export function toRepoRelative(repoRoot: string, absolute: string): string {
  return relative(repoRoot, absolute).split(sep).join('/');
}

/**
 * Write a file, creating parent directories as needed. Mirrors
 * `fs.writeFile({ recursive: true })` — but Node's writeFile doesn't
 * support recursive, so we mkdir first.
 */
export async function writeFile(
  absolutePath: string,
  content: string
): Promise<void> {
  await fsMkdir(dirname(absolutePath), { recursive: true });
  await fsWriteFile(absolutePath, content, 'utf8');
}

/**
 * Resolve a candidate path against the repo root, returning the absolute
 * path. Used everywhere `inspect` reads a target file.
 */
export function resolveRepoPath(repoRoot: string, relPath: string): string {
  return resolve(repoRoot, relPath);
}
