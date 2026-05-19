'use client';

/**
 * <PasswordInput/> — password input with a visibility toggle.
 *
 * Closes Portfolio Standard R1 leg (c): every password field across the
 * portfolio must have a working eye / eye-off toggle with good contrast
 * (per Tony's complaint logged in LessonsLearned).
 *
 * Used internally by <AuthForm/>; also exported standalone so legacy code
 * can drop the toggle into existing forms without adopting the full
 * <AuthForm/> component.
 *
 * - Toggle is `tabIndex={-1}` so it doesn't steal tab focus from the form.
 * - `aria-label` switches between "Show password" / "Hide password".
 * - Tap target is ≥44×44 px (R2).
 * - Styling tuned for readability over both slate-950 (dark) and white
 *   (light) backgrounds; brand color comes from a CSS variable
 *   (`--cais-auth-accent`) with a sensible default.
 */

import React, { useState, useId } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Optional id — auto-generated if not supplied (label can use `htmlFor`). */
  id?: string;
  /** Optional visible label rendered above the input. */
  label?: string;
  /** Inline error text rendered below the input. */
  error?: string | null;
  /** Optional right-aligned helper (e.g. "Forgot password?" link). */
  helperRight?: React.ReactNode;
  /** Override the wrapper className. */
  wrapperClassName?: string;
  /** Theme — defaults to "dark" to match the portfolio aesthetic. */
  theme?: 'dark' | 'light';
}

export function PasswordInput({
  id: idProp,
  label,
  error,
  helperRight,
  wrapperClassName = '',
  theme = 'dark',
  className = '',
  ...inputProps
}: PasswordInputProps) {
  const autoId = useId();
  const id = idProp ?? `cais-pw-${autoId}`;
  const [show, setShow] = useState(false);
  const isDark = theme === 'dark';

  const inputBase = isDark
    ? 'bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-500 focus:border-[var(--cais-auth-accent,#22c55e)] focus:ring-[var(--cais-auth-accent,#22c55e)]/30'
    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-[var(--cais-auth-accent,#22c55e)] focus:ring-[var(--cais-auth-accent,#22c55e)]/30';

  const toggleBase = isDark
    ? 'text-slate-400 hover:text-white'
    : 'text-slate-500 hover:text-slate-900';

  return (
    <div className={wrapperClassName}>
      {(label || helperRight) && (
        <div className="flex items-baseline justify-between mb-1.5">
          {label ? (
            <label
              htmlFor={id}
              className={`block text-sm font-medium ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              {label}
            </label>
          ) : (
            <span />
          )}
          {helperRight ? (
            <div className="text-xs">{helperRight}</div>
          ) : null}
        </div>
      )}

      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className={`w-full rounded-lg border px-3 py-2.5 pr-12 text-base outline-none focus:ring-2 min-h-[44px] ${inputBase} ${className}`}
          {...inputProps}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
          className={`absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-md min-w-[44px] min-h-[44px] transition-colors ${toggleBase}`}
        >
          {show ? (
            <EyeOff className="w-5 h-5" strokeWidth={2} aria-hidden />
          ) : (
            <Eye className="w-5 h-5" strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className={`mt-1.5 text-xs ${
            isDark ? 'text-red-300' : 'text-red-600'
          }`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
