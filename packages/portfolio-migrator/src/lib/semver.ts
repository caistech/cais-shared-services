/**
 * Minimal semver helpers — just enough to compare an installed dep against
 * a floor. We deliberately don't depend on the `semver` package to keep
 * `@caistech/portfolio-migrator` zero-dep at runtime.
 *
 * Only handles the subset of semver we actually use: `MAJOR.MINOR.PATCH`,
 * optionally prefixed with `^` / `~` / `>=` (which are stripped before
 * compare). Pre-release tags are ignored — if a consumer pins to
 * `0.2.0-beta.1` we treat that as `0.2.0` for floor checks, which is the
 * permissive direction we want.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Strip any leading range qualifier (`^`, `~`, `>=`, `>`) and return the
 * dotted-numeric prefix as a parsed version. Returns `null` for anything
 * we can't make sense of so callers can fall back to "missing".
 */
export function parseVersion(input: string | undefined | null): ParsedVersion | null {
  if (!input) return null;
  const trimmed = input.trim();
  const stripped = trimmed.replace(/^([\^~]|>=|>|<=|<|=)/, '').trim();
  const match = stripped.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: trimmed,
  };
}

/**
 * Compare two parsed versions. Returns negative if a < b, 0 if equal,
 * positive if a > b. Matches Array#sort signature.
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * True if `installed` is at least `floor`. Returns false if `installed`
 * is unparseable (caller treats as "needs upgrade").
 */
export function meetsFloor(
  installed: string | undefined | null,
  floor: string
): boolean {
  const a = parseVersion(installed);
  const b = parseVersion(floor);
  if (!a || !b) return false;
  return compareVersions(a, b) >= 0;
}
