/**
 * Unified-diff generation — zero-dep implementation of the small slice of
 * `diff` we need for `portfolio-migrator plan`. The generated diff is
 * intentionally human-readable, not strictly conforming to every quirk of
 * the `diff -u` format; it's there for Dennis to skim, not for `patch -p1`.
 *
 * Two helpers:
 *   - `fileDiff(path, before, after)` — full-file diff with `---` / `+++`
 *     headers, suitable for embedding in a `.patch` file or fenced code
 *     block in markdown.
 *   - `addedFileDiff(path, after)` — synthesises a "new file" diff against
 *     `/dev/null`, used for scaffolds.
 */

const NULL_PATH = '/dev/null';

/**
 * Build a header pair (`---` / `+++`) for the diff. Uses `a/<path>` /
 * `b/<path>` so the output sits cleanly in a unified-diff renderer.
 */
function headers(beforePath: string, afterPath: string): string {
  return `--- ${beforePath}\n+++ ${afterPath}\n`;
}

/**
 * Generate a unified diff between `before` and `after`. The algorithm is
 * the trivial one: walk both line arrays, emit `-` / `+` runs around
 * matching context lines. Good enough for our use — files are small,
 * humans read the output.
 */
export function fileDiff(
  path: string,
  before: string,
  after: string
): string {
  if (before === after) return '';
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Plain Myers-light: drop common prefix + suffix, then dump the
  // remainder as one big change block. Not optimal but very readable.
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] ===
      afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const oldChanged = beforeLines.slice(prefix, beforeLines.length - suffix);
  const newChanged = afterLines.slice(prefix, afterLines.length - suffix);
  const oldStart = prefix + 1;
  const newStart = prefix + 1;

  const hunkHeader = `@@ -${oldStart},${oldChanged.length} +${newStart},${newChanged.length} @@\n`;
  const body = [
    ...oldChanged.map((l) => `-${l}`),
    ...newChanged.map((l) => `+${l}`),
  ].join('\n');

  return `${headers(`a/${path}`, `b/${path}`)}${hunkHeader}${body}\n`;
}

/**
 * Generate a diff that represents a brand-new file (suitable for the
 * scaffolds the migrator drops in). Header uses `/dev/null` for the
 * pre-image, which is what `git diff` does for an added file.
 */
export function addedFileDiff(path: string, after: string): string {
  const lines = after.split('\n');
  const hunkHeader = `@@ -0,0 +1,${lines.length} @@\n`;
  const body = lines.map((l) => `+${l}`).join('\n');
  return `${headers(NULL_PATH, `b/${path}`)}${hunkHeader}${body}\n`;
}
