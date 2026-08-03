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
  'consent_required',
  'rate_limited',
  'invalid_email',
  'email_exists',
  'weak_password',
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
  consent_required:
    'Please tick the box to accept the terms before creating your account.',
  rate_limited:
    "We've sent too many emails to this address recently. Wait a few minutes, then try again.",
  invalid_email:
    "That email address doesn't look right. Check it for typos — a missing @ or something like 'gmial.con' — and try again.",
  email_exists:
    "There's already an account with that email. Try signing in, or use the reset-password option below.",
  weak_password:
    'That password is too easy to guess. Use a longer one, or add a number or symbol.',
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

  // Address the provider rejected (Supabase: "Unable to validate email address: invalid format",
  // "email_address_invalid"). This was the defect: it fell to `provider_error` below and told
  // someone who had typed "@gmial.con" that we could not reach the auth provider and to try again
  // in a moment — so they waited, retried, and got the same thing forever.
  if (
    message.includes('validate email') ||
    message.includes('email_address_invalid') ||
    message.includes('invalid email') ||
    message.includes('email address is invalid')
  ) {
    return 'invalid_email';
  }

  // Already registered (Supabase: "User already registered", "email_exists")
  if (
    message.includes('already registered') ||
    message.includes('email_exists') ||
    message.includes('already been registered')
  ) {
    return 'email_exists';
  }

  // Password rejected by policy (Supabase: "Password should be at least...", "weak_password")
  if (
    message.includes('weak_password') ||
    message.includes('password should be') ||
    message.includes('password is too weak')
  ) {
    return 'weak_password';
  }

  // Anything else is GENERIC, not `provider_error`.
  //
  // The fallback used to be `provider_error`, whose copy says "we couldn't reach the auth
  // provider" — a claim about the NETWORK that this function has no evidence for. It reached that
  // conclusion for every unrecognised message, including ones where the provider answered
  // perfectly well and rejected the input. Telling someone to "try again in a moment" when the
  // problem is what they typed is worse than saying nothing: it sends them into a loop.
  //
  // `provider_error` is now reserved for cases a caller can actually establish — a 5xx or an
  // unreachable host — and is set explicitly, not guessed.
  return 'generic';
}

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return '';
}
