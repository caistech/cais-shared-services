'use client';

/**
 * <AuthForm/> — the Portfolio Standard R1 auth surface.
 *
 * Single component supporting five modes:
 *   - "login"           email + password (visibility toggle) + forgot link + magic-link
 *   - "signup"          email + password (visibility toggle) + magic-link + consent slot
 *   - "magic-link"      email only + send-link CTA
 *   - "forgot-password" email only + reset CTA
 *   - "reset-password"  new password + confirm new password (both with toggle) + submit
 *
 * Closes R1 in one swap. Bakes in:
 *   - Working forgot-password link → reset flow (R1.a)
 *   - Password visibility toggle on every password field (R1.c, Tony complaint)
 *   - Working magic-link button (R1.b)
 *   - Whitelisted error codes — never reflects raw Supabase error.message
 *     into the UI (R10 spirit on client side)
 *   - Mobile-first, 44px tap targets, ≥16px font (R2)
 *   - Vendor-neutral defaults — `brandName` prop, no hardcoded identity (R11)
 *   - Explanatory header on each mode (R3)
 *
 * Supabase client is constructed lazily via `@supabase/ssr`'s
 * `createBrowserClient` — a peer dep. The component never bundles
 * `@supabase/*` into its own build.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Loader2,
  Mail,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { PasswordInput } from './PasswordInput';
import {
  AuthErrorCode,
  mapSupabaseAuthError,
  resolveAuthErrorMessage,
} from './error-codes';

// --- Types --------------------------------------------------------------

export type AuthMode =
  | 'login'
  | 'signup'
  | 'magic-link'
  | 'forgot-password'
  | 'reset-password';

export interface AuthUser {
  id: string;
  email?: string | null;
}

/**
 * Minimal duck-typed surface of the Supabase auth client the component uses.
 * Avoids a hard type-dep on `@supabase/supabase-js` (which is a peer dep) so
 * this package can build standalone without the consumer's SDK installed.
 */
interface SupabaseAuthLike {
  signInWithPassword(args: {
    email: string;
    password: string;
  }): Promise<{ data: unknown; error: { message: string } | null }>;
  signInWithOtp(args: {
    email: string;
    options?: { emailRedirectTo?: string };
  }): Promise<{ data: unknown; error: { message: string } | null }>;
  signUp(args: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string };
  }): Promise<{
    data: { user: AuthUser | null } | null;
    error: { message: string } | null;
  }>;
  resetPasswordForEmail(
    email: string,
    options?: { redirectTo?: string }
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  updateUser(args: {
    password: string;
  }): Promise<{
    data: { user: AuthUser | null } | null;
    error: { message: string } | null;
  }>;
  getUser(): Promise<{
    data: { user: AuthUser | null };
    error: { message: string } | null;
  }>;
}

interface SupabaseClientLike {
  auth: SupabaseAuthLike;
}

export interface AuthFormProps {
  /** Which surface to render. */
  mode: AuthMode;

  /** Supabase project URL (`NEXT_PUBLIC_SUPABASE_URL`). */
  supabaseUrl: string;
  /** Supabase anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). */
  supabaseAnonKey: string;

  /** Where to send the user after a successful password sign-in. */
  redirectTo?: string;

  /** Path to the forgot-password page (link from login). Default `/auth/forgot-password`. */
  forgotPasswordPath?: string;
  /** Path to the signup page (link from login). Default `/signup`. */
  signupPath?: string;
  /** Path to the login page (link from signup / reset). Default `/login`. */
  loginPath?: string;
  /** Path to the auth callback (magic-link landing). Default `/auth/callback`. */
  callbackPath?: string;

  /** Brand name for the header. Defaults to "Sign in" / mode-appropriate copy. */
  brandName?: string;

  /** Optional links shown on signup mode (renders consent line). */
  termsPath?: string;
  /** Optional links shown on signup mode (renders consent line). */
  privacyPath?: string;

  /** Slot for a custom consent line on signup (overrides default if provided). */
  consentSlot?: React.ReactNode;

  /** Called with the user after a successful sign-in / sign-up. */
  onSuccess?: (user: AuthUser) => void;

  /** Tailwind classes appended to the outer wrapper. */
  className?: string;

  /**
   * Optional override: pass your own Supabase browser client (e.g. you have
   * a project-wide `createClient()` helper). When provided, `supabaseUrl` and
   * `supabaseAnonKey` are ignored.
   */
  supabaseClient?: SupabaseClientLike;

  /**
   * `@supabase/ssr`'s `createBrowserClient` factory. Injected by the consumer
   * so this package doesn't bundle Supabase SDKs. Required unless
   * `supabaseClient` is provided.
   *
   * Usage:
   *   import { createBrowserClient } from '@supabase/ssr';
   *   <AuthForm createBrowserClient={createBrowserClient} ... />
   */
  createBrowserClient?: (url: string, key: string) => SupabaseClientLike;
}

// --- Component ----------------------------------------------------------

const DEFAULT_FORGOT = '/auth/forgot-password';
const DEFAULT_SIGNUP = '/signup';
const DEFAULT_LOGIN = '/login';
const DEFAULT_CALLBACK = '/auth/callback';

export function AuthForm(props: AuthFormProps) {
  const {
    mode,
    supabaseUrl,
    supabaseAnonKey,
    redirectTo,
    forgotPasswordPath = DEFAULT_FORGOT,
    signupPath = DEFAULT_SIGNUP,
    loginPath = DEFAULT_LOGIN,
    callbackPath = DEFAULT_CALLBACK,
    brandName,
    termsPath,
    privacyPath,
    consentSlot,
    onSuccess,
    className = '',
    supabaseClient,
    createBrowserClient,
  } = props;

  // Build the Supabase client once.
  const client = useMemo<SupabaseClientLike | null>(() => {
    if (supabaseClient) return supabaseClient;
    if (createBrowserClient) {
      return createBrowserClient(supabaseUrl, supabaseAnonKey);
    }
    return null;
  }, [supabaseClient, createBrowserClient, supabaseUrl, supabaseAnonKey]);

  return (
    <div
      className={`w-full max-w-md mx-auto ${className}`}
      data-cais-auth-mode={mode}
    >
      <ModeHeader mode={mode} brandName={brandName} />

      <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-5 sm:p-7 text-white">
        {mode === 'login' && (
          <LoginPanel
            client={client}
            redirectTo={redirectTo ?? '/'}
            forgotPasswordPath={forgotPasswordPath}
            signupPath={signupPath}
            callbackPath={callbackPath}
            onSuccess={onSuccess}
          />
        )}
        {mode === 'signup' && (
          <SignupPanel
            client={client}
            callbackPath={callbackPath}
            loginPath={loginPath}
            termsPath={termsPath}
            privacyPath={privacyPath}
            consentSlot={consentSlot}
            onSuccess={onSuccess}
          />
        )}
        {mode === 'magic-link' && (
          <MagicLinkPanel
            client={client}
            callbackPath={callbackPath}
            loginPath={loginPath}
            redirectTo={redirectTo}
          />
        )}
        {mode === 'forgot-password' && (
          <ForgotPasswordPanel
            client={client}
            loginPath={loginPath}
            resetRedirectPath={'/auth/reset-password'}
          />
        )}
        {mode === 'reset-password' && (
          <ResetPasswordPanel
            client={client}
            loginPath={loginPath}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}

// --- Header copy --------------------------------------------------------

function ModeHeader({
  mode,
  brandName,
}: {
  mode: AuthMode;
  brandName?: string;
}) {
  const title = brandName ?? defaultTitleFor(mode);
  const description = descriptionFor(mode);
  return (
    <div className="mb-6 text-center px-2">
      <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  );
}

function defaultTitleFor(mode: AuthMode): string {
  switch (mode) {
    case 'login':
      return 'Sign in';
    case 'signup':
      return 'Create your account';
    case 'magic-link':
      return 'Email me a link';
    case 'forgot-password':
      return 'Reset your password';
    case 'reset-password':
      return 'Set a new password';
  }
}

function descriptionFor(mode: AuthMode): string {
  switch (mode) {
    case 'login':
      return 'Use your password, or get a one-time magic link by email.';
    case 'signup':
      return 'Set a password to create your account. We will email a confirmation link.';
    case 'magic-link':
      return 'No password needed — we will email you a one-time sign-in link.';
    case 'forgot-password':
      return "Enter the email on your account and we'll send you a reset link.";
    case 'reset-password':
      return 'Choose a new password. You will be signed in afterwards.';
  }
}

// --- Shared utilities ---------------------------------------------------

function useSlowFlag(active: boolean, delayMs = 5000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  return slow;
}

function ErrorBox({ code }: { code: AuthErrorCode | null }) {
  if (!code) return null;
  return (
    <p
      role="alert"
      className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex gap-2 items-start"
    >
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
      <span>{resolveAuthErrorMessage(code)}</span>
    </p>
  );
}

function SuccessBox({ code }: { code: AuthErrorCode | null }) {
  if (!code) return null;
  return (
    <p
      role="status"
      className="text-sm text-green-300 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 flex gap-2 items-start"
    >
      <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
      <span>{resolveAuthErrorMessage(code)}</span>
    </p>
  );
}

function MissingClientBox() {
  return (
    <p
      role="alert"
      className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
    >
      AuthForm is missing a Supabase client. Pass <code>createBrowserClient</code>{' '}
      from <code>@supabase/ssr</code> or a pre-built <code>supabaseClient</code>{' '}
      prop.
    </p>
  );
}

function EmailField({
  value,
  onChange,
  autoComplete = 'email',
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        htmlFor="cais-auth-email"
        className="block text-sm font-medium text-slate-300 mb-1.5"
      >
        Email
      </label>
      <div className="relative">
        <Mail
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
          aria-hidden
        />
        <input
          id="cais-auth-email"
          type="email"
          required
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="you@example.com"
          className="w-full bg-slate-950/60 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--cais-auth-accent,#22c55e)]/30 focus:border-[var(--cais-auth-accent,#22c55e)] min-h-[44px]"
        />
      </div>
    </div>
  );
}

function PrimaryButton({
  loading,
  loadingLabel,
  slow,
  children,
  type = 'submit',
  onClick,
}: {
  loading: boolean;
  loadingLabel: string;
  slow: boolean;
  children: React.ReactNode;
  type?: 'submit' | 'button';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 bg-[var(--cais-auth-accent,#22c55e)] hover:bg-[var(--cais-auth-accent-hover,#16a34a)] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition min-h-[44px]"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          <span>{slow ? 'Still working…' : loadingLabel}</span>
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="w-4 h-4" aria-hidden />
        </>
      )}
    </button>
  );
}

function SecondaryButton({
  loading,
  loadingLabel,
  slow,
  onClick,
  children,
}: {
  loading: boolean;
  loadingLabel: string;
  slow: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:cursor-not-allowed border border-slate-700 text-slate-200 font-medium py-3 rounded-lg transition min-h-[44px]"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          <span>{slow ? 'Still working…' : loadingLabel}</span>
        </>
      ) : (
        <>
          <Mail className="w-4 h-4" aria-hidden />
          {children}
        </>
      )}
    </button>
  );
}

function Divider() {
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-slate-700" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-slate-900/60 px-3 text-slate-500">or</span>
      </div>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="text-[var(--cais-auth-accent,#22c55e)] hover:opacity-80 transition"
    >
      {children}
    </a>
  );
}

function buildRedirectUrl(callbackPath: string, next?: string): string {
  if (typeof window === 'undefined') return callbackPath;
  const url = new URL(callbackPath, window.location.origin);
  if (next) url.searchParams.set('next', next);
  return url.toString();
}

// --- Panel: login -------------------------------------------------------

function LoginPanel({
  client,
  redirectTo,
  forgotPasswordPath,
  signupPath,
  callbackPath,
  onSuccess,
}: {
  client: SupabaseClientLike | null;
  redirectTo: string;
  forgotPasswordPath: string;
  signupPath: string;
  callbackPath: string;
  onSuccess?: (user: AuthUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const slowPwd = useSlowFlag(submitting);
  const slowMagic = useSlowFlag(magicSubmitting);

  if (!client) return <MissingClientBox />;

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setErrorCode(null);
    setSubmitting(true);
    try {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      const { data } = await client.auth.getUser();
      if (data.user && onSuccess) onSuccess(data.user);
      if (typeof window !== 'undefined') {
        window.location.href = redirectTo;
      }
    } catch (err) {
      setErrorCode(mapSupabaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onMagicLink() {
    if (!client) return;
    if (!email) {
      setErrorCode('generic');
      return;
    }
    setErrorCode(null);
    setMagicSubmitting(true);
    try {
      const emailRedirectTo = buildRedirectUrl(callbackPath, redirectTo);
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      setMagicSent(true);
    } catch (err) {
      setErrorCode(mapSupabaseAuthError(err));
    } finally {
      setMagicSubmitting(false);
    }
  }

  if (magicSent) {
    return (
      <MagicSentPanel
        email={email}
        onReset={() => {
          setMagicSent(false);
          setErrorCode(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={onPasswordSubmit} className="space-y-4">
      <EmailField value={email} onChange={setEmail} />

      <PasswordInput
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        placeholder="••••••••"
        helperRight={
          <FooterLink href={forgotPasswordPath}>Forgot password?</FooterLink>
        }
      />

      <ErrorBox code={errorCode} />

      <PrimaryButton
        loading={submitting}
        loadingLabel="Signing in…"
        slow={slowPwd}
      >
        Sign in
      </PrimaryButton>

      <Divider />

      <SecondaryButton
        loading={magicSubmitting}
        loadingLabel="Sending…"
        slow={slowMagic}
        onClick={onMagicLink}
      >
        Email me a magic link
      </SecondaryButton>

      <p className="mt-4 text-center text-xs text-slate-400">
        Need an account? <FooterLink href={signupPath}>Sign up</FooterLink>
      </p>
    </form>
  );
}

// --- Panel: signup ------------------------------------------------------

function SignupPanel({
  client,
  callbackPath,
  loginPath,
  termsPath,
  privacyPath,
  consentSlot,
  onSuccess,
}: {
  client: SupabaseClientLike | null;
  callbackPath: string;
  loginPath: string;
  termsPath?: string;
  privacyPath?: string;
  consentSlot?: React.ReactNode;
  onSuccess?: (user: AuthUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const slowPwd = useSlowFlag(submitting);
  const slowMagic = useSlowFlag(magicSubmitting);

  if (!client) return <MissingClientBox />;

  async function onSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setErrorCode(null);
    if (password.length < 8) {
      setErrorCode('password_too_short');
      return;
    }
    setSubmitting(true);
    try {
      const emailRedirectTo = buildRedirectUrl(callbackPath);
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      if (data?.user && onSuccess) onSuccess(data.user);
      setConfirmSent(true);
    } catch (err) {
      setErrorCode(mapSupabaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onMagicLink() {
    if (!client) return;
    if (!email) {
      setErrorCode('generic');
      return;
    }
    setErrorCode(null);
    setMagicSubmitting(true);
    try {
      const emailRedirectTo = buildRedirectUrl(callbackPath);
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      setMagicSent(true);
    } catch (err) {
      setErrorCode(mapSupabaseAuthError(err));
    } finally {
      setMagicSubmitting(false);
    }
  }

  if (confirmSent) {
    return (
      <ConfirmEmailPanel
        email={email}
        kind="confirm"
        onReset={() => {
          setConfirmSent(false);
          setErrorCode(null);
        }}
      />
    );
  }

  if (magicSent) {
    return (
      <MagicSentPanel
        email={email}
        onReset={() => {
          setMagicSent(false);
          setErrorCode(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSignupSubmit} className="space-y-4">
      <EmailField value={email} onChange={setEmail} autoComplete="email" />
      <PasswordInput
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <ErrorBox code={errorCode} />

      <PrimaryButton
        loading={submitting}
        loadingLabel="Creating account…"
        slow={slowPwd}
      >
        Create account
      </PrimaryButton>

      <Divider />

      <SecondaryButton
        loading={magicSubmitting}
        loadingLabel="Sending…"
        slow={slowMagic}
        onClick={onMagicLink}
      >
        Email me a magic link
      </SecondaryButton>

      {consentSlot ? (
        <div className="text-xs text-slate-400 mt-3">{consentSlot}</div>
      ) : termsPath || privacyPath ? (
        <p className="text-xs text-slate-400 mt-3 text-center">
          By creating an account you agree to our{' '}
          {termsPath ? <FooterLink href={termsPath}>Terms</FooterLink> : null}
          {termsPath && privacyPath ? ' and ' : null}
          {privacyPath ? (
            <FooterLink href={privacyPath}>Privacy Policy</FooterLink>
          ) : null}
          .
        </p>
      ) : null}

      <p className="mt-4 text-center text-xs text-slate-400">
        Already have an account?{' '}
        <FooterLink href={loginPath}>Sign in</FooterLink>
      </p>
    </form>
  );
}

// --- Panel: magic-link --------------------------------------------------

function MagicLinkPanel({
  client,
  callbackPath,
  loginPath,
  redirectTo,
}: {
  client: SupabaseClientLike | null;
  callbackPath: string;
  loginPath: string;
  redirectTo?: string;
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const slow = useSlowFlag(submitting);

  if (!client) return <MissingClientBox />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setErrorCode(null);
    setSubmitting(true);
    try {
      const emailRedirectTo = buildRedirectUrl(callbackPath, redirectTo);
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      setSent(true);
    } catch (err) {
      setErrorCode(mapSupabaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <MagicSentPanel
        email={email}
        onReset={() => {
          setSent(false);
          setErrorCode(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <EmailField value={email} onChange={setEmail} />
      <ErrorBox code={errorCode} />
      <PrimaryButton
        loading={submitting}
        loadingLabel="Sending…"
        slow={slow}
      >
        Email me a magic link
      </PrimaryButton>
      <p className="mt-2 text-center text-xs text-slate-400">
        Prefer a password? <FooterLink href={loginPath}>Sign in</FooterLink>
      </p>
    </form>
  );
}

// --- Panel: forgot-password --------------------------------------------

function ForgotPasswordPanel({
  client,
  loginPath,
  resetRedirectPath,
}: {
  client: SupabaseClientLike | null;
  loginPath: string;
  resetRedirectPath: string;
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const slow = useSlowFlag(submitting);

  if (!client) return <MissingClientBox />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setErrorCode(null);
    setSubmitting(true);
    try {
      const redirectTo = buildRedirectUrl(resetRedirectPath);
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      setSent(true);
    } catch (err) {
      setErrorCode(mapSupabaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <ConfirmEmailPanel
        email={email}
        kind="reset"
        onReset={() => {
          setSent(false);
          setErrorCode(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <EmailField value={email} onChange={setEmail} />
      <ErrorBox code={errorCode} />
      <PrimaryButton
        loading={submitting}
        loadingLabel="Sending…"
        slow={slow}
      >
        Send reset link
      </PrimaryButton>
      <p className="mt-2 text-center text-xs text-slate-400">
        Remembered it? <FooterLink href={loginPath}>Sign in</FooterLink>
      </p>
    </form>
  );
}

// --- Panel: reset-password ---------------------------------------------

function ResetPasswordPanel({
  client,
  loginPath,
  onSuccess,
}: {
  client: SupabaseClientLike | null;
  loginPath: string;
  onSuccess?: (user: AuthUser) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const slow = useSlowFlag(submitting);

  if (!client) return <MissingClientBox />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setErrorCode(null);
    if (password.length < 8) {
      setErrorCode('password_too_short');
      return;
    }
    if (password !== confirm) {
      setErrorCode('password_mismatch');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      if (data?.user && onSuccess) onSuccess(data.user);
      setDone(true);
    } catch (err) {
      setErrorCode(mapSupabaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 mb-4">
          <CheckCircle2 className="w-6 h-6 text-green-400" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold mb-2 text-white">
          Password updated
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          You can now sign in with your new password.
        </p>
        <a
          href={loginPath}
          className="inline-flex items-center justify-center gap-2 bg-[var(--cais-auth-accent,#22c55e)] hover:bg-[var(--cais-auth-accent-hover,#16a34a)] text-white font-semibold py-3 px-6 rounded-lg min-h-[44px]"
        >
          Continue to sign in
          <ArrowRight className="w-4 h-4" aria-hidden />
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PasswordInput
        label="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <PasswordInput
        label="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Repeat your new password"
      />
      <ErrorBox code={errorCode} />
      <PrimaryButton
        loading={submitting}
        loadingLabel="Updating…"
        slow={slow}
      >
        Update password
      </PrimaryButton>
    </form>
  );
}

// --- Confirmation panels -----------------------------------------------

function MagicSentPanel({
  email,
  onReset,
}: {
  email: string;
  onReset: () => void;
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 mb-4">
        <Mail className="w-6 h-6 text-green-400" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold mb-2 text-white">
        Check your inbox
      </h2>
      <p className="text-sm text-slate-400">
        We sent a magic link to{' '}
        <strong className="text-white">{email}</strong>. Click it to sign in.
      </p>
      <p className="mt-3 text-xs text-slate-500">
        It may take a minute to arrive. Check your spam folder if you don't see
        it.
      </p>
      <button
        onClick={onReset}
        className="mt-6 text-sm text-slate-400 hover:text-white transition min-h-[44px] px-3"
      >
        Use a different email
      </button>
    </div>
  );
}

function ConfirmEmailPanel({
  email,
  kind,
  onReset,
}: {
  email: string;
  kind: 'confirm' | 'reset';
  onReset: () => void;
}) {
  const heading =
    kind === 'reset' ? 'Reset link sent' : 'Confirm your email';
  const body =
    kind === 'reset' ? (
      <>
        We sent a password-reset link to{' '}
        <strong className="text-white">{email}</strong>. Click it to choose a
        new password.
      </>
    ) : (
      <>
        We sent a confirmation link to{' '}
        <strong className="text-white">{email}</strong>. Click it to activate
        your account.
      </>
    );
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 mb-4">
        <Mail className="w-6 h-6 text-green-400" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold mb-2 text-white">{heading}</h2>
      <p className="text-sm text-slate-400">{body}</p>
      <p className="mt-3 text-xs text-slate-500">
        It may take a minute to arrive. Check your spam folder if you don't see
        it.
      </p>
      <button
        onClick={onReset}
        className="mt-6 text-sm text-slate-400 hover:text-white transition min-h-[44px] px-3"
      >
        Use a different email
      </button>
    </div>
  );
}

// Re-exports are handled by ./index.ts — keep AuthForm.tsx focused.
