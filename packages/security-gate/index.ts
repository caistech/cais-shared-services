// Security Gate — @caistech/security-gate
// Single shared security pipeline for all Corporate AI Solutions projects

export { createSecurityGate } from './gate'
export type { SecurityGate } from './gate'

// Types
export type {
  SecurityGateConfig,
  WrapInput,
  WrapResult,
  ModelCallFn,
  ToolDefinition,
  ToolCall,
  ToolResult,
  PolicyLevel,
  PolicyRule,
  SecurityPolicy,
  DataOrigin,
  TaggedValue,
  ProvenanceRecord,
  PolicyViolation,
  SecurityEvent,
  AnomalyAlert,
  KillSwitchState,
} from './types'

// CaMeL internals (for advanced usage)
export { resolvePolicy, ProvenanceTracker, PolicyEnforcer } from './camel/policy-engine'
export { runQuarantine } from './camel/quarantine'
export type { QuarantineResult } from './camel/quarantine'
export { runPlanner } from './camel/planner'
export type { PlannerResult } from './camel/planner'

// Guardrails (usable standalone)
export { sanitizeInput } from './guardrails/input-sanitizer'
export type { SanitizeResult, Detection } from './guardrails/input-sanitizer'
export { validateOutput, validateQuarantineOutput } from './guardrails/output-validator'
export type { ValidationResult, OutputWarning } from './guardrails/output-validator'

// Runtime (usable standalone)
export { ToolCallLogger } from './runtime/tool-call-logger'
export { AnomalyDetector } from './runtime/anomaly-detector'
export type { AnomalyConfig } from './runtime/anomaly-detector'
export { KillSwitch } from './runtime/kill-switch'
export type { KillSwitchConfig } from './runtime/kill-switch'

// Red Team (usable standalone)
export { createRedTeamRunner } from './red-team/runner'
export type { RedTeamRunner, RedTeamRunnerConfig } from './red-team/runner'
export { EndpointRegistry } from './red-team/registry'
export { RedTeamReporter } from './red-team/reporter'
export { ALL_PROBES, getProbes, getProbe, getProbeCounts } from './red-team/probes'
export type {
  Probe,
  ProbeCategory,
  ProbeResult,
  ProbeVerdict,
  RedTeamRun,
  RedTeamReport,
  RegisteredEndpoint,
} from './red-team/types'
