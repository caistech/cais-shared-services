import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
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
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';

  const supabase = await serverSupabase();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
