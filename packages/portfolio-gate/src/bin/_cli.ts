/**
 * Shared CLI plumbing for the v0.2 audit bin entries.
 *
 * Parses the standard flag set (`--config`, `--root`, `--json`, `--base-url`,
 * `--help`) so each audit bin stays small and focused on the audit body.
 */
export interface AuditCliArgs {
  configPath: string | null
  rootDir: string | null
  baseUrlOverride: string | null
  json: boolean
  help: boolean
  extras: Record<string, string | boolean>
}

export function parseAuditArgs(argv: string[]): AuditCliArgs {
  const args: AuditCliArgs = {
    configPath: null,
    rootDir: null,
    baseUrlOverride: null,
    json: false,
    help: false,
    extras: {},
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--config' || a === '-c') {
      args.configPath = argv[++i] ?? null
    } else if (a === '--root') {
      args.rootDir = argv[++i] ?? null
    } else if (a === '--base-url') {
      args.baseUrlOverride = argv[++i] ?? null
    } else if (a === '--json') {
      args.json = true
    } else if (a === '--help' || a === '-h') {
      args.help = true
    } else if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        args.extras[key] = true
      } else {
        args.extras[key] = next
        i += 1
      }
    }
  }
  return args
}

/**
 * Write a short help block for an audit. Each bin defines its own description
 * and passes through.
 */
export function printAuditHelp(opts: {
  name: string
  rule: string
  description: string
  configFile: string | null
  extras?: string[]
}): void {
  const lines = [
    `${opts.name} — ${opts.description} (Portfolio Standard ${opts.rule})`,
    '',
    'Usage:',
    `  ${opts.name} [--config <path>] [--root <path>] [--json]`,
    '',
    'Flags:',
  ]
  if (opts.configFile) {
    lines.push(
      `  --config, -c <path>   Path to ${opts.configFile} (optional — sane defaults if absent)`
    )
  }
  lines.push(
    '  --root <path>         Repo root to scan (default: cwd)',
    '  --base-url <url>      Override config.baseUrl (dynamic audits only)',
    '  --json                Emit JSON result instead of human-readable text'
  )
  for (const extra of opts.extras ?? []) {
    lines.push(extra)
  }
  lines.push('  --help, -h            Show this help')
  lines.push('', 'Exit codes: 0 pass, 1 fail, 2 config error.', '')
  process.stdout.write(lines.join('\n'))
}
