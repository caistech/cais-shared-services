// @caistech/coordination-sdk — Supabase client management
// SDK manages its own client, separate from consuming project's Supabase
//
// Next.js only inlines STATIC process.env.NEXT_PUBLIC_* references.
// Dynamic access (process.env[name]) does NOT get replaced at build time.
// So we must reference each env var by its full static name.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

/** Browser/client-side Supabase client (uses anon key) */
export function getCoordinationClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_COORDINATION_URL;
  const key = process.env.NEXT_PUBLIC_COORDINATION_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      `@caistech/coordination-sdk: Missing environment variables. ` +
        `Set NEXT_PUBLIC_COORDINATION_URL and NEXT_PUBLIC_COORDINATION_ANON_KEY in .env.local`
    );
  }

  _client = createClient(url, key, {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  return _client;
}

/** Server-side Supabase client (uses service role key) */
export function getCoordinationServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_COORDINATION_URL;
  const key = process.env.COORDINATION_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      `@caistech/coordination-sdk: Missing environment variables. ` +
        `Set NEXT_PUBLIC_COORDINATION_URL and COORDINATION_SERVICE_ROLE_KEY in .env.local`
    );
  }

  _serviceClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _serviceClient;
}
