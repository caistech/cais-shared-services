/**
 * Voice agent audit — Portfolio Standard R20 enforcement.
 *
 * Voice agent is NOT optional — it's the clarifier layer for any nuanced UI
 * question. Every product surface with multi-step user input must have a voice
 * agent reachable in 3 clicks or fewer.
 *
 * Scans for:
 * - Import of VoiceWidget from @caistech/elevenlabs-convai
 * - Or direct ElevenLabs embed script
 * - Presence on any page (layout.tsx or page.tsx)
 *
 * See: CLAUDE.md → VOICE AI STANDARD RULE.
 */
import { resolve } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  readFileOptional,
  relativeTo,
  walkFiles,
} from './shared.js'

export interface VoiceAgentConfig {
  voiceWidgetRegex?: string
  allowlist?: string[]
  scanRoots?: string[]
}

export interface VoiceAgentOptions {
  rootDir?: string
  configPath?: string | null
}

const DEFAULT_VOICE_WIDGET_REGEX =
  'VoiceWidget|ElevenLabsConvai|ConvaiWidget|VoiceAgent|useConversation|ElevenLabsAgent'

const ELEVENLABS_EMBED_RE = /elevenlabs\.io\/convai-widget|elevenlabs-convai|<elevenlabs-convai/

const EXEMPT_MARKER_RE =
  /\/\/\s*@voice-agent-exempt\b|\/\*\s*@voice-agent-exempt\b/i

const LAYOUT_FILE_RE = /(?:^|[\\/])layout\.(?:tsx|jsx)$/

const DEFAULT_ALLOWLIST = ['_archive/', '_vite-legacy/']

export async function runVoiceAgentAudit(
  options: VoiceAgentOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<VoiceAgentConfig>(
      options.configPath ??
        resolve(rootDir, 'voice-agent.config.json')
    )) ?? {}

  const widgetRe = new RegExp(
    `<\\s*(?:${config.voiceWidgetRegex ?? DEFAULT_VOICE_WIDGET_REGEX})\\b`
  )
  const allowlist = [...DEFAULT_ALLOWLIST, ...(config.allowlist ?? [])]
  const scanRoots = config.scanRoots ?? ['.']
  const findings: AuditFinding[] = []

  const files: string[] = []
  for (const root of scanRoots) {
    const absoluteRoot = `${rootDir}/${root}`.replace(/\\/g, '/')
    const found = await walkFiles(absoluteRoot, { extensions: ['.tsx', '.jsx'] })
    files.push(...found)
  }

  // Find all files with voice agent
  const filesWithVoice: string[] = []

  for (const file of files) {
    const rel = relativeTo(rootDir, file).replace(/\\/g, '/')
    if (allowlist.some((entry) => rel.includes(entry))) continue
    const content = await readFileOptional(file)
    if (!content) continue
    if (EXEMPT_MARKER_RE.test(content)) continue

    if (widgetRe.test(content) || ELEVENLABS_EMBED_RE.test(content)) {
      filesWithVoice.push(rel)
    }
  }

  // Check if VoiceWidget is in a layout file (makes it available globally)
  const hasGlobalVoice = filesWithVoice.some(f => f.includes('layout.'))

  // Pass if we found voice agent anywhere
  const passed = hasGlobalVoice || filesWithVoice.length > 0

  if (!passed) {
    findings.push({
      severity: 'fail',
      message: 'no voice agent found - add VoiceWidget to src/app/layout.tsx',
      file: 'src/app/layout.tsx',
    })
  }

  return {
    audit: 'voice-agent',
    rule: 'R20',
    passed,
    findings,
    durationMs: Date.now() - start,
  }
}
