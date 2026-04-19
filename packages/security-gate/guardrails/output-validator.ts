/**
 * Output Validator
 *
 * Validates LLM output before it's returned to the consuming project.
 * Catches cases where the quarantined LLM has been manipulated into
 * returning data that looks like instructions or tool calls.
 */

export interface ValidationResult {
  valid: boolean
  warnings: OutputWarning[]
  /** true if output was modified during validation */
  modified: boolean
  output: string
}

export interface OutputWarning {
  type: string
  severity: 'low' | 'medium' | 'high'
  message: string
}

interface OutputCheck {
  name: string
  severity: 'low' | 'medium' | 'high'
  test: (output: string) => boolean
  message: string
}

const OUTPUT_CHECKS: OutputCheck[] = [
  {
    name: 'embedded_tool_call',
    severity: 'high',
    test: (o) => /\{"(name|function|tool_call)":\s*"/.test(o),
    message: 'Output contains what appears to be an embedded tool call JSON',
  },
  {
    name: 'instruction_leak',
    severity: 'high',
    test: (o) =>
      /(system\s*prompt|you\s+are\s+an?\s+AI|your\s+instructions\s+are)/i.test(o),
    message: 'Output may contain leaked system instructions',
  },
  {
    name: 'url_injection',
    severity: 'medium',
    test: (o) => {
      const urls = o.match(/https?:\/\/[^\s"'<>]+/g) || []
      // Flag if output contains URLs not from common safe domains
      const suspicious = urls.filter(
        (u) =>
          !u.includes('ncc.abcb.gov.au') &&
          !u.includes('legislation.gov.au') &&
          !u.includes('standards.org.au') &&
          !u.includes('github.com')
      )
      return suspicious.length > 3
    },
    message: 'Output contains multiple URLs that may be injection payloads',
  },
  {
    name: 'excessive_length',
    severity: 'low',
    test: (o) => o.length > 100_000,
    message: 'Output exceeds 100K characters — possible data dump attack',
  },
  {
    name: 'markdown_injection',
    severity: 'medium',
    test: (o) => /!\[.*\]\(https?:\/\//.test(o) && /\?.*=/.test(o),
    message: 'Output contains markdown image with query parameters (possible tracking pixel)',
  },
]

/**
 * Validate LLM output against known attack patterns.
 * Returns warnings but does NOT block by default — the policy engine
 * decides whether to block based on severity and policy level.
 */
export function validateOutput(output: string): ValidationResult {
  const warnings: OutputWarning[] = []

  for (const check of OUTPUT_CHECKS) {
    if (check.test(output)) {
      warnings.push({
        type: check.name,
        severity: check.severity,
        message: check.message,
      })
    }
  }

  return {
    valid: !warnings.some((w) => w.severity === 'high'),
    warnings,
    modified: false,
    output,
  }
}

/**
 * Validate that the quarantined LLM's extraction output is structured data,
 * not smuggled instructions. The quarantine should only return facts/data,
 * never action directives.
 */
export function validateQuarantineOutput(output: string): ValidationResult {
  const base = validateOutput(output)

  // Additional check: quarantine output should not contain action language
  const actionPatterns = [
    /\b(you\s+must|you\s+should|please\s+(call|invoke|execute|send|run))\b/gi,
    /\b(step\s+\d+|first|then|next|finally)\s*[:,]/gi,
    /\b(important|critical|urgent)\s*:/gi,
  ]

  for (const pattern of actionPatterns) {
    if (pattern.test(output)) {
      base.warnings.push({
        type: 'quarantine_action_language',
        severity: 'medium',
        message:
          'Quarantined output contains action directives — possible instruction smuggling',
      })
    }
  }

  base.valid = !base.warnings.some((w) => w.severity === 'high')
  return base
}
