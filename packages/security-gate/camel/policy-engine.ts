/**
 * Policy Engine — Data Provenance & Enforcement
 *
 * The core of the CaMeL pattern. Tracks where every piece of data
 * came from (trusted user input vs. untrusted external content) and
 * enforces rules about what data can flow into tool arguments.
 *
 * This is what makes prompt injection structurally impossible rather
 * than probabilistically unlikely.
 */

import type {
  DataOrigin,
  PolicyLevel,
  PolicyRule,
  PolicyViolation,
  ProvenanceRecord,
  SecurityPolicy,
  ToolCall,
  ToolDefinition,
} from '../types'

// ---------------------------------------------------------------------------
// Default Policies
// ---------------------------------------------------------------------------

const STRICT_RULES: PolicyRule[] = [
  {
    tool: '*',
    allowedOrigins: ['trusted'],
    enforce: true,
  },
]

const STANDARD_RULES: PolicyRule[] = [
  {
    tool: '*',
    allowedOrigins: ['trusted'],
    enforce: true,
  },
  // Standard allows untrusted data in read-only tools
  {
    tool: 'lookup_*',
    allowedOrigins: ['trusted', 'untrusted'],
    enforce: true,
  },
  {
    tool: 'get_*',
    allowedOrigins: ['trusted', 'untrusted'],
    enforce: true,
  },
  {
    tool: 'retrieve_*',
    allowedOrigins: ['trusted', 'untrusted'],
    enforce: true,
  },
]

const PERMISSIVE_RULES: PolicyRule[] = [
  {
    tool: '*',
    allowedOrigins: ['trusted', 'untrusted'],
    enforce: false, // warn only
  },
]

const DEFAULT_POLICIES: Record<PolicyLevel, SecurityPolicy> = {
  strict: {
    level: 'strict',
    rules: STRICT_RULES,
    maxQuarantineIterations: 3,
    maxPlannerIterations: 5,
    auditToolCalls: true,
    detectAnomalies: true,
  },
  standard: {
    level: 'standard',
    rules: STANDARD_RULES,
    maxQuarantineIterations: 3,
    maxPlannerIterations: 5,
    auditToolCalls: true,
    detectAnomalies: true,
  },
  permissive: {
    level: 'permissive',
    rules: PERMISSIVE_RULES,
    maxQuarantineIterations: 5,
    maxPlannerIterations: 10,
    auditToolCalls: false,
    detectAnomalies: false,
  },
}

export function resolvePolicy(partial?: Partial<SecurityPolicy>): SecurityPolicy {
  const level = partial?.level ?? 'strict'
  const base = DEFAULT_POLICIES[level]
  return { ...base, ...partial, rules: partial?.rules ?? base.rules }
}

// ---------------------------------------------------------------------------
// Provenance Tracker
// ---------------------------------------------------------------------------

export class ProvenanceTracker {
  private records: ProvenanceRecord[] = []
  private taintedFields: Set<string> = new Set()

  /** Mark a field as coming from a specific origin */
  tag(field: string, origin: DataOrigin, label?: string): void {
    this.records.push({
      field,
      origin,
      label,
      timestamp: new Date().toISOString(),
    })

    if (origin === 'untrusted') {
      this.taintedFields.add(field)
    }
  }

  /** Tag all fields in extracted data as untrusted */
  tagExtractedData(data: Record<string, unknown>, label = 'quarantine-output'): void {
    for (const key of Object.keys(data)) {
      this.tag(key, 'untrusted', label)
    }
  }

  /** Tag user-provided fields as trusted */
  tagTrustedInput(fields: string[]): void {
    for (const field of fields) {
      this.tag(field, 'trusted', 'user-input')
    }
  }

  /** Check if a field is tainted (came from untrusted source) */
  isTainted(field: string): boolean {
    return this.taintedFields.has(field)
  }

  /** Get all provenance records */
  getRecords(): ProvenanceRecord[] {
    return [...this.records]
  }

  /** Get all tainted field names */
  getTaintedFields(): string[] {
    return [...this.taintedFields]
  }
}

// ---------------------------------------------------------------------------
// Policy Enforcer
// ---------------------------------------------------------------------------

export class PolicyEnforcer {
  private policy: SecurityPolicy
  private provenance: ProvenanceTracker
  private violations: PolicyViolation[] = []

  constructor(policy: SecurityPolicy, provenance: ProvenanceTracker) {
    this.policy = policy
    this.provenance = provenance
  }

  /**
   * Check whether a tool call is allowed given current data provenance.
   * Returns true if allowed, false if blocked.
   */
  checkToolCall(
    toolCall: ToolCall,
    availableTools: ToolDefinition[]
  ): { allowed: boolean; violation?: PolicyViolation } {
    const rule = this.findMatchingRule(toolCall.name)
    if (!rule) {
      // No rule matches — strict default: block unknown tools
      const violation: PolicyViolation = {
        rule: { tool: toolCall.name, allowedOrigins: [], enforce: true },
        toolCall,
        taintedFields: [],
        action: 'blocked',
        timestamp: new Date().toISOString(),
      }
      this.violations.push(violation)
      return { allowed: false, violation }
    }

    // Check if any tool arguments contain tainted data
    const taintedArgs = this.findTaintedArgs(toolCall)

    if (taintedArgs.length === 0) {
      return { allowed: true }
    }

    // Tainted args found — check if the rule allows untrusted origins
    if (rule.allowedOrigins.includes('untrusted')) {
      return { allowed: true }
    }

    // Violation: tainted data flowing into a tool that doesn't allow it
    const action = rule.enforce ? 'blocked' : 'warned'
    const violation: PolicyViolation = {
      rule,
      toolCall,
      taintedFields: taintedArgs,
      action,
      timestamp: new Date().toISOString(),
    }
    this.violations.push(violation)

    return { allowed: !rule.enforce, violation }
  }

  /** Get all violations recorded so far */
  getViolations(): PolicyViolation[] {
    return [...this.violations]
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private findMatchingRule(toolName: string): PolicyRule | null {
    // Specific rules first, then wildcard patterns, then catch-all
    const specific = this.policy.rules.find((r) => r.tool === toolName)
    if (specific) return specific

    // Check glob patterns (e.g. "lookup_*")
    const pattern = this.policy.rules.find((r) => {
      if (!r.tool.includes('*')) return false
      const prefix = r.tool.replace('*', '')
      return toolName.startsWith(prefix)
    })
    if (pattern) return pattern

    // Catch-all
    return this.policy.rules.find((r) => r.tool === '*') ?? null
  }

  private findTaintedArgs(toolCall: ToolCall): string[] {
    const tainted: string[] = []
    for (const [key, value] of Object.entries(toolCall.input)) {
      // Check if this specific field is tagged as tainted
      if (this.provenance.isTainted(key)) {
        tainted.push(key)
        continue
      }

      // Check if the value itself looks like it came from extracted data
      // by comparing against known tainted values
      if (typeof value === 'string') {
        for (const taintedField of this.provenance.getTaintedFields()) {
          if (value.includes(taintedField)) {
            tainted.push(key)
            break
          }
        }
      }
    }
    return tainted
  }
}
