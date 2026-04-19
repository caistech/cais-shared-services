/**
 * Tool Call Logger
 *
 * Logs every tool invocation with full provenance — which agent called it,
 * what arguments were used, where the arguments came from (trusted/untrusted),
 * and the result. Writes to Platform Trust Supabase for cross-project visibility.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { SecurityEvent, ToolCall, ToolResult } from '../types'
import type { ProvenanceTracker } from '../camel/policy-engine'

export interface ToolCallLogEntry {
  project_id: string
  agent_id: string
  session_id?: string
  tool_name: string
  tool_input_hash: string
  tainted_args: string[]
  allowed: boolean
  blocked_reason?: string
  duration_ms: number
  timestamp: string
}

function hashInput(input: Record<string, unknown>): string {
  const json = JSON.stringify(input)
  // Simple hash for logging — not cryptographic
  let hash = 0
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `h:${Math.abs(hash).toString(36)}`
}

export class ToolCallLogger {
  private supabase: SupabaseClient | null
  private projectId: string
  private agentId: string
  private sessionId: string
  private buffer: SecurityEvent[] = []

  constructor(config: {
    supabase?: SupabaseClient
    projectId: string
    agentId: string
    sessionId?: string
  }) {
    this.supabase = config.supabase ?? null
    this.projectId = config.projectId
    this.agentId = config.agentId
    this.sessionId = config.sessionId ?? crypto.randomUUID()
  }

  /** Log a tool call event */
  async logToolCall(
    toolCall: ToolCall,
    result: ToolResult,
    allowed: boolean,
    provenance: ProvenanceTracker,
    durationMs: number,
    blockedReason?: string
  ): Promise<void> {
    const event: SecurityEvent = {
      project_id: this.projectId,
      agent_id: this.agentId,
      session_id: this.sessionId,
      event_type: allowed ? 'tool_call' : 'tool_blocked',
      payload: {
        tool_name: toolCall.name,
        input_hash: hashInput(toolCall.input),
        tainted_args: Object.keys(toolCall.input).filter((k) =>
          provenance.isTainted(k)
        ),
        allowed,
        blocked_reason: blockedReason,
        duration_ms: durationMs,
        has_error: !!result.error,
      },
      timestamp: new Date().toISOString(),
    }

    this.buffer.push(event)
    await this.flush(event)
  }

  /** Log a lifecycle event (quarantine start/end, planner start/end) */
  async logEvent(
    eventType: SecurityEvent['event_type'],
    payload: Record<string, unknown> = {}
  ): Promise<void> {
    const event: SecurityEvent = {
      project_id: this.projectId,
      agent_id: this.agentId,
      session_id: this.sessionId,
      event_type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    }

    this.buffer.push(event)
    await this.flush(event)
  }

  /** Get all events from this session (for in-memory use without Supabase) */
  getEvents(): SecurityEvent[] {
    return [...this.buffer]
  }

  /** Get session ID */
  getSessionId(): string {
    return this.sessionId
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async flush(event: SecurityEvent): Promise<void> {
    if (!this.supabase) return

    try {
      await this.supabase
        .from('security_gate_events')
        .insert(event as never)
    } catch (err) {
      // Non-blocking — don't let logging failures break the pipeline
      console.error('[security-gate] Failed to log event:', err)
    }
  }
}
