/**
 * Tiny ANSI colour helpers — zero deps. Used by the CLI for human-readable
 * output. Colours are auto-disabled when stdout is not a TTY OR when
 * `NO_COLOR` is set in the environment (https://no-color.org).
 *
 * We deliberately avoid `chalk` so this package stays zero-dep at runtime,
 * matching `@caistech/portfolio-env-sync`'s footprint.
 */

const enabled = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
})();

function wrap(open: number, close: number): (s: string) => string {
  if (!enabled) return (s) => s;
  return (s) => `[${open}m${s}[${close}m`;
}

export const green = wrap(32, 39);
export const red = wrap(31, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);
export const dim = wrap(2, 22);
export const bold = wrap(1, 22);
