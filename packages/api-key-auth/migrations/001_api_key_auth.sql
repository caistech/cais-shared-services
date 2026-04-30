-- @caistech/api-key-auth — initial schema
-- Apply against the consumer Supabase project (e.g. property-services).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────
-- api_keys
-- ─────────────────────────────────────────────────────────────────────
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  key_prefix text not null,
  customer_email text not null,
  plan_tier text not null check (plan_tier in ('starter','pro','enterprise')),
  monthly_limit integer not null,
  current_period_calls integer not null default 0,
  period_start timestamptz not null default date_trunc('month', now()),
  stripe_customer_id text,
  stripe_subscription_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_stripe_event_at timestamptz
);

create index if not exists api_keys_key_prefix_idx on api_keys (key_prefix);
create index if not exists api_keys_stripe_customer_idx
  on api_keys (stripe_customer_id)
  where stripe_customer_id is not null;
create index if not exists api_keys_stripe_sub_idx
  on api_keys (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ─────────────────────────────────────────────────────────────────────
-- api_usage_logs
-- ─────────────────────────────────────────────────────────────────────
create table if not exists api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references api_keys(id) on delete cascade,
  endpoint text not null,
  cache_hit boolean,
  duration_ms integer,
  status_code integer,
  ts timestamptz not null default now()
);

create index if not exists api_usage_logs_key_ts_idx on api_usage_logs (api_key_id, ts desc);
create index if not exists api_usage_logs_endpoint_ts_idx on api_usage_logs (endpoint, ts desc);

-- ─────────────────────────────────────────────────────────────────────
-- stripe_webhook_events  (idempotency dedupe by event.id)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  event_created_at timestamptz not null,
  processed_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- increment_api_usage(key_id, weight)
--
-- Atomic counter increment with calendar-month rollover. Returns the
-- post-increment state so the caller can populate X-RateLimit-* headers
-- without a second query.
--
-- Behaviour:
--   - If period_start is in a previous calendar month, reset
--     current_period_calls to `weight` and bump period_start to the
--     start of the current month (rollover).
--   - Otherwise increment current_period_calls by `weight`.
--   - Inactive keys are not touched (returns no rows).
--   - monthly_limit = -1 (unlimited) is incremented same as any other —
--     the counter is kept for analytics (Decision #4).
-- ─────────────────────────────────────────────────────────────────────
create or replace function increment_api_usage(p_key_id uuid, p_weight int)
returns table (
  current_period_calls integer,
  period_start timestamptz,
  monthly_limit integer
)
language sql
as $$
  update api_keys
     set current_period_calls = case
           when date_trunc('month', period_start) < date_trunc('month', now())
             then p_weight
           else current_period_calls + p_weight
         end,
         period_start = case
           when date_trunc('month', period_start) < date_trunc('month', now())
             then date_trunc('month', now())
           else period_start
         end
   where id = p_key_id and active = true
  returning current_period_calls, period_start, monthly_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Row-level security (off by default — service-role client bypasses RLS,
-- but if a consumer wants to expose api_keys via PostgREST anon/auth they
-- must enable and write policies).
-- ─────────────────────────────────────────────────────────────────────
-- alter table api_keys          enable row level security;
-- alter table api_usage_logs    enable row level security;
-- alter table stripe_webhook_events enable row level security;
