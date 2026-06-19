import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client (anon key). Safe for client components.
 * Pair with `lib/supabase-server.ts` (server) and `app/auth/callback/route.ts`
 * (email-flow verification). This is the canonical shape — do not fork.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // During `next build` / prerender the public env vars can be absent — calling
  // createBrowserClient(undefined, undefined) THROWS, which aborts the build when any page
  // mounting <AuthForm supabaseClient={createClient()} /> is statically prerendered. Return
  // null instead; the real client is created in the browser where the env IS inlined. AuthForm
  // (@caistech/corporate-components >=0.5.2) accepts a null client, so this typechecks and
  // degrades cleanly rather than failing the build.
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
