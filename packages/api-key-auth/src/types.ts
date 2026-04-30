import type { SupabaseClient } from '@supabase/supabase-js'

export type PlanTier = 'starter' | 'pro' | 'enterprise'

export interface ApiKeyRow {
  id: string
  key_hash: string
  key_prefix: string
  customer_email: string
  plan_tier: PlanTier
  monthly_limit: number
  current_period_calls: number
  period_start: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  active: boolean
  created_at: string
  revoked_at: string | null
  last_stripe_event_at: string | null
}

export interface VerifyResult {
  ok: boolean
  key?: ApiKeyRow
  error?: string
}

export interface QuotaResult {
  ok: boolean
  remaining: number
  limit: number
  reset_at: string
  current_period_calls: number
}

export interface UsageLogInput {
  endpoint: string
  cache_hit?: boolean | null
  duration_ms?: number | null
  status_code?: number | null
}

export type SupabaseLike = Pick<SupabaseClient, 'from' | 'rpc'>
