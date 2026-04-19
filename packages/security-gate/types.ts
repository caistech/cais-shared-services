import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Data Provenance
// ---------------------------------------------------------------------------

/** Every piece of data flowing through the gate is tagged with its origin. */
export type DataOrigin = 'trusted' | 'untrusted'

/** A value annotated with where it came from. */
export interface TaggedValue<T = unknown> {
  value: T
  origin: DataOrigin
  /** Optional label for audit trail (e.g. "user-query", "uploaded-pdf") */
  label?: string
}

// ---------------------------------------------------------------------------
// Tool Definitions (provider-agnostic)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  tool_call_id: string
  output: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// Model Call Interface (what consuming projects provide)
// ---------------------------------------------------------------------------

/**
 * Generic model call function that the consuming project supplies.
 * This keeps the security gate provider-agnostic — it doesn't import
 * Anthropic/OpenAI SDKs directly.
 */
export interface ModelCallFn {
  (options: {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    tools?: ToolDefinition[]
    maxTokens?: number
  }): Promise<{
    text: string
    toolCalls?: ToolCall[]
    usage?: { inputTokens: number; outputTokens: number }
  }>
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export type PolicyLevel = 'strict' | 'standard' | 'permissive'

export interface PolicyRule {
  /** Tool name or '*' for all tools */
  tool: string
  /** Which origins are allowed to supply arguments to this tool */
  allowedOrigins: DataOrigin[]
  /** If true, block execution and log instead of just warning */
  enforce: boolean
}

export interface SecurityPolicy {
  level: PolicyLevel
  rules: PolicyRule[]
  /** Max iterations for the quarantined extractor */
  maxQuarantineIterations: number
  /** Max iterations for the privileged planner */
  maxPlannerIterations: number
  /** Whether to log all tool calls to Supabase */
  auditToolCalls: boolean
  /** Whether to run anomaly detection */
  detectAnomalies: boolean
}

// ---------------------------------------------------------------------------
// Security Gate Configuration
// ---------------------------------------------------------------------------

export interface SecurityGateConfig {
  /** Supabase client for logging (optional — gate works without it) */
  supabase?: SupabaseClient
  /** Platform Trust project ID for this consuming project */
  projectId: string
  /** Agent identifier (e.g. "compliance-agent", "cost-agent") */
  agentId: string
  /** The model call function for the quarantined (sandbox) LLM */
  quarantineModel: ModelCallFn
  /** The model call function for the privileged (planner) LLM */
  plannerModel: ModelCallFn
  /** Security policy — defaults to 'strict' */
  policy?: Partial<SecurityPolicy>
  /** Tool executor — consuming project provides this */
  executeToolCall?: (toolCall: ToolCall) => Promise<ToolResult>
}

// ---------------------------------------------------------------------------
// Wrap Input / Output
// ---------------------------------------------------------------------------

export interface WrapInput {
  /** Trusted input — user query, system instructions (goes to planner only) */
  trustedInput: string
  /** Untrusted input — PDFs, emails, external docs (goes to quarantine only) */
  untrustedInput: string
  /** System prompt for the planner */
  systemPrompt: string
  /** Extraction prompt for the quarantine LLM (what to pull from untrusted data) */
  extractionPrompt?: string
  /** Tools available to the planner */
  tools?: ToolDefinition[]
  /** Max tokens for model calls */
  maxTokens?: number
  /** Pass-through context (e.g. orgId, checkId) */
  context?: Record<string, unknown>
}

export interface WrapResult {
  /** The final text output from the planner */
  text: string
  /** Tool calls made during execution */
  toolCalls?: ToolCall[]
  /** Extracted data from the quarantine phase */
  extractedData?: string
  /** Data provenance map — which values came from where */
  provenance: ProvenanceRecord[]
  /** Any policy violations detected */
  violations: PolicyViolation[]
  /** Token usage across both LLMs */
  usage: {
    quarantine: { inputTokens: number; outputTokens: number }
    planner: { inputTokens: number; outputTokens: number }
  }
  /** Whether the kill switch was triggered */
  killed: boolean
}

// ---------------------------------------------------------------------------
// Provenance & Violations
// ---------------------------------------------------------------------------

export interface ProvenanceRecord {
  field: string
  origin: DataOrigin
  label?: string
  timestamp: string
}

export interface PolicyViolation {
  rule: PolicyRule
  toolCall: ToolCall
  taintedFields: string[]
  action: 'blocked' | 'warned'
  timestamp: string
}

// ---------------------------------------------------------------------------
// Runtime Events
// ---------------------------------------------------------------------------

export interface SecurityEvent {
  project_id: string
  agent_id: string
  session_id?: string
  event_type:
    | 'quarantine_start'
    | 'quarantine_complete'
    | 'planner_start'
    | 'planner_complete'
    | 'tool_call'
    | 'tool_blocked'
    | 'policy_violation'
    | 'anomaly_detected'
    | 'kill_switch'
  payload: Record<string, unknown>
  timestamp: string
}

export interface AnomalyAlert {
  project_id: string
  agent_id: string
  anomaly_type: 'unusual_tool' | 'high_frequency' | 'tainted_args' | 'iteration_limit'
  severity: 'low' | 'medium' | 'high' | 'critical'
  details: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Kill Switch
// ---------------------------------------------------------------------------

export interface KillSwitchState {
  killed: boolean
  reason?: string
  killedAt?: string
}
