/**
 * @caistech/beta-gate — a reusable beta trial-clock + usage-cap layer.
 *
 * Extracted from the SayFix beta model (free 14-day window, extendable by review, plus per-day /
 * total usage caps) so every product can gate a beta the same way. Supabase-injected + framework-
 * agnostic: you pass a service-role client + a caps config; it owns the trial clock and the counts.
 *
 * Wire once: apply migration.sql, then on signup call ensureTrial(userId); before any capped action
 * call gate(userId, action) — it returns { allowed, reason, daysLeft, usedToday/Total } and records
 * the usage when allowed. Show status(userId) in the UI ("N days left").
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_MS = 86_400_000

export interface CapRule {
  /** Max uses of this action per calendar day (UTC). */
  perDay?: number
  /** Max uses of this action for the whole trial. */
  total?: number
}

export interface BetaGateConfig {
  /** Trial length in days (default 14, the SayFix window). */
  trialDays?: number
  /** How many days a review/extension adds (default 14). */
  extendDays?: number
  /** Per-action caps. Actions with no rule are unlimited (still trial-gated). */
  caps?: Record<string, CapRule>
  /** Override table names if you didn't use the shipped migration defaults. */
  tables?: { trials?: string; usage?: string }
}

export interface TrialStatus {
  exists: boolean
  /** Trial is present, not expired, not converted. */
  active: boolean
  expired: boolean
  daysLeft: number
  expiresAt: string | null
  status: 'none' | 'active' | 'expired' | 'extended' | 'converted' | string
}

export type CapDenyReason = 'no_trial' | 'trial_expired' | 'daily_cap' | 'total_cap'

export interface CapCheck {
  allowed: boolean
  reason?: CapDenyReason
  usedToday: number
  usedTotal: number
  perDay?: number
  total?: number
  daysLeft: number
}

export interface BetaGate {
  /** Start the trial clock (idempotent — won't reset an existing trial). */
  startTrial(subjectId: string): Promise<TrialStatus>
  /** Start the trial if the subject has none; otherwise return the current one. */
  ensureTrial(subjectId: string): Promise<TrialStatus>
  status(subjectId: string): Promise<TrialStatus>
  /** Extend the clock (a review/manual bump). Adds to the later of now / current expiry. */
  extend(subjectId: string, days?: number): Promise<TrialStatus>
  /** Mark converted to paid — trial no longer gates. */
  convert(subjectId: string): Promise<TrialStatus>
  /** Trial + cap check WITHOUT recording. */
  check(subjectId: string, action: string): Promise<CapCheck>
  /** Record one use of an action. */
  record(subjectId: string, action: string): Promise<void>
  /** check() then record() if allowed — the one call most call sites want. */
  gate(subjectId: string, action: string): Promise<CapCheck>
}

/** Whole days remaining until an expiry (0 if past/absent). */
export function daysLeft(expiresAt: string | Date | null | undefined): number {
  if (!expiresAt) return 0
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / DAY_MS))
}

const todayUtc = () => new Date().toISOString().slice(0, 10)

export function createBetaGate(deps: { supabase: SupabaseClient; config?: BetaGateConfig }): BetaGate {
  const { supabase } = deps
  const cfg = deps.config ?? {}
  const trialDays = cfg.trialDays ?? 14
  const extendDays = cfg.extendDays ?? 14
  const caps = cfg.caps ?? {}
  const TRIALS = cfg.tables?.trials ?? 'beta_trials'
  const USAGE = cfg.tables?.usage ?? 'beta_usage'

  async function fetchRow(subjectId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.from(TRIALS).select('*').eq('subject_id', subjectId).maybeSingle()
    if (error) throw new Error(`beta-gate fetch: ${error.message}`)
    return (data as Record<string, unknown>) ?? null
  }

  function toStatus(row: Record<string, unknown> | null): TrialStatus {
    if (!row) return { exists: false, active: false, expired: false, daysLeft: 0, expiresAt: null, status: 'none' }
    const expiresAt = (row.trial_expires_at as string) ?? null
    const status = (row.status as string) ?? 'active'
    const dl = daysLeft(expiresAt)
    const expired = dl <= 0 && status !== 'converted'
    return { exists: true, active: status === 'converted' ? true : dl > 0, expired, daysLeft: dl, expiresAt, status }
  }

  async function status(subjectId: string): Promise<TrialStatus> {
    return toStatus(await fetchRow(subjectId))
  }

  async function startTrial(subjectId: string): Promise<TrialStatus> {
    const nowIso = new Date().toISOString()
    const expiresIso = new Date(Date.now() + trialDays * DAY_MS).toISOString()
    const { error } = await supabase
      .from(TRIALS)
      .upsert(
        { subject_id: subjectId, trial_started_at: nowIso, trial_expires_at: expiresIso, status: 'active' },
        { onConflict: 'subject_id', ignoreDuplicates: true },
      )
    if (error) throw new Error(`beta-gate startTrial: ${error.message}`)
    return status(subjectId)
  }

  async function ensureTrial(subjectId: string): Promise<TrialStatus> {
    const row = await fetchRow(subjectId)
    return row ? toStatus(row) : startTrial(subjectId)
  }

  async function extend(subjectId: string, days = extendDays): Promise<TrialStatus> {
    const row = await fetchRow(subjectId)
    const current = row?.trial_expires_at ? new Date(row.trial_expires_at as string).getTime() : 0
    const base = Math.max(current, Date.now())
    const expiresIso = new Date(base + days * DAY_MS).toISOString()
    const extendedCount = ((row?.extended_count as number) ?? 0) + 1
    const { error } = await supabase
      .from(TRIALS)
      .upsert(
        { subject_id: subjectId, trial_expires_at: expiresIso, status: 'extended', extended_count: extendedCount },
        { onConflict: 'subject_id' },
      )
    if (error) throw new Error(`beta-gate extend: ${error.message}`)
    return status(subjectId)
  }

  async function convert(subjectId: string): Promise<TrialStatus> {
    const { error } = await supabase.from(TRIALS).update({ status: 'converted' }).eq('subject_id', subjectId)
    if (error) throw new Error(`beta-gate convert: ${error.message}`)
    return status(subjectId)
  }

  async function counts(subjectId: string, action: string): Promise<{ usedToday: number; usedTotal: number }> {
    const { count: usedToday } = await supabase
      .from(USAGE)
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId)
      .eq('action', action)
      .eq('day', todayUtc())
    const { count: usedTotal } = await supabase
      .from(USAGE)
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId)
      .eq('action', action)
    return { usedToday: usedToday ?? 0, usedTotal: usedTotal ?? 0 }
  }

  async function check(subjectId: string, action: string): Promise<CapCheck> {
    const trial = await ensureTrial(subjectId)
    const rule = caps[action] ?? {}
    const { usedToday, usedTotal } = await counts(subjectId, action)
    const base = { usedToday, usedTotal, perDay: rule.perDay, total: rule.total, daysLeft: trial.daysLeft }
    if (!trial.active) return { allowed: false, reason: trial.exists ? 'trial_expired' : 'no_trial', ...base }
    if (rule.perDay != null && usedToday >= rule.perDay) return { allowed: false, reason: 'daily_cap', ...base }
    if (rule.total != null && usedTotal >= rule.total) return { allowed: false, reason: 'total_cap', ...base }
    return { allowed: true, ...base }
  }

  async function record(subjectId: string, action: string): Promise<void> {
    const { error } = await supabase.from(USAGE).insert({ subject_id: subjectId, action, day: todayUtc() })
    if (error) throw new Error(`beta-gate record: ${error.message}`)
  }

  async function gate(subjectId: string, action: string): Promise<CapCheck> {
    const c = await check(subjectId, action)
    if (c.allowed) await record(subjectId, action)
    return c
  }

  return { startTrial, ensureTrial, status, extend, convert, check, record, gate }
}
