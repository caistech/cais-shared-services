/**
 * Red Team Types
 *
 * Shared type definitions for the probe library, runner, and reporting.
 */

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

export type ProbeCategory =
  | "prompt_injection"
  | "encoding_bypass"
  | "data_exfiltration"
  | "role_hijack"
  | "tool_manipulation"
  | "instruction_override"
  | "context_window_abuse";

export type ProbeSeverity = "low" | "medium" | "high" | "critical";

export interface Probe {
  /** Unique probe ID (e.g. "PI-001") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Attack category */
  category: ProbeCategory;
  /** Expected severity if the attack succeeds */
  severity: ProbeSeverity;
  /** The attack prompt to send */
  prompt: string;
  /** System prompt context (simulates a real agent's system prompt) */
  systemPrompt?: string;
  /** Patterns that indicate the attack SUCCEEDED (model was compromised) */
  failureIndicators: RegExp[];
  /** Patterns that indicate the attack was BLOCKED (model held firm) */
  successIndicators: RegExp[];
  /** Brief description of what this probe tests */
  description: string;
  /** Reference (e.g. OWASP LLM Top 10, MITRE ATLAS technique) */
  reference?: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type ProbeVerdict = "pass" | "fail" | "inconclusive";

export interface ProbeResult {
  probe: Probe;
  verdict: ProbeVerdict;
  /** The model's actual response */
  response: string;
  /** Which failure indicators matched (if any) */
  failureMatches: string[];
  /** Which success indicators matched (if any) */
  successMatches: string[];
  /** Response time in ms */
  latencyMs: number;
  /** Timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface RedTeamRun {
  id: string;
  project_id: string;
  endpoint_id: string;
  started_at: string;
  completed_at?: string;
  total_probes: number;
  passed: number;
  failed: number;
  inconclusive: number;
  /** 0-100 security score (higher = more secure) */
  score: number;
  /** Comparison with previous run */
  regression: boolean;
  results: ProbeResult[];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export interface RegisteredEndpoint {
  id: string;
  project_id: string;
  project_name: string;
  name: string;
  /** The model call function to test */
  modelCallFn?: import("../types").ModelCallFn;
  /** Or an HTTP endpoint URL */
  url?: string;
  /** HTTP method (default POST) */
  method?: string;
  /** Custom system prompt this endpoint uses */
  systemPrompt?: string;
  /** Which probe categories to run */
  categories?: ProbeCategory[];
  /** Whether this endpoint has tool access */
  hasToolAccess: boolean;
  /** Whether this endpoint processes untrusted content */
  processesUntrustedContent: boolean;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface RedTeamReport {
  run: RedTeamRun;
  /** Grouped results by category */
  byCategory: Record<ProbeCategory, {
    total: number;
    passed: number;
    failed: number;
    inconclusive: number;
  }>;
  /** Critical failures that need immediate attention */
  criticalFailures: ProbeResult[];
  /** Comparison with last run */
  regressions: ProbeResult[];
  /** Summary text */
  summary: string;
}
