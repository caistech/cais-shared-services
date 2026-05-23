/**
 * Daily-digest cron route helper. Wraps the common shape of a Next.js
 * route that:
 *   1. Authorises the Vercel cron via Bearer CRON_SECRET
 *   2. Resolves recipients from the product's notify table
 *   3. Runs product-specific count queries
 *   4. Renders the branded digest email and sends via Resend
 *   5. Returns a 200 with the counts JSON for log-grep / debugging
 *
 * The product-specific bits (which tables to read, what counts mean)
 * are injected as a callback. The kit handles the auth + render + send
 * pipeline.
 *
 * Usage in a Next.js route:
 *
 *   import { createDailyDigestHandler } from "@caistech/property-launch-kit";
 *   import { getActiveRecipients, renderBrandedEmail } from "@/lib/<product>/notify";
 *   import { createSupabaseService } from "@/lib/supabase-service";
 *
 *   export const GET = createDailyDigestHandler({
 *     subjectPrefix: "<Product> digest",
 *     // adminUrl is required — pass YOUR product's admin URL, e.g.
 *     // "https://your-app.example.com/admin/<product>-registrations"
 *     adminUrl: process.env.ADMIN_URL!,
 *     getRecipients: getActiveRecipients,
 *     renderEmail: renderBrandedEmail,
 *     fromAddress: process.env.RESEND_FROM_EMAIL ||
 *       "<Product Display Name> <onboarding@resend.dev>",
 *     resendApiKey: process.env.RESEND_API_KEY!,
 *     cronSecret: process.env.CRON_SECRET,
 *     gatherCounts: async () => {
 *       const supabase = createSupabaseService();
 *       // ... your product-specific queries
 *       return {
 *         rows: [
 *           { label: "New registrations (24h)", value: "<strong>3</strong>" },
 *           ...
 *         ],
 *         headlinePhrase: "3 new, 1 sold",
 *         counts: { new_registrations: 3, sold_today: 1 },
 *       };
 *     },
 *   });
 */

import type { RenderArgs } from "./branded-email.js";

export interface DailyDigestCounts {
  /** The email body rows — label/value pairs rendered by the kit. */
  rows: RenderArgs["rows"];
  /** Short summary phrase used in the email subject (e.g. "3 new, 1 sold"). */
  headlinePhrase: string;
  /** Counts JSON returned in the response body for log-grep / debugging. */
  counts: Record<string, number | string>;
}

export interface CreateDailyDigestHandlerOptions {
  /** Email subject prefix (e.g. "Seafields digest"). */
  subjectPrefix: string;
  /** Admin URL used as the "Open admin" CTA in the email. */
  adminUrl: string;
  /** Resolves the active recipient list. Falls back internally on
   * empty/error per the product shim. */
  getRecipients: () => Promise<string[]>;
  /** Renders the branded email body. */
  renderEmail: (args: RenderArgs) => string;
  /** Resend From address (RESEND_FROM_EMAIL or fallback). */
  fromAddress: string;
  /** Resend API key. */
  resendApiKey: string;
  /** CRON_SECRET for auth — when undefined and not running on Vercel,
   * the route is open (local dev). When undefined on Vercel, 403. */
  cronSecret: string | undefined;
  /** Product-specific query callback. Returns rows + headline + counts. */
  gatherCounts: () => Promise<DailyDigestCounts>;
  /** Optional override for the email heading prefix. Defaults to the
   * subjectPrefix value. */
  headingPrefix?: string;
  /** Optional override for the email intro line. */
  intro?: string;
  /** Optional override for the footer copy. */
  footer?: string;
  /** Optional IANA timezone used to format the date in the heading
   * (e.g. "Australia/Perth"). Defaults to UTC. */
  dateTimezone?: string;
}

/**
 * Returns a Next.js-style GET route handler.
 */
export function createDailyDigestHandler(
  opts: CreateDailyDigestHandlerOptions,
): (req: Request) => Promise<Response> {
  if (!opts.adminUrl || typeof opts.adminUrl !== "string" || opts.adminUrl.trim() === "") {
    throw new Error(
      "@caistech/property-launch-kit: createDailyDigestHandler({ adminUrl }) " +
      "requires a non-empty adminUrl. Pass YOUR product's admin URL (e.g., " +
      "'https://your-app.example.com/admin/<product>-registrations'). The " +
      "package ships no default — BYOK consumers must point the digest's " +
      '"Open admin" CTA at their own admin surface.',
    );
  }
  return async function GET(req: Request): Promise<Response> {
    if (!isAuthorised(req, opts.cronSecret)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    let countsResult: DailyDigestCounts;
    try {
      countsResult = await opts.gatherCounts();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Daily digest gatherCounts threw:", err);
      return jsonResponse(
        { ok: false, error: "gatherCounts threw" },
        500,
      );
    }

    const now = new Date();
    const dateLabel = now.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: opts.dateTimezone,
    });

    const headingPrefix = opts.headingPrefix ?? opts.subjectPrefix;
    const html = opts.renderEmail({
      preheader: `${opts.subjectPrefix} — ${countsResult.headlinePhrase}`,
      heading: `${headingPrefix} — ${dateLabel}`,
      intro:
        opts.intro ??
        "Activity in the last 24 hours and the current state of the product.",
      rows: countsResult.rows,
      ctaLabel: "Open admin",
      ctaHref: opts.adminUrl,
      footer:
        opts.footer ??
        "Daily digest sent every morning. Manage recipients from the admin panel.",
    });

    try {
      const recipients = await opts.getRecipients();
      if (recipients.length > 0) {
        // Dynamic import keeps Resend out of the bundle when this
        // helper is imported in a context that doesn't need it.
        const { Resend } = await import("resend");
        const resend = new Resend(opts.resendApiKey);
        await resend.emails.send({
          from: opts.fromAddress,
          to: recipients,
          subject: `${opts.subjectPrefix} — ${countsResult.headlinePhrase}`,
          html,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Daily digest send failed:", err);
      return jsonResponse(
        { ok: false, error: "Send failed", counts: countsResult.counts },
        500,
      );
    }

    return jsonResponse({ ok: true, counts: countsResult.counts }, 200);
  };
}

function isAuthorised(req: Request, expected: string | undefined): boolean {
  if (!expected) {
    // No secret configured. Local dev (not on Vercel) → allow.
    return !process.env.VERCEL;
  }
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${expected}`;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** SQL DDL template for a per-product notify-recipients table. Each
 * consumer pastes this into a new migration and replaces `{product}`
 * with their product slug (e.g. `marina_bay`). */
export const NOTIFY_RECIPIENTS_MIGRATION_TEMPLATE = `-- Notify-recipients table for the {product} product.
-- Follows the @caistech/property-launch-kit conventions. After this
-- runs, the product's notify shim (src/lib/{product}/notify.ts) and
-- API route (src/app/api/admin/{product}/notify-recipients/route.ts)
-- can read/write recipients here.

CREATE TABLE IF NOT EXISTS {product}_notify_recipients (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  added_by    UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS {product}_notify_active_idx
  ON {product}_notify_recipients (active) WHERE active = TRUE;

ALTER TABLE {product}_notify_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = '{product}_notify_recipients'
      AND policyname = '{product}_notify_super_admin_only'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY {product}_notify_super_admin_only
        ON {product}_notify_recipients
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM admin_users
            WHERE admin_users.id = auth.uid()
              AND admin_users.role = 'super_admin'
          )
        )
    $policy$;
  END IF;
END $$;

-- Seed with at least one recipient so the fallback never kicks in
-- on a freshly-set-up product:
INSERT INTO {product}_notify_recipients (email, name, active)
VALUES
  ('REPLACE@example.com', 'Replace with real owner', TRUE)
ON CONFLICT (email) DO NOTHING;
`;
