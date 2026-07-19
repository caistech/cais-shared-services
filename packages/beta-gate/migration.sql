-- @caistech/beta-gate — beta trial clock + usage caps.
--
-- Two tables, service-role only (the gate runs server-side): the trial clock per subject, and an
-- append-only usage log the caps count against. RLS is ENABLED with NO policies — the anon/user
-- role reads nothing; the gate's service-role client bypasses RLS. Idempotent.

CREATE TABLE IF NOT EXISTS beta_trials (
    subject_id       UUID PRIMARY KEY,                       -- auth.users.id (or any subject id)
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_expires_at TIMESTAMPTZ NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'expired', 'extended', 'converted')),
    extended_count   INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS beta_trials_expiry_idx ON beta_trials(trial_expires_at);
ALTER TABLE beta_trials ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS beta_usage (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL,
    action     TEXT NOT NULL,                                -- e.g. 'asset', 'stage1', 'verticals'
    day        DATE NOT NULL DEFAULT CURRENT_DATE,           -- per-day cap bucket (UTC)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS beta_usage_lookup_idx ON beta_usage(subject_id, action, day);
ALTER TABLE beta_usage ENABLE ROW LEVEL SECURITY;
