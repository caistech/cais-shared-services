// Security Gate — @caistech/security-gate
// Single shared security pipeline for all Corporate AI Solutions projects

export { createSecurityGate } from './gate.js'
export type { SecurityGate } from './gate.js'

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
} from './types.js'

// CaMeL internals (for advanced usage)
export { resolvePolicy, ProvenanceTracker, PolicyEnforcer } from './camel/policy-engine.js'
export { runQuarantine } from './camel/quarantine.js'
export type { QuarantineResult } from './camel/quarantine.js'
export { runPlanner } from './camel/planner.js'
export type { PlannerResult } from './camel/planner.js'

// Guardrails (usable standalone)
export { sanitizeInput } from './guardrails/input-sanitizer.js'
export type { SanitizeResult, Detection } from './guardrails/input-sanitizer.js'
export { validateOutput, validateQuarantineOutput } from './guardrails/output-validator.js'
export type { ValidationResult, OutputWarning } from './guardrails/output-validator.js'

// Runtime (usable standalone)
export { ToolCallLogger } from './runtime/tool-call-logger.js'
export { AnomalyDetector } from './runtime/anomaly-detector.js'
export type { AnomalyConfig } from './runtime/anomaly-detector.js'
export { KillSwitch } from './runtime/kill-switch.js'
export type { KillSwitchConfig } from './runtime/kill-switch.js'

// Red Team (usable standalone)
export { createRedTeamRunner } from './red-team/runner.js'
export type { RedTeamRunner, RedTeamRunnerConfig } from './red-team/runner.js'
export { EndpointRegistry } from './red-team/registry.js'
export { RedTeamReporter } from './red-team/reporter.js'
export { ALL_PROBES, getProbes, getProbe, getProbeCounts } from './red-team/probes/index.js'
export type {
  Probe,
  ProbeCategory,
  ProbeResult,
  ProbeVerdict,
  RedTeamRun,
  RedTeamReport,
  RegisteredEndpoint,
} from './red-team/types.js'
