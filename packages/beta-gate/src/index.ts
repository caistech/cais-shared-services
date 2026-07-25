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
  /**
   * Max cumulative COST (in your unit, typically USD) of this action for the whole trial. Use when
   * the thing you're bounding is real spend (voice minutes, LLM tokens), not a count — pass the
   * per-use cost to record()/gate() via `{ costUsd }` and this caps the sum. e.g. `{ costCap: 20 }`
   * = "up to $20 of tokens during the free month".
   */
  costCap?: number
}

export interface BetaGateConfig {
  /** Trial length in days (default 14, the SayFix window). Pass 30 for a first-month-free trial. */
  trialDays?: number
  /** How many days a review/extension adds (default 14). */
  extendDays?: number
  /** Per-action caps. Actions with no rule are unlimited (still trial-gated). */
  caps?: Record<string, CapRule>
  /**
   * Fraction of a cap at which check()/gate() set `warn: true` (default 0.8). Lets the product warn
   * the user ("you've used most of your free month") BEFORE the hard cut at the ceiling — the
   * "surface usage, don't hard-cut without warning" posture. The ceiling still hard-denies at 100%.
   */
  warnAt?: number
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

export type CapDenyReason = 'no_trial' | 'trial_expired' | 'daily_cap' | 'total_cap' | 'cost_cap'

export interface CapCheck {
  allowed: boolean
  reason?: CapDenyReason
  usedToday: number
  usedTotal: number
  /** Cumulative cost used against costCap (sum of the recorded `costUsd`). 0 when cost isn't tracked. */
  usedCost: number
  perDay?: number
  total?: number
  costCap?: number
  /**
   * How much of the tightest applicable cap is consumed, 0..1 (clamped). Drive an in-app meter with
   * this ("$14 of $20"). Max across the day/total/cost ratios that have a configured cap.
   */
  pctUsed: number
  /** True when allowed but at/over warnAt (default 0.8) — the moment to warn before the ceiling. */
  warn: boolean
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
  /** Record one use of an action. Pass `{ costUsd }` to accrue against a costCap. */
  record(subjectId: string, action: string, opts?: { costUsd?: number }): Promise<void>
  /** check() then record() if allowed — the one call most call sites want. */
  gate(subjectId: string, action: string, opts?: { costUsd?: number }): Promise<CapCheck>
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
  const warnAt = cfg.warnAt ?? 0.8
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

  async function counts(
    subjectId: string,
    action: string,
  ): Promise<{ usedToday: number; usedTotal: number; usedCost: number }> {
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
    // Sum the recorded cost for the whole trial (only needed when a costCap is set). Rows written by
    // older callers (or the migration default) carry cost_usd = 0, so this is a no-op for count-caps.
    let usedCost = 0
    const rule = caps[action] ?? {}
    if (rule.costCap != null) {
      const { data } = await supabase.from(USAGE).select('cost_usd').eq('subject_id', subjectId).eq('action', action)
      usedCost = (data ?? []).reduce((s: number, r: { cost_usd?: number | string }) => s + Number(r.cost_usd ?? 0), 0)
    }
    return { usedToday: usedToday ?? 0, usedTotal: usedTotal ?? 0, usedCost }
  }

  async function check(subjectId: string, action: string): Promise<CapCheck> {
    const trial = await ensureTrial(subjectId)
    const rule = caps[action] ?? {}
    const { usedToday, usedTotal, usedCost } = await counts(subjectId, action)

    // pctUsed = the tightest configured cap's consumption (0..1, clamped), so the UI meter tracks
    // whichever ceiling the subject is closest to hitting.
    const ratios: number[] = []
    if (rule.perDay != null && rule.perDay > 0) ratios.push(usedToday / rule.perDay)
    if (rule.total != null && rule.total > 0) ratios.push(usedTotal / rule.total)
    if (rule.costCap != null && rule.costCap > 0) ratios.push(usedCost / rule.costCap)
    const pctUsed = Math.min(1, ratios.length ? Math.max(...ratios) : 0)

    const base = {
      usedToday,
      usedTotal,
      usedCost,
      perDay: rule.perDay,
      total: rule.total,
      costCap: rule.costCap,
      pctUsed,
      warn: false,
      daysLeft: trial.daysLeft,
    }
    if (!trial.active) return { allowed: false, reason: trial.exists ? 'trial_expired' : 'no_trial', ...base }
    if (rule.perDay != null && usedToday >= rule.perDay) return { allowed: false, reason: 'daily_cap', ...base }
    if (rule.total != null && usedTotal >= rule.total) return { allowed: false, reason: 'total_cap', ...base }
    if (rule.costCap != null && usedCost >= rule.costCap) return { allowed: false, reason: 'cost_cap', ...base }
    // Allowed — flag warn once past the soft band so the product can nudge before the ceiling.
    return { allowed: true, ...base, warn: pctUsed >= warnAt }
  }

  async function record(subjectId: string, action: string, opts?: { costUsd?: number }): Promise<void> {
    const { error } = await supabase
      .from(USAGE)
      .insert({ subject_id: subjectId, action, day: todayUtc(), cost_usd: opts?.costUsd ?? 0 })
    if (error) throw new Error(`beta-gate record: ${error.message}`)
  }

  async function gate(subjectId: string, action: string, opts?: { costUsd?: number }): Promise<CapCheck> {
    const c = await check(subjectId, action)
    if (c.allowed) await record(subjectId, action, opts)
    return c
  }

  return { startTrial, ensureTrial, status, extend, convert, check, record, gate }
}
