// @gbta/coordination — Supabase client management
// SDK manages its own client, separate from consuming project's Supabase

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

function getEnvVar(name: string): string {
  const value =
    typeof process !== "undefined"
      ? process.env[name]
      : undefined;
  if (!value) {
    throw new Error(
      `@gbta/coordination: Missing environment variable ${name}. ` +
        `Set it in your .env.local file.`
    );
  }
  return value;
}

/** Browser/client-side Supabase client (uses anon key) */
export function getCoordinationClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    getEnvVar("NEXT_PUBLIC_COORDINATION_URL"),
    getEnvVar("NEXT_PUBLIC_COORDINATION_ANON_KEY"),
    {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    }
  );
  return _client;
}

/** Server-side Supabase client (uses service role key) */
export function getCoordinationServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  _serviceClient = createClient(
    getEnvVar("NEXT_PUBLIC_COORDINATION_URL"),
    getEnvVar("COORDINATION_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  return _serviceClient;
}
