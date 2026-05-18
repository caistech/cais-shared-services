-- MCP nudge log — one row per (install, nudge_kind) ensuring each
-- follow-up email fires at most once.
--
-- Driven by /api/cron/nudge in cais-interview-agent. Day 3 / Day 14 /
-- Day 30 cadence, all measured from mcp_engagement.interview_completed_at.
-- The 'welcome' kind is recorded for completeness even though it's sent
-- inline by the submit action, not the cron.
--
-- Idempotent migration.

create table if not exists mcp_nudge (
    nudge_id uuid primary key default gen_random_uuid(),
    install_id uuid not null references mcp_install(install_id) on delete cascade,
    nudge_kind text not null check (nudge_kind in ('welcome', 'day3', 'day14', 'day30')),
    sent_at timestamptz not null default now(),
    resend_id text,
    error_message text
);

create unique index if not exists mcp_nudge_install_kind_uidx
    on mcp_nudge (install_id, nudge_kind);

create index if not exists mcp_nudge_sent_at_idx
    on mcp_nudge (sent_at desc);

alter table mcp_nudge enable row level security;

comment on table mcp_nudge is
    'One row per (install, follow-up kind). Unique constraint guarantees each nudge ships at most once. error_message captures Resend failures for retry/debugging.';
