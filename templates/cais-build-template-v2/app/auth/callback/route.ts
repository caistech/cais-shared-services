import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { serverSupabase } from '@/lib/supabase-server';

/**
 * Canonical auth callback — the ONE shape every product ships.
 *
 * Handles BOTH email-flow encodings so it works regardless of how the Supabase
 * project's templates are wired:
 *   - ?token_hash=&type=  → verifyOtp (custom token_hash templates; the SSR-safe
 *     form — confirm | recovery | invite | magiclink | email_change | email)
 *   - ?code=              → exchangeCodeForSession (PKCE / {{ .ConfirmationURL }})
 *
 * Verifying server-side sets the session cookie BEFORE the user lands on `next`,
 * which is what keeps recovery / magic-link working under SSR (a hash-fragment
 * token a server route cannot read is the failure this avoids). `<AuthForm/>`
 * points every email at `${callbackPath}?next=...`, so this route is required.
 *
 * Keep `/auth/callback` allowlisted in middleware (public) or the redirect 401s
 * before it can establish the session.
 *
 * THE SESSION-COOKIE TRAP (why magic-link/recovery bounced to /login): the OTP
 * exchange writes the session cookies onto the SSR cookie store (next/headers).
 * A bare `NextResponse.redirect(...)` returns a DIFFERENT object that carries
 * NONE of them, so the freshly-minted session never reaches the browser — the
 * next request to a protected route finds no session and redirects to /login.
 * Every successful redirect below copies the sb-* cookies from the store onto
 * the response first (same fix the middleware's redirectPreservingSession makes).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';

  const supabase = await serverSupabase();

  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const response = ok
    ? NextResponse.redirect(`${origin}${next}`)
    : NextResponse.redirect(`${origin}/login?error=auth`);

  if (ok) {
    // Carry the session cookies the OTP exchange just wrote onto the redirect,
    // re-applying the SSR attributes (path=/, httpOnly, sameSite=lax, secure in
    // prod). A wrong/missing path means the next request doesn't send them.
    const cookieStore = await cookies();
    const secure = process.env.NODE_ENV === 'production';
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith('sb-')) {
        response.cookies.set(cookie.name, cookie.value, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure,
        });
      }
    }
  }

  return response;
}
