/**
 * Security Gate — Main Orchestrator
 *
 * This is the single entry point that consuming projects use.
 * It orchestrates the full CaMeL pipeline:
 *
 *   1. Input sanitization (guardrails)
 *   2. Quarantine extraction (sandboxed LLM, no tools)
 *   3. Output validation (catch smuggled instructions)
 *   4. Policy evaluation (data provenance)
 *   5. Planner execution (privileged LLM, with tools)
 *   6. Runtime monitoring (anomaly detection, kill switch)
 *
 * Usage:
 *   const gate = createSecurityGate(config)
 *   const result = await gate.wrap({ trustedInput, untrustedInput, ... })
 */

import type {
  SecurityGateConfig,
  SecurityPolicy,
  WrapInput,
  WrapResult,
} from './types'
import { resolvePolicy, PolicyEnforcer, ProvenanceTracker } from './camel/policy-engine'
import { runQuarantine } from './camel/quarantine'
import { runPlanner } from './camel/planner'
import { ToolCallLogger } from './runtime/tool-call-logger'
import { AnomalyDetector } from './runtime/anomaly-detector'
import { KillSwitch } from './runtime/kill-switch'

export interface SecurityGate {
  /** Run the full CaMeL pipeline */
  wrap(input: WrapInput): Promise<WrapResult>

  /**
   * Lightweight mode — sanitize + validate only, no CaMeL split.
   * Use for low-risk operations where the model doesn't have tool access.
   */
  sanitizeOnly(input: string): Promise<{
    sanitized: string
    flagged: boolean
    detections: Array<{ pattern: string; severity: string }>
  }>
}

export function createSecurityGate(config: SecurityGateConfig): SecurityGate {
  const policy = resolvePolicy(config.policy)

  return {
    wrap: (input) => runGate(config, policy, input),
    sanitizeOnly: async (rawInput) => {
      const { sanitizeInput } = await import('./guardrails/input-sanitizer')
      const result = sanitizeInput(rawInput)
      return {
        sanitized: result.sanitized,
        flagged: result.flagged,
        detections: result.detectionsFound.map((d) => ({
          pattern: d.pattern,
          severity: d.severity,
        })),
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Core Pipeline
// ---------------------------------------------------------------------------

async function runGate(
  config: SecurityGateConfig,
  policy: SecurityPolicy,
  input: WrapInput
): Promise<WrapResult> {
  // Initialize runtime components
  const logger = new ToolCallLogger({
    supabase: config.supabase,
    projectId: config.projectId,
    agentId: config.agentId,
  })

  const anomalyDetector = new AnomalyDetector({
    supabase: config.supabase,
    projectId: config.projectId,
    agentId: config.agentId,
    anomalyConfig: {
      expectedTools: input.tools?.map((t) => t.name),
    },
  })

  const killSwitch = new KillSwitch({
    supabase: config.supabase,
    projectId: config.projectId,
    agentId: config.agentId,
    sessionId: logger.getSessionId(),
  })

  const provenance = new ProvenanceTracker()
  const enforcer = new PolicyEnforcer(policy, provenance)

  // Check remote kill switch before starting
  await killSwitch.checkRemote()
  if (killSwitch.isKilled()) {
    return buildKilledResult(killSwitch, provenance, enforcer)
  }

  // -----------------------------------------------------------------------
  // Phase 1: Quarantine — extract data from untrusted content
  // -----------------------------------------------------------------------

  await logger.logEvent('quarantine_start', {
    untrusted_length: input.untrustedInput.length,
    has_extraction_prompt: !!input.extractionPrompt,
  })

  const quarantineResult = await runQuarantine(config.quarantineModel, {
    untrustedContent: input.untrustedInput,
    extractionPrompt:
      input.extractionPrompt ??
      'Extract all relevant factual data, specifications, measurements, and key information from the following content. Return structured data only.',
    policy,
  })

  await logger.logEvent('quarantine_complete', {
    flagged: quarantineResult.flagged,
    detections: quarantineResult.sanitization.detectionsFound.length,
    validation_warnings: quarantineResult.validation.warnings.length,
  })

  // Tag all extracted data as untrusted
  provenance.tag('extractedData', 'untrusted', 'quarantine-output')
  provenance.tag('trustedInput', 'trusted', 'user-query')

  // -----------------------------------------------------------------------
  // Phase 2: Check kill switch after quarantine (in case of remote kill)
  // -----------------------------------------------------------------------

  killSwitch.evaluate(enforcer.getViolations(), anomalyDetector.getAlerts())
  if (killSwitch.isKilled()) {
    return buildKilledResult(killSwitch, provenance, enforcer, quarantineResult.extractedData, quarantineResult.usage)
  }

  // -----------------------------------------------------------------------
  // Phase 3: Planner — execute with tools, guided by policy engine
  // -----------------------------------------------------------------------

  if (!input.tools || input.tools.length === 0 || !config.executeToolCall) {
    // No tools — just return the quarantine extraction
    // (This is the "read-only" mode, no planner needed)
    return {
      text: quarantineResult.extractedData,
      extractedData: quarantineResult.extractedData,
      provenance: provenance.getRecords(),
      violations: enforcer.getViolations(),
      usage: {
        quarantine: quarantineResult.usage,
        planner: { inputTokens: 0, outputTokens: 0 },
      },
      killed: false,
    }
  }

  await logger.logEvent('planner_start', {
    tools: input.tools.map((t) => t.name),
    quarantine_flagged: quarantineResult.flagged,
  })

  // Wrap the tool executor with logging + anomaly detection + kill switch
  const wrappedExecutor = async (toolCall: { id: string; name: string; input: Record<string, unknown> }) => {
    // Check kill switch before each tool call
    killSwitch.evaluate(enforcer.getViolations(), anomalyDetector.getAlerts())
    if (killSwitch.isKilled()) {
      return {
        tool_call_id: toolCall.id,
        output: null,
        error: `Session terminated: ${killSwitch.getState().reason}`,
      }
    }

    const start = Date.now()
    const result = await config.executeToolCall!(toolCall)
    const duration = Date.now() - start

    // Log the tool call
    const check = enforcer.checkToolCall(toolCall, input.tools!)
    await logger.logToolCall(
      toolCall,
      result,
      check.allowed,
      provenance,
      duration,
      check.violation?.taintedFields.join(', ')
    )

    // Check for anomalies
    const events = logger.getEvents()
    const lastEvent = events[events.length - 1]
    if (lastEvent) {
      await anomalyDetector.analyze(lastEvent)
    }

    return result
  }

  const plannerResult = await runPlanner(config.plannerModel, {
    trustedInput: input.trustedInput,
    systemPrompt: input.systemPrompt,
    extractedData: quarantineResult.extractedData,
    quarantineFlagged: quarantineResult.flagged,
    tools: input.tools,
    policy,
    provenance,
    enforcer,
    executeToolCall: wrappedExecutor,
    maxTokens: input.maxTokens,
  })

  await logger.logEvent('planner_complete', {
    iterations: plannerResult.iterations,
    tool_calls_made: plannerResult.toolCallsMade.length,
    tool_calls_blocked: plannerResult.toolCallsMade.filter((t) => !t.allowed).length,
  })

  // Final kill switch check
  killSwitch.evaluate(enforcer.getViolations(), anomalyDetector.getAlerts())

  return {
    text: plannerResult.text,
    toolCalls: plannerResult.toolCallsMade.map((t) => t.call),
    extractedData: quarantineResult.extractedData,
    provenance: provenance.getRecords(),
    violations: enforcer.getViolations(),
    usage: {
      quarantine: quarantineResult.usage,
      planner: plannerResult.usage,
    },
    killed: killSwitch.isKilled(),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildKilledResult(
  killSwitch: KillSwitch,
  provenance: ProvenanceTracker,
  enforcer: PolicyEnforcer,
  extractedData?: string,
  quarantineUsage?: { inputTokens: number; outputTokens: number }
): WrapResult {
  const state = killSwitch.getState()
  return {
    text: `[SECURITY GATE: Session terminated] ${state.reason}`,
    extractedData,
    provenance: provenance.getRecords(),
    violations: enforcer.getViolations(),
    usage: {
      quarantine: quarantineUsage ?? { inputTokens: 0, outputTokens: 0 },
      planner: { inputTokens: 0, outputTokens: 0 },
    },
    killed: true,
  }
}
