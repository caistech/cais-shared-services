#!/usr/bin/env node
/**
 * portfolio-gate-deploy-status — verify production is actually running the code you think it is.
 *
 * Add this to the shared gate workflow in EVERY repo. Unlike the memory-loop gate it does NOT skip
 * when unconfigured: every product deploys, so there is no "not applicable" to detect. A repo that
 * genuinely does not deploy on Vercel opts out explicitly with --not-applicable "<reason>", which
 * is printed rather than silent.
 *
 * Born from a real month-long outage: every ExecutorAI production deploy failed at `npm install`
 * (expired NODE_AUTH_TOKEN → 401 from GitHub Packages) while production quietly served a
 * month-old build. Nothing noticed, because nothing was looking.
 *
 * Usage:
 *   portfolio-gate-deploy-status --public-url https://app.example.com --app-marker "Acme"
 *   portfolio-gate-deploy-status --wait                     # on push: poll until the build settles
 *   portfolio-gate-deploy-status --sha <sha>                # check a specific commit
 *   portfolio-gate-deploy-status --not-applicable "static export, no Vercel project"
 *
 * Environment:
 *   VERCEL_TOKEN                            access token with read scope on the team (required)
 *   VERCEL_PROJECT_ID / VERCEL_TEAM_ID      or a checked-in .vercel/project.json
 *   PUBLIC_ALIAS                            a PUBLICLY reachable production URL (not a protected alias)
 *   APP_MARKER                              a string in the app's HTML, absent from any access wall
 *   GITHUB_SHA                              the ref that should be live (else `git rev-parse HEAD`)
 *
 * Exit codes:
 *   0 — production is current, or explicitly not applicable
 *   1 — production is stale, broken, or unverifiable
 *   2 — argument error
 */
import {
  runDeployStatusGate,
  formatDeployStatusResult,
  type DeployStatusConfig,
} from '../smoke/deploy-status.js'

function parseArgs(argv: string[]) {
  const args: DeployStatusConfig & { json?: boolean; help?: boolean } = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--public-url') args.publicUrl = argv[++i]
    else if (a === '--app-marker') args.appMarker = argv[++i]
    else if (a === '--sha') args.expectedSha = argv[++i]
    else if (a === '--project-id') args.projectId = argv[++i]
    else if (a === '--team-id') args.teamId = argv[++i]
    else if (a === '--wait') args.wait = true
    else if (a === '--not-applicable') args.notApplicable = argv[++i]
    else if (a === '--json') args.json = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(
      'portfolio-gate-deploy-status [--public-url <url>] [--app-marker <str>] [--sha <sha>]\n' +
        '                            [--project-id <prj_…>] [--team-id <team_…>] [--wait]\n' +
        '                            [--not-applicable "<reason>"] [--json]',
    )
    process.exit(0)
  }

  if (args.notApplicable !== undefined && !String(args.notApplicable).trim()) {
    console.error('--not-applicable requires a reason (a bare opt-out is how checks rot)')
    process.exit(2)
  }

  const result = await runDeployStatusGate(args)

  if (args.json) console.log(JSON.stringify(result, null, 2))
  else console.log(formatDeployStatusResult(result))

  process.exit(result.outcome === 'fail' ? 1 : 0)
}

main().catch((err) => {
  console.error(`deploy-status gate crashed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
