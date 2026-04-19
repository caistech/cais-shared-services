/**
 * Input Sanitizer
 *
 * Strips known prompt injection patterns from untrusted content before
 * it reaches any LLM. This is the "lock on the door" — not foolproof,
 * but raises the bar for casual attacks.
 *
 * Works in conjunction with the CaMeL split: even if an injection
 * slips through, the quarantined LLM has no tool access.
 */

export interface SanitizeResult {
  sanitized: string
  detectionsFound: Detection[]
  /** true if any high-severity pattern was found */
  flagged: boolean
}

export interface Detection {
  pattern: string
  severity: 'low' | 'medium' | 'high'
  match: string
  index: number
}

interface PatternDef {
  regex: RegExp
  name: string
  severity: 'low' | 'medium' | 'high'
  /** If true, strip the match. If false, flag only (don't modify). */
  strip: boolean
}

/**
 * Known injection patterns — ordered by severity.
 * These catch common prompt injection techniques from research literature
 * (DAN, Base64 encoding, role hijacking, delimiter escape, etc.)
 */
const PATTERNS: PatternDef[] = [
  // --- High severity: direct instruction hijacking ---
  {
    regex: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)/gi,
    name: 'instruction_override',
    severity: 'high',
    strip: true,
  },
  {
    regex: /you\s+are\s+now\s+(a|an|the|in)\s+/gi,
    name: 'role_hijack',
    severity: 'high',
    strip: true,
  },
  {
    regex: /\b(system\s*prompt|system\s*message|system\s*instruction)\s*[:=]/gi,
    name: 'system_prompt_injection',
    severity: 'high',
    strip: true,
  },
  {
    regex: /\[SYSTEM\]|\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>|<\|assistant\|>/gi,
    name: 'chat_template_injection',
    severity: 'high',
    strip: true,
  },
  {
    regex: /\bDAN\b.*\bmode\b|\bDo\s+Anything\s+Now\b/gi,
    name: 'dan_jailbreak',
    severity: 'high',
    strip: true,
  },
  {
    regex: /\bjailbreak\b|\benable\s+developer\s+mode\b/gi,
    name: 'explicit_jailbreak',
    severity: 'high',
    strip: true,
  },

  // --- Medium severity: encoding / obfuscation ---
  {
    regex: /(?:[A-Za-z0-9+/]{4}){10,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g,
    name: 'base64_blob',
    severity: 'medium',
    strip: false, // flag only — could be legitimate content
  },
  {
    regex: /\\u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4}){5,}/g,
    name: 'unicode_escape_sequence',
    severity: 'medium',
    strip: false,
  },
  {
    regex: /&#x?[0-9a-fA-F]+;(?:&#x?[0-9a-fA-F]+;){5,}/g,
    name: 'html_entity_obfuscation',
    severity: 'medium',
    strip: true,
  },

  // --- Medium severity: tool/action manipulation ---
  {
    regex: /\b(call|invoke|execute|run|use)\s+(the\s+)?(tool|function|api|endpoint)\b/gi,
    name: 'tool_invocation_attempt',
    severity: 'medium',
    strip: true,
  },
  {
    regex: /\b(send|forward|exfiltrate|transmit|post)\s+(to|this|the|data)\s/gi,
    name: 'data_exfiltration_attempt',
    severity: 'medium',
    strip: false,
  },

  // --- Low severity: suspicious framing ---
  {
    regex: /\b(pretend|imagine|suppose|act\s+as\s+if|roleplay)\b/gi,
    name: 'roleplay_framing',
    severity: 'low',
    strip: false,
  },
  {
    regex: /\bfor\s+(educational|research|testing|academic)\s+purposes?\b/gi,
    name: 'purpose_framing',
    severity: 'low',
    strip: false,
  },
]

/**
 * Sanitize untrusted input by detecting and optionally stripping
 * known prompt injection patterns.
 */
export function sanitizeInput(input: string): SanitizeResult {
  const detections: Detection[] = []
  let sanitized = input

  for (const pattern of PATTERNS) {
    let match: RegExpExecArray | null
    // Reset lastIndex for global regexes
    pattern.regex.lastIndex = 0

    while ((match = pattern.regex.exec(input)) !== null) {
      detections.push({
        pattern: pattern.name,
        severity: pattern.severity,
        match: match[0].slice(0, 100), // truncate for logging
        index: match.index,
      })

      if (pattern.strip) {
        sanitized = sanitized.replace(match[0], '[REDACTED]')
      }
    }
  }

  return {
    sanitized,
    detectionsFound: detections,
    flagged: detections.some((d) => d.severity === 'high'),
  }
}
