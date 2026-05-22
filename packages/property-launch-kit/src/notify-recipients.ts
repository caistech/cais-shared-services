/**
 * Generic recipient lookup for product notification lists.
 *
 * Each property product (Seafields, Branscombe, etc.) has its own
 * `{product}_notify_recipients` table with the same shape:
 *
 *   email       TEXT PRIMARY KEY
 *   name        TEXT
 *   active      BOOLEAN NOT NULL DEFAULT TRUE
 *   added_by    UUID
 *   added_at    TIMESTAMPTZ
 *   updated_at  TIMESTAMPTZ
 *
 * This helper centralises the read + fallback logic so per-product
 * notify modules become thin shims. Takes the Supabase client as an
 * argument so the package stays agnostic of how the consumer
 * initializes Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface GetActiveRecipientsOptions {
  /** Supabase client with service-role privileges (the table is RLS-gated
   * to super_admin reads, so an anon client will return empty). */
  supabase: SupabaseClient;
  /** Table name (e.g. "seafields_notify_recipients"). */
  table: string;
  /** Hardcoded recipients used when the table lookup fails or returns
   * empty. Ensures a misconfigured DB never strands the notification
   * path. */
  fallback: string[];
}

export async function getActiveRecipients(
  opts: GetActiveRecipientsOptions,
): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (opts.supabase.from(opts.table) as any)
      .select("email")
      .eq("active", true);
    if (error) return opts.fallback;
    const list = (data ?? []) as { email: string }[];
    if (list.length === 0) return opts.fallback;
    return list.map((r) => r.email);
  } catch {
    return opts.fallback;
  }
}
