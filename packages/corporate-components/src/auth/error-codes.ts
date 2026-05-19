/**
 * Whitelisted auth error codes.
 *
 * SECURITY: closes the phishing-by-URL vector and prevents leaking arbitrary
 * Supabase / provider error.message strings into the UI. Callers MUST map any
 * error returned from `signInWithPassword`, `signInWithOtp`, etc. into one of
 * these codes via `mapSupabaseAuthError()`. Anything else (or no code) falls
 * back to `generic`. Verbose provider/exception detail should be logged
 * server-side — never echoed to the user.
 *
 * Mirrors the NDISSDA pattern (`pf-platform/apps/web/lib/auth/error-codes.ts`)
 * and is the canonical R10 (no verbatim driver errors) client-side helper.
 */

export const AUTH_ERROR_CODES = [
  'invalid_credentials',
  'email_not_confirmed',
  'magic_link_sent',
  'reset_link_sent',
  'password_updated',
  'password_mismatch',
  'password_too_short',
  'rate_limited',
  'provider_error',
  'network_error',
  'generic',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const COPY: Record<AuthErrorCode, string> = {
  invalid_credentials:
    "That email and password don't match. Try again, or use the magic-link or reset-password options below.",
  email_not_confirmed:
    "We need to verify your email first. Check your inbox for the confirmation link we sent.",
  magic_link_sent:
    "Check your inbox — we've sent a magic link. Click it to sign in.",
  reset_link_sent:
    "Check your inbox — we've sent a password-reset link. Click it to set a new password.",
  password_updated:
    "Your password has been updated. You can now sign in with your new password.",
  password_mismatch: "The two passwords don't match. Please re-enter them.",
  password_too_short:
    'Your password is too short. Use at least 8 characters.',
  rate_limited:
    "We've sent too many emails to this address recently. Wait a few minutes, then try again.",
  provider_error:
    "We couldn't reach the auth provider. Try again in a moment.",
  network_error:
    "We couldn't reach the network. Check your connection and try again.",
  generic:
    'Something went wrong. Please try again, or contact support if this keeps happening.',
};

/** Resolve a code to its user-facing copy. Always returns a string. */
export function resolveAuthErrorMessage(
  code: AuthErrorCode | null | undefined
): string {
  if (!code) return COPY.generic;
  return isAuthErrorCode(code) ? COPY[code] : COPY.generic;
}

/** Resolve a raw URL `?error=` (or similar) value to a canonical code. */
export function resolveAuthErrorCode(
  raw: string | null | undefined
): AuthErrorCode {
  if (!raw) return 'generic';
  return isAuthErrorCode(raw) ? raw : 'generic';
}

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Map a Supabase auth error (or any thrown error) to one of the whitelisted
 * codes. Never returns raw `error.message`. Inspects the message for known
 * keywords (Supabase doesn't expose stable error codes for many cases) and
 * falls back to `generic`.
 *
 * If you have a stable status code from the response, prefer that — but this
 * helper is safe to use directly on any `unknown` error.
 */
export function mapSupabaseAuthError(err: unknown): AuthErrorCode {
  if (!err) return 'generic';

  const message = extractMessage(err).toLowerCase();
  if (!message) return 'generic';

  // Network / fetch failures
  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('failed to load')
  ) {
    return 'network_error';
  }

  // Rate limit (Supabase: "email rate limit exceeded", "over_email_send_rate_limit")
  if (
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many')
  ) {
    return 'rate_limited';
  }

  // Bad creds (Supabase: "Invalid login credentials", "invalid_grant")
  if (
    message.includes('invalid login') ||
    message.includes('invalid_grant') ||
    message.includes('invalid credentials') ||
    message.includes('invalid_credentials')
  ) {
    return 'invalid_credentials';
  }

  // Email not confirmed
  if (
    message.includes('email not confirmed') ||
    message.includes('email_not_confirmed') ||
    message.includes('not confirmed')
  ) {
    return 'email_not_confirmed';
  }

  // Anything else — treat as a generic provider error
  return 'provider_error';
}

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return '';
}
