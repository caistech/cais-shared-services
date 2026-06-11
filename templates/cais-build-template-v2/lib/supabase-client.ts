import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client (anon key). Safe for client components.
 * Pair with `lib/supabase-server.ts` (server) and `app/auth/callback/route.ts`
 * (email-flow verification). This is the canonical shape — do not fork.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
