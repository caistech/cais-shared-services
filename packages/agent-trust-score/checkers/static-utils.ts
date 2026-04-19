/**
 * Static Analysis Utilities
 *
 * File system helpers for scanning codebases.
 * Uses glob and string matching (AST parsing where feasible,
 * string matching as fallback per spec).
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/** Recursively find files matching a pattern */
export function findFiles(
  root: string,
  extensions: string[],
  exclude: string[] = ["node_modules", ".next", ".git", "dist", "build"]
): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (exclude.includes(entry)) continue;
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (extensions.some((ext) => entry.endsWith(ext))) {
            results.push(fullPath);
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  walk(root);
  return results;
}

/** Read a file, return null if it doesn't exist */
export function readFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/** Check if a file exists */
export function fileExists(path: string): boolean {
  return existsSync(path);
}

/** Search files for a pattern, return matches with locations */
export function grepFiles(
  files: string[],
  pattern: RegExp,
  root: string
): Array<{ file: string; line: number; snippet: string }> {
  const matches: Array<{ file: string; line: number; snippet: string }> = [];

  for (const file of files) {
    const content = readFile(file);
    if (!content) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        matches.push({
          file: relative(root, file),
          line: i + 1,
          snippet: lines[i].trim().slice(0, 120),
        });
      }
    }
  }

  return matches;
}

/** Check if any file in the project contains a pattern */
export function hasPattern(
  root: string,
  pattern: RegExp,
  extensions = [".ts", ".tsx", ".js", ".jsx"]
): boolean {
  const files = findFiles(root, extensions);
  return grepFiles(files, pattern, root).length > 0;
}

/** Count occurrences of a pattern across all files */
export function countPattern(
  root: string,
  pattern: RegExp,
  extensions = [".ts", ".tsx", ".js", ".jsx"]
): number {
  const files = findFiles(root, extensions);
  return grepFiles(files, pattern, root).length;
}
