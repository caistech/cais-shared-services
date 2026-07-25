-- @caistech/email-compliance — the durable opt-out record.
--
-- Suppression is a STATE, not a deletion. Deleting a contact who unsubscribed feels tidy and is
-- wrong: the next list import brings them straight back and nothing remembers they asked you to
-- stop. This row survives re-imports, migrations, and account deletion — which is the point.
--
-- Keyed by EMAIL, not user id, deliberately: someone who unsubscribes, deletes their account and
-- signs up again with the same address has still told you to stop.
--
-- Service-role only: RLS ENABLED with NO policies. The send path runs server-side; anon and
-- authenticated read nothing (the list of who left is not public), and the service-role client
-- bypasses RLS.
--
-- Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS email_suppressions (
    email         TEXT PRIMARY KEY,                    -- normalised: trimmed + lower-cased
    reason        TEXT NOT NULL DEFAULT 'unsubscribe'
                  CHECK (reason IN ('unsubscribe', 'bounce', 'complaint', 'manual')),
    detail        TEXT,                                -- e.g. the provider's bounce message
    suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_suppressions_suppressed_at_idx
    ON email_suppressions(suppressed_at);

ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE email_suppressions IS
  'Durable opt-out list (Spam Act pillar 3). Consulted by the send path before every commercial send. A row here means DO NOT MAIL, regardless of what any user-level flag says.';
