/**
 * Kill Switch
 *
 * Emergency shutdown for an agent session. Triggered when:
 * - Anomaly detector finds a critical anomaly
 * - Too many policy violations in a session
 * - Manual override from Platform Trust dashboard
 *
 * When killed, all subsequent tool calls are blocked and the
 * session is logged as terminated.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { KillSwitchState, AnomalyAlert, PolicyViolation } from '../types'

export interface KillSwitchConfig {
  /** Auto-kill after this many policy violations */
  maxViolations: number
  /** Auto-kill on any critical anomaly */
  killOnCriticalAnomaly: boolean
  /** Check remote kill switch (dashboard override) */
  checkRemote: boolean
}

const DEFAULT_CONFIG: KillSwitchConfig = {
  maxViolations: 5,
  killOnCriticalAnomaly: true,
  checkRemote: true,
}

export class KillSwitch {
  private state: KillSwitchState = { killed: false }
  private config: KillSwitchConfig
  private supabase: SupabaseClient | null
  private projectId: string
  private agentId: string
  private sessionId: string

  constructor(config: {
    supabase?: SupabaseClient
    projectId: string
    agentId: string
    sessionId: string
    killConfig?: Partial<KillSwitchConfig>
  }) {
    this.supabase = config.supabase ?? null
    this.projectId = config.projectId
    this.agentId = config.agentId
    this.sessionId = config.sessionId
    this.config = { ...DEFAULT_CONFIG, ...config.killConfig }
  }

  /** Check if the session has been killed */
  isKilled(): boolean {
    return this.state.killed
  }

  /** Get current kill switch state */
  getState(): KillSwitchState {
    return { ...this.state }
  }

  /** Manually trigger the kill switch */
  kill(reason: string): void {
    this.state = {
      killed: true,
      reason,
      killedAt: new Date().toISOString(),
    }
    this.logKill()
  }

  /** Evaluate whether to trigger based on current violations and anomalies */
  evaluate(violations: PolicyViolation[], anomalies: AnomalyAlert[]): void {
    if (this.state.killed) return

    // Check violation threshold
    if (violations.length >= this.config.maxViolations) {
      this.kill(
        `Exceeded maximum policy violations (${violations.length}/${this.config.maxViolations})`
      )
      return
    }

    // Check critical anomalies
    if (this.config.killOnCriticalAnomaly) {
      const critical = anomalies.find((a) => a.severity === 'critical')
      if (critical) {
        this.kill(`Critical anomaly detected: ${critical.details}`)
        return
      }
    }
  }

  /**
   * Check remote kill switch — allows the Platform Trust dashboard
   * to remotely terminate an agent session.
   */
  async checkRemote(): Promise<void> {
    if (!this.config.checkRemote || !this.supabase || this.state.killed) return

    try {
      const { data } = await this.supabase
        .from('security_gate_kill_switch')
        .select('killed, reason')
        .eq('project_id', this.projectId)
        .eq('agent_id', this.agentId)
        .eq('session_id', this.sessionId)
        .single()

      if (data?.killed) {
        this.state = {
          killed: true,
          reason: data.reason || 'Remote kill switch activated',
          killedAt: new Date().toISOString(),
        }
      }
    } catch {
      // If we can't check remote, continue (fail-open for remote check only)
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async logKill(): Promise<void> {
    console.error(
      `[security-gate] KILL SWITCH ACTIVATED for ${this.agentId}@${this.projectId}: ${this.state.reason}`
    )

    if (!this.supabase) return

    try {
      await this.supabase.from('security_gate_events').insert({
        project_id: this.projectId,
        agent_id: this.agentId,
        session_id: this.sessionId,
        event_type: 'kill_switch',
        payload: {
          reason: this.state.reason,
          killed_at: this.state.killedAt,
        },
        timestamp: new Date().toISOString(),
      } as never)
    } catch (err) {
      console.error('[security-gate] Failed to log kill switch event:', err)
    }
  }
}
