# @caistech/security-gate

Shared CaMeL security pipeline for all GBTA projects. One `securityGate.wrap()` call replaces direct `callModel()` for any agentic workflow that processes untrusted content.

## Quick Start

```typescript
import { createSecurityGate } from '@caistech/security-gate'

const gate = createSecurityGate({
  projectId: 'your-project-uuid',
  agentId: 'compliance-agent',
  // Cheap model for quarantine (no tools, just extraction)
  quarantineModel: (opts) => callModel('embedding', opts),  // or use Haiku
  // Powerful model for planning (has tool access)
  plannerModel: (opts) => callModel('compliance_primary', opts),
  // Optional: Supabase client for logging
  supabase: supabaseAdmin,
  // Optional: tool executor
  executeToolCall: (tc) => executeComplianceToolCall(tc, context),
  // Optional: policy level (default: 'strict')
  policy: { level: 'strict' },
})

const result = await gate.wrap({
  trustedInput: 'Analyze this building plan for NCC fire safety compliance',
  untrustedInput: pdfContent,        // untrusted PDF text
  systemPrompt: COMPLIANCE_SYSTEM_PROMPT,
  tools: AGENT_TOOLS,
})

// result.text — final analysis
// result.violations — any policy violations
// result.killed — whether kill switch was triggered
// result.usage — token usage across both LLMs
```

## MMC Build Integration

```typescript
// In compliance-agent.ts — replace the direct callModel() loop:

// BEFORE:
const response = await callModel('compliance_primary', {
  system: COMPLIANCE_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: pdfContent }],
  tools: AGENT_TOOLS,
})

// AFTER:
const gate = createSecurityGate({
  projectId: MMC_BUILD_PROJECT_ID,
  agentId: 'compliance-agent',
  quarantineModel: (opts) => callModel('summary', opts),
  plannerModel: (opts) => callModel('compliance_primary', opts),
  executeToolCall: (tc) => executeToolCall(tc, context),
  policy: { level: 'strict' },
})

const result = await gate.wrap({
  trustedInput: `Analyze for NCC category: ${category}`,
  untrustedInput: pdfContent,
  systemPrompt: COMPLIANCE_SYSTEM_PROMPT,
  tools: AGENT_TOOLS,
})
```

## Standalone Guardrails (No CaMeL Split)

For simpler use cases without tool access:

```typescript
import { sanitizeInput, validateOutput } from '@caistech/security-gate'

// Sanitize before sending to any LLM
const { sanitized, flagged, detectionsFound } = sanitizeInput(userUploadedText)

// Validate LLM output before returning to user
const { valid, warnings } = validateOutput(llmResponse)
```

## Policy Levels

| Level | Tool args from untrusted data | Audit logging | Anomaly detection |
|---|---|---|---|
| `strict` | Blocked | Yes | Yes |
| `standard` | Allowed for read-only tools (`lookup_*`, `get_*`, `retrieve_*`) | Yes | Yes |
| `permissive` | Warned only | No | No |

## Database Tables

Run migration `20260407000000_security_gate.sql`:

- `security_gate_events` — all pipeline events
- `security_anomalies` — flagged behavioral patterns
- `security_gate_kill_switch` — remote session termination

Dashboard views: `recent_security_events`, `active_anomalies`, `security_summary`
