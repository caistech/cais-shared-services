-- MCP telemetry — install / call / engagement tracking.
--
-- Per Phase 1 build plan. No PII captured at install or in mcp_call.
-- First PII (email) is collected only at the interview step, with
-- explicit consent — mcp_engagement.routing_payload holds it then.
--
-- Idempotent: re-running this migration is safe.

create table if not exists mcp_install (
    install_id uuid primary key default gen_random_uuid(),
    mcp_name text not null,
    installed_at timestamptz not null default now(),
    user_agent text,
    opted_in_telemetry boolean not null default true
);

create index if not exists mcp_install_mcp_name_idx on mcp_install (mcp_name);
create index if not exists mcp_install_installed_at_idx on mcp_install (installed_at desc);

create table if not exists mcp_call (
    call_id uuid primary key default gen_random_uuid(),
    install_id uuid references mcp_install(install_id) on delete cascade,
    mcp_name text not null,
    tool_name text not null,
    called_at timestamptz not null default now(),
    duration_ms integer,
    status text not null check (status in ('ok', 'error', 'rate_limited')),
    credential_source text check (credential_source in ('headers', 'env', 'merged', 'none'))
);

create index if not exists mcp_call_install_idx on mcp_call (install_id);
create index if not exists mcp_call_called_at_idx on mcp_call (called_at desc);
create index if not exists mcp_call_tool_name_idx on mcp_call (tool_name);
create index if not exists mcp_call_status_idx on mcp_call (status);

create table if not exists mcp_engagement (
    install_id uuid primary key references mcp_install(install_id) on delete cascade,
    prompted_at timestamptz,
    interview_started_at timestamptz,
    interview_completed_at timestamptz,
    routing text check (routing in ('connexions', 'prelabz', 'data_only')),
    routing_payload jsonb
);

create index if not exists mcp_engagement_prompted_at_idx on mcp_engagement (prompted_at desc nulls last);
create index if not exists mcp_engagement_routing_idx on mcp_engagement (routing);

-- RLS — MCP server uses the service role key, so RLS is effectively bypassed
-- for our writes. Enable RLS anyway so accidental anon-key access denies by
-- default. Drop-only-via-service-role.
alter table mcp_install enable row level security;
alter table mcp_call enable row level security;
alter table mcp_engagement enable row level security;

comment on table mcp_install is 'One row per anonymous MCP install. No PII at install time.';
comment on table mcp_call is 'One row per tool invocation. Duration + status only; no arguments or results captured.';
comment on table mcp_engagement is 'Funnel state per install. PII (email + interview payload) lands here only after explicit consent at the interview step.';
