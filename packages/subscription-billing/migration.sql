-- @caistech/subscription-billing — webhook idempotency + the columns the Supabase adapter writes.
--
-- Part 1 is required. Part 2 is a template: uncomment and set your own subscriber table name.
-- Idempotent; safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Idempotency ledger (required)
--
-- One row per Stripe event id. The reducer inserts to CLAIM an event and deletes
-- the row if the apply fails, so Stripe's retry can re-run it. Service-role only:
-- RLS is ENABLED with NO policies — anon/authenticated read nothing, the
-- service-role client bypasses RLS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    event_id         TEXT PRIMARY KEY,            -- Stripe `event.id` — the dedupe key
    event_type       TEXT NOT NULL,
    event_created_at TIMESTAMPTZ NOT NULL,        -- Stripe `event.created`
    received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_idx
    ON stripe_webhook_events(received_at);
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Subscriber columns (template — replace `your_subscriber_table`)
--
-- `last_stripe_event_at` is what enables the out-of-order guard: Stripe does not
-- guarantee delivery order, and without it an older event can overwrite newer
-- state. Omit it only if you accept last-write-wins.
--
-- Only add the columns your adapter's `columns` map actually references.
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE your_subscriber_table
--     ADD COLUMN IF NOT EXISTS subscription_status    TEXT,
--     ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
--     ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
--     ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ,
--     ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
--     ADD COLUMN IF NOT EXISTS last_stripe_event_at   TIMESTAMPTZ;
--
-- CREATE INDEX IF NOT EXISTS your_subscriber_table_stripe_customer_idx
--     ON your_subscriber_table(stripe_customer_id);
-- CREATE INDEX IF NOT EXISTS your_subscriber_table_stripe_subscription_idx
--     ON your_subscriber_table(stripe_subscription_id);
