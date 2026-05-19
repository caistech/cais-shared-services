/**
 * <ExplanatoryHeader/> — the Portfolio Standard R3 page header.
 *
 * Every page and every standalone panel in every product MUST open with a
 * 1–3 sentence header that answers three questions in this order:
 *
 *   1. What is this?           — `what` prop (1–3 words naming the surface)
 *   2. What does the user do?  — `todo` prop
 *   3. Why does it matter?     — `matters` prop
 *
 * Position: top of the surface, above any form / table / interactive content.
 * Voice: matter-of-fact, operator-facing. Not marketing copy.
 *
 * All three slots are TypeScript-required so the surface cannot ship with one
 * silently omitted. An optional `whatLong` slot allows the short name to be
 * expanded into a single sentence where useful (e.g. dashboards where the
 * 1–3 word title needs one line of clarification).
 *
 * Server-renderable — no `'use client'` directive; no React state.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R3 for context.
 */

import React from 'react';

// --- Types --------------------------------------------------------------

export interface ExplanatoryHeaderProps {
  /**
   * Required. 1–3 words naming the surface.
   * Examples: "Open Obligations", "Project Intake", "Capability Gate".
   */
  what: string;

  /**
   * Optional. One sentence expanding the short name where useful.
   * Examples: "Items other parties owe you against a deadline."
   * Leave undefined when `what` alone is self-explanatory.
   */
  whatLong?: string;

  /**
   * Required. What the user does on this surface.
   * Examples: "Add what's outstanding and Watchdog will chase it."
   */
  todo: string;

  /**
   * Required. Why this matters to the user's broader workflow.
   * Examples: "Anything overdue here is what's currently blocking your project."
   */
  matters: string;

  /**
   * Optional. Compact variant for use inside standalone panels embedded in
   * a larger tab. Smaller spacing, denser typography. Section title alone is
   * not the header — even in compact mode all three slots must be present.
   */
  compact?: boolean;

  /**
   * Optional Tailwind classes appended to the outer wrapper.
   */
  className?: string;

  /**
   * Optional aria-label override for the wrapping landmark region. Defaults
   * to `Page header — ${what}` (or `Panel header — ${what}` when compact).
   */
  ariaLabel?: string;

  /**
   * Optional heading level for the title. Defaults to `h1` for full headers
   * and `h2` for compact headers. Override when the surface is nested inside
   * another heading hierarchy.
   */
  as?: 'h1' | 'h2' | 'h3';
}

// --- Component ----------------------------------------------------------

export function ExplanatoryHeader(props: ExplanatoryHeaderProps) {
  const {
    what,
    whatLong,
    todo,
    matters,
    compact = false,
    className = '',
    ariaLabel,
    as,
  } = props;

  const HeadingTag: 'h1' | 'h2' | 'h3' = as ?? (compact ? 'h2' : 'h1');

  const titleClass = compact
    ? 'text-base font-semibold leading-tight'
    : 'text-xl sm:text-2xl font-bold leading-tight';

  const longClass = compact
    ? 'mt-1 text-sm text-slate-600 dark:text-slate-300 leading-snug'
    : 'mt-1.5 text-base text-slate-600 dark:text-slate-300 leading-snug';

  const bodyClass = compact
    ? 'mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-snug'
    : 'mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed';

  const accentClass = compact
    ? 'mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-snug'
    : 'mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-snug';

  const wrapperClass = compact
    ? 'mb-3'
    : 'mb-5 sm:mb-6';

  const region =
    ariaLabel ?? (compact ? `Panel header — ${what}` : `Page header — ${what}`);

  return (
    <header
      role="region"
      aria-label={region}
      className={`${wrapperClass} ${className}`.trim()}
      data-cais-explanatory-header={compact ? 'compact' : 'default'}
    >
      <HeadingTag
        className={`${titleClass} text-slate-900 dark:text-white`}
      >
        {what}
      </HeadingTag>

      {whatLong ? <p className={longClass}>{whatLong}</p> : null}

      <p className={bodyClass}>{todo}</p>
      <p className={accentClass}>{matters}</p>
    </header>
  );
}
