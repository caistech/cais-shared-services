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
 * THEME (canonical, 2026-06-12): the component is the ONE auth shape across the
 * whole portfolio, but the portfolio carries differently-branded (incl. white-label)
 * products. The STRUCTURE / FLOW / modes / error mapping are identical everywhere;
 * only the skin is branded, via:
 *   - `theme="light" | "dark"` (default "light" — the neutral most products use;
 *     dark suits operator/admin portals)
 *   - `accent` — a hex that overrides the `--cais-auth-accent` brand colour
 * This is what makes "one shape" compatible with the white-label / lane-aware
 * "whose brand travels" rule (a distributor product must carry the distributor's
 * brand, never a hardcoded CAS look).
 *
 * CANONICAL FLOW (2026-06-12): every email (confirm / magic-link / recovery)
 * routes through the product's `/auth/callback` route, which verifies the token
 * server-side (`exchangeCodeForSession` for ?code= PKCE, or `verifyOtp` for
 * ?token_hash=&type=) BEFORE the user lands on a page — so the session cookie is
 * in place under SSR. In particular forgot-password points the reset email at
 * `${callbackPath}?next=${resetPasswordPath}` (NOT straight at the reset page,
 * which would arrive session-less under SSR/PKCE). Ship the canonical
 * `/auth/callback` route alongside this component (see the template's
 * app/auth/callback/route.ts) and configure Supabase site/redirect URLs + Resend
 * SMTP via the canonical setup flow (`@caistech/portfolio-env-sync` auth_config +
 * configure-email-templates.sh) — adopt, do not re-invent.
 *
 * Supabase client is constructed lazily via `@supabase/ssr`'s
 * `createBrowserClient` — a peer dep. The component never bundles
 * `@supabase/*` into its own build.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
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

export type AuthTheme = 'light' | 'dark';

export interface AuthUser {
  id: string;
  email?: string | null;
}

/** Props handed to a custom `render` extra-field (e.g. an ABN-lookup or address widget). */
export interface ExtraFieldRenderProps {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  required: boolean;
}

/**
 * A product-specific field added to the SIGNUP form on top of the canonical
 * email + password. This is how the ONE AuthForm absorbs signups that used to
 * be bespoke purely because they collected an extra field (a name, a company,
 * a required ToS checkbox) — without forking the component.
 *
 *  - default (no `type`/`render`)   → a labelled text input
 *  - `type: 'checkbox'`             → a consent checkbox; `required` makes it a
 *                                     hard gate (the form won't submit unchecked).
 *                                     `label` may contain links (Terms etc.).
 *  - `render`                       → a fully custom control (ABN lookup, address
 *                                     autocomplete, phone) — AuthForm owns the
 *                                     value and hands it back via metadata.
 *
 * Collected values are passed to `signUp` as `options.data` (Supabase
 * user_metadata), keyed by `name` (checkbox → "true"/"false").
 */
export interface AuthExtraField {
  /** Field key — also the user_metadata key the value is stored under. */
  name: string;
  /** Visible label. For checkboxes this is the consent text (may include links). */
  label?: React.ReactNode;
  /** Input type. Omit for text; 'checkbox' for a consent gate. */
  type?: 'text' | 'tel' | 'email' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  /** Custom control. When provided, overrides the default input for this field. */
  render?: (props: ExtraFieldRenderProps) => React.ReactNode;
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
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }): Promise<{
    // `session` is non-null only when email confirmation is DISABLED on the
    // project (signUp returns a live session immediately). We use it to decide
    // whether to send the user straight in vs show "check your inbox".
    data: { user: AuthUser | null; session?: unknown } | null;
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
  supabaseUrl?: string;
  /** Supabase anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). */
  supabaseAnonKey?: string;

  /** Where to send the user after a successful password sign-in. */
  redirectTo?: string;

  /** Path to the forgot-password page (link from login). Default `/forgot-password`. */
  forgotPasswordPath?: string;
  /** Path to the signup page (link from login). Default `/signup`. */
  signupPath?: string;
  /** Path to the login page (link from signup / reset). Default `/login`. */
  loginPath?: string;
  /** Path to the auth callback (email-flow landing). Default `/auth/callback`. */
  callbackPath?: string;
  /** Path to the set-new-password page (recovery lands here AFTER the callback). Default `/reset-password`. */
  resetPasswordPath?: string;

  /** Visual skin. "light" (default) for most products; "dark" for operator/admin portals. */
  theme?: AuthTheme;
  /** Brand accent colour (hex). Overrides the `--cais-auth-accent` CSS variable. */
  accent?: string;

  /** Brand name for the header. Defaults to mode-appropriate copy. */
  brandName?: string;

  /** Optional links shown on signup mode (renders consent line). */
  termsPath?: string;
  /** Optional links shown on signup mode (renders consent line). */
  privacyPath?: string;

  /** Slot for a custom consent line on signup (overrides default if provided). */
  consentSlot?: React.ReactNode;

  /**
   * Product-specific fields added to the SIGNUP form (a name, company, a required
   * ToS checkbox, an ABN-lookup widget). Lets the ONE AuthForm cover signups that
   * were previously bespoke just to collect an extra field. Ignored in non-signup
   * modes. Values flow to `signUp` as `options.data` (user_metadata). See
   * {@link AuthExtraField}.
   */
  extraFields?: AuthExtraField[];

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

// --- Theme tokens -------------------------------------------------------

interface ThemeTokens {
  pw: AuthTheme;
  card: string;
  title: string;
  desc: string;
  label: string;
  input: string;
  inputIcon: string;
  secondaryBtn: string;
  dividerBorder: string;
  dividerBg: string;
  dividerText: string;
  footerMuted: string;
  errorBox: string;
  successBox: string;
  confirmCircle: string;
  confirmIcon: string;
  confirmHeading: string;
  confirmBody: string;
  confirmMuted: string;
  mutedBtn: string;
}

const LIGHT: ThemeTokens = {
  pw: 'light',
  card: 'bg-white border border-zinc-200 shadow-sm rounded-xl p-5 sm:p-7 text-zinc-900',
  title: 'text-zinc-900',
  desc: 'text-zinc-600',
  label: 'text-zinc-700',
  input:
    'w-full bg-white border border-zinc-300 rounded-lg pl-10 pr-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:border-zinc-400 min-h-[44px]',
  inputIcon: 'text-zinc-400',
  secondaryBtn:
    'bg-white hover:bg-zinc-50 disabled:bg-white disabled:cursor-not-allowed border border-zinc-300 text-zinc-700',
  dividerBorder: 'border-zinc-200',
  dividerBg: 'bg-white',
  dividerText: 'text-zinc-400',
  footerMuted: 'text-zinc-500',
  errorBox: 'text-red-700 bg-red-50 border border-red-200',
  successBox: 'text-green-700 bg-green-50 border border-green-200',
  confirmCircle: 'bg-green-100',
  confirmIcon: 'text-green-600',
  confirmHeading: 'text-zinc-900',
  confirmBody: 'text-zinc-600',
  confirmMuted: 'text-zinc-500',
  mutedBtn: 'text-zinc-500 hover:text-zinc-900',
};

const DARK: ThemeTokens = {
  pw: 'dark',
  card: 'bg-slate-900/60 border border-slate-700/50 rounded-xl p-5 sm:p-7 text-white',
  title: 'text-white',
  desc: 'text-slate-400',
  label: 'text-slate-300',
  input:
    'w-full bg-slate-950/60 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600 focus:border-slate-500 min-h-[44px]',
  inputIcon: 'text-slate-500',
  secondaryBtn:
    'bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:cursor-not-allowed border border-slate-700 text-slate-200',
  dividerBorder: 'border-slate-700',
  dividerBg: 'bg-slate-900/60',
  dividerText: 'text-slate-500',
  footerMuted: 'text-slate-400',
  errorBox: 'text-red-300 bg-red-500/10 border border-red-500/20',
  successBox: 'text-green-300 bg-green-500/10 border border-green-500/20',
  confirmCircle: 'bg-green-500/15',
  confirmIcon: 'text-green-400',
  confirmHeading: 'text-white',
  confirmBody: 'text-slate-400',
  confirmMuted: 'text-slate-500',
  mutedBtn: 'text-slate-400 hover:text-white',
};

const ThemeContext = createContext<ThemeTokens>(LIGHT);
function useT(): ThemeTokens {
  return useContext(ThemeContext);
}

// Accent-coloured surfaces read the brand CSS variable through inline style
// (see the note in AuthForm) — these reference the variable, not its value, so
// they are constant and theme-overridable via the wrapper's `--cais-auth-accent`.
const ACCENT_BG: React.CSSProperties = {
  backgroundColor: 'var(--cais-auth-accent)',
};
const ACCENT_TEXT: React.CSSProperties = { color: 'var(--cais-auth-accent)' };

// --- Component ----------------------------------------------------------

const DEFAULT_FORGOT = '/forgot-password';
const DEFAULT_SIGNUP = '/signup';
const DEFAULT_LOGIN = '/login';
const DEFAULT_CALLBACK = '/auth/callback';
const DEFAULT_RESET = '/reset-password';

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
    resetPasswordPath = DEFAULT_RESET,
    theme = 'light',
    accent,
    brandName,
    termsPath,
    privacyPath,
    consentSlot,
    extraFields,
    onSuccess,
    className = '',
    supabaseClient,
    createBrowserClient,
  } = props;

  // Build the Supabase client once.
  const client = useMemo<SupabaseClientLike | null>(() => {
    if (supabaseClient) return supabaseClient;
    if (createBrowserClient && supabaseUrl && supabaseAnonKey) {
      return createBrowserClient(supabaseUrl, supabaseAnonKey);
    }
    return null;
  }, [supabaseClient, createBrowserClient, supabaseUrl, supabaseAnonKey]);

  const tokens = theme === 'dark' ? DARK : LIGHT;

  // The brand accent is delivered as a CSS variable that is ALWAYS defined on
  // the wrapper (default brand green, overridable via `accent`). Accent-coloured
  // surfaces (primary button, links) read it through inline `style`, NOT a
  // Tailwind arbitrary class — Tailwind v4 silently drops `bg-[var(--x,#hex)]`
  // tokens (comma+hash) when scanning a node_modules package, which would leave
  // the primary buttons background-less in consumer builds. Inline style needs
  // no class generation, so it is robust regardless of the consumer's Tailwind.
  const style = {
    ['--cais-auth-accent']: accent ?? '#22c55e',
  } as React.CSSProperties;

  return (
    <ThemeContext.Provider value={tokens}>
      <div
        className={`w-full max-w-md mx-auto ${className}`}
        data-cais-auth-mode={mode}
        data-cais-auth-theme={theme}
        style={style}
      >
        <ModeHeader mode={mode} brandName={brandName} />

        <div className={tokens.card}>
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
              redirectTo={redirectTo ?? '/'}
              callbackPath={callbackPath}
              loginPath={loginPath}
              termsPath={termsPath}
              privacyPath={privacyPath}
              consentSlot={consentSlot}
              extraFields={extraFields}
              onSuccess={onSuccess}
            />
          )}
          {mode === 'magic-link' && (
            <MagicLinkPanel
              client={client}
              callbackPath={callbackPath}
              loginPath={loginPath}
              redirectTo={redirectTo ?? '/'}
            />
          )}
          {mode === 'forgot-password' && (
            <ForgotPasswordPanel
              client={client}
              loginPath={loginPath}
              callbackPath={callbackPath}
              resetPasswordPath={resetPasswordPath}
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
    </ThemeContext.Provider>
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
  const t = useT();
  const title = brandName ?? defaultTitleFor(mode);
  const description = descriptionFor(mode);
  return (
    <div className="mb-6 text-center px-2">
      <h1 className={`text-2xl font-bold mb-2 ${t.title}`}>{title}</h1>
      <p className={`text-sm ${t.desc}`}>{description}</p>
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
  const t = useT();
  if (!code) return null;
  return (
    <p
      role="alert"
      className={`text-sm rounded-lg px-3 py-2 flex gap-2 items-start ${t.errorBox}`}
    >
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
      <span>{resolveAuthErrorMessage(code)}</span>
    </p>
  );
}

function MissingClientBox() {
  const t = useT();
  return (
    <p role="alert" className={`text-sm rounded-lg px-3 py-2 ${t.errorBox}`}>
      AuthForm is missing a Supabase client. Pass <code>createBrowserClient</code>{' '}
      from <code>@supabase/ssr</code> (with <code>supabaseUrl</code> +{' '}
      <code>supabaseAnonKey</code>) or a pre-built <code>supabaseClient</code>{' '}
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
  const t = useT();
  return (
    <div>
      <label
        htmlFor="cais-auth-email"
        className={`block text-sm font-medium mb-1.5 ${t.label}`}
      >
        Email
      </label>
      <div className="relative">
        <Mail
          className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${t.inputIcon}`}
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
          className={t.input}
        />
      </div>
    </div>
  );
}

/**
 * A single product-specific signup field. Renders a labelled text/tel input, a
 * consent checkbox, or a fully custom control (`field.render`). Controlled by
 * SignupPanel — value lives in its `fieldValues` map, flows to user_metadata.
 */
function ExtraField({
  field,
  value,
  onChange,
}: {
  field: AuthExtraField;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const t = useT();
  const id = `cais-auth-xf-${field.name}`;

  if (field.render) {
    return (
      <div>
        {field.label ? (
          <label
            htmlFor={id}
            className={`block text-sm font-medium mb-1.5 ${t.label}`}
          >
            {field.label}
          </label>
        ) : null}
        {field.render({
          id,
          name: field.name,
          value: typeof value === 'string' ? value : '',
          onChange: (v) => onChange(v),
          required: !!field.required,
        })}
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label
        htmlFor={id}
        className={`flex items-start gap-2 text-xs cursor-pointer ${t.footerMuted}`}
      >
        <input
          id={id}
          name={field.name}
          type="checkbox"
          required={field.required}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: 'var(--cais-auth-accent)' }}
          className="mt-0.5 h-4 w-4 flex-shrink-0"
        />
        <span>{field.label}</span>
      </label>
    );
  }

  return (
    <div>
      {field.label ? (
        <label
          htmlFor={id}
          className={`block text-sm font-medium mb-1.5 ${t.label}`}
        >
          {field.label}
        </label>
      ) : null}
      <input
        id={id}
        name={field.name}
        type={field.type ?? 'text'}
        required={field.required}
        autoComplete={field.autoComplete}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={t.input.replace('pl-10', 'pl-3')}
      />
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
      style={ACCENT_BG}
      className="w-full inline-flex items-center justify-center gap-2 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition min-h-[44px]"
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
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full inline-flex items-center justify-center gap-2 font-medium py-3 rounded-lg transition min-h-[44px] ${t.secondaryBtn}`}
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
  const t = useT();
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <div className={`w-full border-t ${t.dividerBorder}`} />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className={`px-3 ${t.dividerBg} ${t.dividerText}`}>or</span>
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
      style={ACCENT_TEXT}
      className="hover:opacity-80 transition font-medium"
    >
      {children}
    </a>
  );
}

/**
 * Build the email-redirect URL. ALWAYS includes a `?next=` so the canonical
 * `/auth/callback` route lands the user on the right page after it verifies the
 * token server-side. Under SSR this is what keeps the session cookie in place.
 */
function buildRedirectUrl(callbackPath: string, next: string): string {
  if (typeof window === 'undefined') {
    return `${callbackPath}?next=${encodeURIComponent(next)}`;
  }
  const url = new URL(callbackPath, window.location.origin);
  url.searchParams.set('next', next);
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
  const t = useT();
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
        theme={t.pw}
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

      <p className={`mt-4 text-center text-xs ${t.footerMuted}`}>
        Need an account? <FooterLink href={signupPath}>Sign up</FooterLink>
      </p>
    </form>
  );
}

// --- Panel: signup ------------------------------------------------------

function SignupPanel({
  client,
  redirectTo,
  callbackPath,
  loginPath,
  termsPath,
  privacyPath,
  consentSlot,
  extraFields,
  onSuccess,
}: {
  client: SupabaseClientLike | null;
  redirectTo: string;
  callbackPath: string;
  loginPath: string;
  termsPath?: string;
  privacyPath?: string;
  consentSlot?: React.ReactNode;
  extraFields?: AuthExtraField[];
  onSuccess?: (user: AuthUser) => void;
}) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldValues, setFieldValues] = useState<
    Record<string, string | boolean>
  >({});
  const setField = (name: string, v: string | boolean) =>
    setFieldValues((prev) => ({ ...prev, [name]: v }));
  const leadingFields = (extraFields ?? []).filter(
    (f) => f.type !== 'checkbox'
  );
  const checkboxFields = (extraFields ?? []).filter(
    (f) => f.type === 'checkbox'
  );
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
    // Hard gate on any required consent checkbox (native `required` also blocks
    // submit, but guard here too so a programmatic submit can't bypass it).
    const missingConsent = checkboxFields.find(
      (f) => f.required && fieldValues[f.name] !== true
    );
    if (missingConsent) {
      setErrorCode('consent_required');
      return;
    }
    setSubmitting(true);
    try {
      const emailRedirectTo = buildRedirectUrl(callbackPath, redirectTo);
      // Collect extra-field values into user_metadata (checkbox → "true"/"false").
      const metadata: Record<string, unknown> = {};
      for (const f of extraFields ?? []) {
        const v = fieldValues[f.name];
        if (v === undefined) continue;
        metadata[f.name] = typeof v === 'boolean' ? (v ? 'true' : 'false') : v;
      }
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          ...(Object.keys(metadata).length ? { data: metadata } : {}),
        },
      });
      if (error) {
        setErrorCode(mapSupabaseAuthError(error));
        return;
      }
      if (data?.user && onSuccess) onSuccess(data.user);
      // Email confirmation DISABLED → signUp returned a live session, so the
      // account is already active. Send them straight in rather than telling
      // them to check an inbox that will never receive a mail. (Hard nav so the
      // freshly-set @supabase/ssr cookies are attached on the next request.)
      if (data?.session) {
        if (typeof window !== 'undefined') window.location.href = redirectTo;
        return;
      }
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
      {leadingFields.map((f) => (
        <ExtraField
          key={f.name}
          field={f}
          value={fieldValues[f.name]}
          onChange={(v) => setField(f.name, v)}
        />
      ))}
      <EmailField value={email} onChange={setEmail} autoComplete="email" />
      <PasswordInput
        theme={t.pw}
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      {checkboxFields.map((f) => (
        <ExtraField
          key={f.name}
          field={f}
          value={fieldValues[f.name]}
          onChange={(v) => setField(f.name, v)}
        />
      ))}
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
        <div className={`text-xs mt-3 ${t.footerMuted}`}>{consentSlot}</div>
      ) : termsPath || privacyPath ? (
        <p className={`text-xs mt-3 text-center ${t.footerMuted}`}>
          By creating an account you agree to our{' '}
          {termsPath ? <FooterLink href={termsPath}>Terms</FooterLink> : null}
          {termsPath && privacyPath ? ' and ' : null}
          {privacyPath ? (
            <FooterLink href={privacyPath}>Privacy Policy</FooterLink>
          ) : null}
          .
        </p>
      ) : null}

      <p className={`mt-4 text-center text-xs ${t.footerMuted}`}>
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
  redirectTo: string;
}) {
  const t = useT();
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
      <PrimaryButton loading={submitting} loadingLabel="Sending…" slow={slow}>
        Email me a magic link
      </PrimaryButton>
      <p className={`mt-2 text-center text-xs ${t.footerMuted}`}>
        Prefer a password? <FooterLink href={loginPath}>Sign in</FooterLink>
      </p>
    </form>
  );
}

// --- Panel: forgot-password --------------------------------------------

function ForgotPasswordPanel({
  client,
  loginPath,
  callbackPath,
  resetPasswordPath,
}: {
  client: SupabaseClientLike | null;
  loginPath: string;
  callbackPath: string;
  resetPasswordPath: string;
}) {
  const t = useT();
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
      // Canonical recovery flow: route the reset email through /auth/callback
      // (which verifies the token server-side and sets the session cookie)
      // BEFORE landing on the set-new-password page. Pointing straight at the
      // reset page would arrive session-less under SSR/PKCE.
      const redirectTo = buildRedirectUrl(callbackPath, resetPasswordPath);
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
      <PrimaryButton loading={submitting} loadingLabel="Sending…" slow={slow}>
        Send reset link
      </PrimaryButton>
      <p className={`mt-2 text-center text-xs ${t.footerMuted}`}>
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
  const t = useT();
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
        <div
          className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 ${t.confirmCircle}`}
        >
          <CheckCircle2 className={`w-6 h-6 ${t.confirmIcon}`} aria-hidden />
        </div>
        <h2 className={`text-lg font-semibold mb-2 ${t.confirmHeading}`}>
          Password updated
        </h2>
        <p className={`text-sm mb-6 ${t.confirmBody}`}>
          You can now sign in with your new password.
        </p>
        <a
          href={loginPath}
          style={ACCENT_BG}
          className="inline-flex items-center justify-center gap-2 hover:brightness-95 text-white font-semibold py-3 px-6 rounded-lg min-h-[44px]"
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
        theme={t.pw}
        label="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <PasswordInput
        theme={t.pw}
        label="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Repeat your new password"
      />
      <ErrorBox code={errorCode} />
      <PrimaryButton loading={submitting} loadingLabel="Updating…" slow={slow}>
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
  const t = useT();
  return (
    <div className="text-center">
      <div
        className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 ${t.confirmCircle}`}
      >
        <Mail className={`w-6 h-6 ${t.confirmIcon}`} aria-hidden />
      </div>
      <h2 className={`text-lg font-semibold mb-2 ${t.confirmHeading}`}>
        Check your inbox
      </h2>
      <p className={`text-sm ${t.confirmBody}`}>
        We sent a magic link to{' '}
        <strong className={t.confirmHeading}>{email}</strong>. Click it to sign
        in.
      </p>
      <p className={`mt-3 text-xs ${t.confirmMuted}`}>
        It may take a minute to arrive. Check your spam folder if you don't see
        it.
      </p>
      <button
        onClick={onReset}
        className={`mt-6 text-sm transition min-h-[44px] px-3 ${t.mutedBtn}`}
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
  const t = useT();
  const heading = kind === 'reset' ? 'Reset link sent' : 'Confirm your email';
  const body =
    kind === 'reset' ? (
      <>
        We sent a password-reset link to{' '}
        <strong className={t.confirmHeading}>{email}</strong>. Click it to
        choose a new password.
      </>
    ) : (
      <>
        We sent a confirmation link to{' '}
        <strong className={t.confirmHeading}>{email}</strong>. Click it to
        activate your account.
      </>
    );
  return (
    <div className="text-center">
      <div
        className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 ${t.confirmCircle}`}
      >
        <Mail className={`w-6 h-6 ${t.confirmIcon}`} aria-hidden />
      </div>
      <h2 className={`text-lg font-semibold mb-2 ${t.confirmHeading}`}>
        {heading}
      </h2>
      <p className={`text-sm ${t.confirmBody}`}>{body}</p>
      <p className={`mt-3 text-xs ${t.confirmMuted}`}>
        It may take a minute to arrive. Check your spam folder if you don't see
        it.
      </p>
      <button
        onClick={onReset}
        className={`mt-6 text-sm transition min-h-[44px] px-3 ${t.mutedBtn}`}
      >
        Use a different email
      </button>
    </div>
  );
}

// Re-exports are handled by ./index.ts — keep AuthForm.tsx focused.
