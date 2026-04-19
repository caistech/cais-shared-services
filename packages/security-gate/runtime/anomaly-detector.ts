/**
 * Anomaly Detector
 *
 * Monitors agent behavior for patterns that suggest compromise:
 * - Calling tools the agent doesn't normally call
 * - High-frequency tool calls (possible exfiltration loop)
 * - Tainted arguments reaching tool calls (policy engine should catch these,
 *   but this is a second line of defense)
 * - Hitting iteration limits (possible infinite loop injection)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { AnomalyAlert, SecurityEvent } from '../types'

export interface AnomalyConfig {
  /** Maximum tool calls per session before flagging */
  maxToolCallsPerSession: number
  /** Maximum tool calls per minute before flagging */
  maxToolCallsPerMinute: number
  /** Tools this agent is expected to use (anything else is anomalous) */
  expectedTools?: string[]
}

const DEFAULT_CONFIG: AnomalyConfig = {
  maxToolCallsPerSession: 50,
  maxToolCallsPerMinute: 20,
}

export class AnomalyDetector {
  private config: AnomalyConfig
  private supabase: SupabaseClient | null
  private projectId: string
  private agentId: string
  private alerts: AnomalyAlert[] = []
  private toolCallTimestamps: number[] = []
  private toolCallCount = 0

  constructor(config: {
    supabase?: SupabaseClient
    projectId: string
    agentId: string
    anomalyConfig?: Partial<AnomalyConfig>
  }) {
    this.supabase = config.supabase ?? null
    this.projectId = config.projectId
    this.agentId = config.agentId
    this.config = { ...DEFAULT_CONFIG, ...config.anomalyConfig }
  }

  /** Analyze a security event for anomalies */
  async analyze(event: SecurityEvent): Promise<AnomalyAlert | null> {
    switch (event.event_type) {
      case 'tool_call':
        return this.analyzeToolCall(event)
      case 'tool_blocked':
        return this.analyzeBlockedCall(event)
      default:
        return null
    }
  }

  /** Get all alerts from this session */
  getAlerts(): AnomalyAlert[] {
    return [...this.alerts]
  }

  /** Check if any critical anomalies have been detected */
  hasCriticalAnomaly(): boolean {
    return this.alerts.some((a) => a.severity === 'critical')
  }

  // -----------------------------------------------------------------------
  // Private Analysis
  // -----------------------------------------------------------------------

  private async analyzeToolCall(event: SecurityEvent): Promise<AnomalyAlert | null> {
    const now = Date.now()
    this.toolCallCount++
    this.toolCallTimestamps.push(now)

    // Prune timestamps older than 1 minute
    const oneMinuteAgo = now - 60_000
    this.toolCallTimestamps = this.toolCallTimestamps.filter((t) => t > oneMinuteAgo)

    // Check: high frequency (possible exfiltration loop)
    if (this.toolCallTimestamps.length > this.config.maxToolCallsPerMinute) {
      return this.raiseAlert({
        anomaly_type: 'high_frequency',
        severity: 'high',
        details: `Agent made ${this.toolCallTimestamps.length} tool calls in the last minute (limit: ${this.config.maxToolCallsPerMinute}). Possible exfiltration loop or runaway agent.`,
      })
    }

    // Check: session total
    if (this.toolCallCount > this.config.maxToolCallsPerSession) {
      return this.raiseAlert({
        anomaly_type: 'high_frequency',
        severity: 'critical',
        details: `Agent has made ${this.toolCallCount} total tool calls this session (limit: ${this.config.maxToolCallsPerSession}). Possible compromise.`,
      })
    }

    // Check: unusual tool
    const toolName = event.payload.tool_name as string
    if (
      this.config.expectedTools &&
      this.config.expectedTools.length > 0 &&
      !this.config.expectedTools.includes(toolName)
    ) {
      return this.raiseAlert({
        anomaly_type: 'unusual_tool',
        severity: 'medium',
        details: `Agent called tool "${toolName}" which is not in the expected set: [${this.config.expectedTools.join(', ')}].`,
      })
    }

    // Check: tainted args made it through
    const taintedArgs = event.payload.tainted_args as string[]
    if (taintedArgs && taintedArgs.length > 0) {
      return this.raiseAlert({
        anomaly_type: 'tainted_args',
        severity: 'high',
        details: `Tool call "${toolName}" has tainted arguments: [${taintedArgs.join(', ')}]. These came from untrusted sources.`,
      })
    }

    return null
  }

  private async analyzeBlockedCall(event: SecurityEvent): Promise<AnomalyAlert | null> {
    // A blocked call is already handled by the policy engine,
    // but multiple blocks in a row suggest active attack
    const recentBlocks = this.alerts.filter(
      (a) =>
        a.anomaly_type === 'tainted_args' &&
        Date.now() - new Date(a.timestamp).getTime() < 60_000
    )

    if (recentBlocks.length >= 3) {
      return this.raiseAlert({
        anomaly_type: 'tainted_args',
        severity: 'critical',
        details: `${recentBlocks.length + 1} tool calls blocked in the last minute. Active prompt injection attack likely in progress.`,
      })
    }

    return null
  }

  private async raiseAlert(
    partial: Omit<AnomalyAlert, 'project_id' | 'agent_id' | 'timestamp'>
  ): Promise<AnomalyAlert> {
    const alert: AnomalyAlert = {
      project_id: this.projectId,
      agent_id: this.agentId,
      ...partial,
      timestamp: new Date().toISOString(),
    }

    this.alerts.push(alert)

    if (this.supabase) {
      try {
        await this.supabase
          .from('security_anomalies')
          .insert(alert as never)
      } catch (err) {
        console.error('[security-gate] Failed to log anomaly:', err)
      }
    }

    return alert
  }
}
