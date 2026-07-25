// The Supabase-backed suppression store — the durable half of an opt-out.
//
// Suppression is a STATE, not a deletion. Deleting a contact who unsubscribed feels tidy and is
// wrong: the next list import brings them straight back, and nothing in the system remembers they
// asked you to stop. A row that says "this address opted out, on this date, for this reason"
// survives re-imports, migrations and account deletion — which is precisely the point.
//
// Optional: the client is injected, so this module only loads if you use it.

import type { SuppressionReason, SuppressionStore } from "./consent.js";
import { normaliseEmail } from "./consent.js";

/** The slice of a Supabase client this needs — avoids a hard dep on @supabase/supabase-js. */
export interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> };
    };
    upsert(
      values: Record<string, unknown>,
      options?: { onConflict?: string },
    ): Promise<{ error: { message: string; code?: string } | null }>;
    delete(): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

export interface SupabaseSuppressionOptions {
  supabase: SupabaseLike;
  /** Defaults to `email_suppressions` (see migration.sql). */
  table?: string;
}

export function createSupabaseSuppressionStore(
  options: SupabaseSuppressionOptions,
): SuppressionStore {
  const table = options.table ?? "email_suppressions";
  const { supabase } = options;

  return {
    async isSuppressed(email: string): Promise<boolean> {
      const { data, error } = await supabase
        .from(table)
        .select("email")
        .eq("email", normaliseEmail(email))
        .maybeSingle();

      if (error) {
        // FAIL CLOSED. If we cannot tell whether someone opted out, we must not send. Treating an
        // outage as "probably fine to mail them" is how a compliance breach happens quietly.
        throw new Error(`suppression lookup failed: ${error.message}`);
      }
      return data !== null;
    },

    async suppress(email: string, reason: SuppressionReason, detail?: string): Promise<void> {
      const { error } = await supabase.from(table).upsert(
        {
          email: normaliseEmail(email),
          reason,
          detail: detail ?? null,
          suppressed_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );
      // Idempotent: people click unsubscribe twice, and a duplicate must not surface as a failure.
      if (error) throw new Error(`suppress failed: ${error.message}`);
    },

    async resubscribe(email: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq("email", normaliseEmail(email));
      if (error) throw new Error(`resubscribe failed: ${error.message}`);
    },
  };
}
