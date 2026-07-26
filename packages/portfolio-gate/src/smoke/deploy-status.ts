/**
 * Deploy-status gate — is the code we THINK is in production actually in production?
 *
 * WHY THIS EXISTS. ExecutorAI's production deploys failed silently for a month (2026-06-24 →
 * 2026-07-26): every push to main errored at `npm install` with a 401 from GitHub Packages (an
 * expired NODE_AUTH_TOKEN in Vercel), so production kept serving a month-old build while main
 * moved on. Nothing surfaced it. Among the undeployed commits were RLS column-exposure hardening
 * and admin MFA enforcement — security work already described to a partner as remediated.
 *
 * Three assertions, because the obvious ones are not enough:
 *   1. the latest production deployment is READY (not ERROR)
 *   2. its commit SHA matches the ref we expect   ← catches a STALE prod that looks healthy
 *   3. the public URL serves the APP, not a wall  ← catches the protection false-positive
 *
 * Assertion 3 exists because Vercel's SSO deployment-protection page answers **HTTP 200 with a
 * login screen**. A "curl returns 200" check passes against it, and against a stale-but-serving
 * production. Neither status code nor reachability can tell you production is CURRENT.
 *
 * SKIP POLICY — deliberately stricter than the memory-loop gate. Every product deploys, so there
 * is no "this repo doesn't have that feature" case to detect. Missing config therefore FAILS; a
 * genuinely non-Vercel repo opts out EXPLICITLY via `notApplicable: '<reason>'`, which is printed
 * rather than silent. A check that quietly does nothing is indistinguishable from one that passed.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const VERCEL_API = 'https://api.vercel.com'
const DEFAULT_WAIT_TIMEOUT_MS = 15 * 60_000
const DEFAULT_POLL_MS = 20_000

/** States Vercel reports while a build is still in flight. */
const IN_FLIGHT = new Set(['BUILDING', 'QUEUED', 'INITIALIZING'])

/** Markers that mean "this HTML is an access wall, not the product". */
const WALL_PATTERNS = [
  /vercel\.com\/sso-api/i,
  /_vercel_sso_nonce/i,
  /Authentication Required/i,
  /^\s*Redirecting\.\.\.\s*$/i,
]

export interface DeployStatusConfig {
  /** Vercel project id (prj_…). Falls back to .vercel/project.json, then VERCEL_PROJECT_ID. */
  projectId?: string
  /** Vercel team id (team_…). Falls back to .vercel/project.json orgId, then VERCEL_TEAM_ID. */
  teamId?: string
  /** Vercel access token with read scope. Falls back to VERCEL_TOKEN. */
  token?: string
  /** The commit that SHOULD be live. Falls back to GITHUB_SHA, then `git rev-parse HEAD`. */
  expectedSha?: string
  /** A publicly reachable production URL (NOT a protected alias). Falls back to PUBLIC_ALIAS. */
  publicUrl?: string
  /** A string present in the real app's HTML but never on a protection wall (e.g. the product name). */
  appMarker?: string
  /** Poll until the deployment for `expectedSha` settles — use on push-triggered CI runs. */
  wait?: boolean
  waitTimeoutMs?: number
  pollMs?: number
  /** Explicit, RECORDED opt-out for a repo that genuinely does not deploy on Vercel. */
  notApplicable?: string
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
}

export interface DeployStatusCheck {
  name: string
  ok: boolean
  detail?: string
}

export interface DeployStatusResult {
  outcome: 'pass' | 'fail' | 'skipped'
  checks: DeployStatusCheck[]
  deployment?: { id: string; state: string; sha: string | null; url: string }
  reason?: string
}

interface Deployment {
  id: string
  state: string
  sha: string | null
  url: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// NOTE: these use STATIC node: imports on purpose. An earlier draft used lazy `require()` "so the
// module stays usable in non-Node contexts" — but this package is ESM ("type": "module"), where
// `require` is undefined, so both helpers threw into their own catch and silently returned nothing.
// The gate then reported "expected commit sha missing" inside a perfectly good git checkout and
// never auto-detected .vercel/project.json. A helper that fails silently is the exact bug class
// this gate exists to catch, so it is not allowed to have one.

function readVercelLink(): { projectId?: string; teamId?: string } {
  try {
    const json = JSON.parse(readFileSync('.vercel/project.json', 'utf8')) as {
      projectId?: string
      orgId?: string
    }
    return { projectId: json.projectId, teamId: json.orgId }
  } catch {
    return {} // genuinely absent (not linked) — the caller falls back to env
  }
}

function localHeadSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null // not a git checkout — the caller reports it as missing config
  }
}

async function latestProductionDeployment(
  cfg: Required<Pick<DeployStatusConfig, 'projectId' | 'teamId' | 'token'>>,
  doFetch: typeof fetch,
): Promise<Deployment> {
  const url = `${VERCEL_API}/v6/deployments?projectId=${encodeURIComponent(cfg.projectId)}&teamId=${encodeURIComponent(cfg.teamId)}&target=production&limit=1`
  const res = await doFetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
  if (!res.ok) {
    throw new Error(`Vercel API ${res.status} ${res.statusText} — check the token's scope on this team`)
  }
  const body = (await res.json()) as {
    deployments?: Array<{
      uid?: string
      id?: string
      state?: string
      readyState?: string
      url?: string
      meta?: { githubCommitSha?: string }
    }>
  }
  const d = body.deployments?.[0]
  if (!d) throw new Error('no production deployments found for this project')
  return {
    id: d.uid ?? d.id ?? '(unknown)',
    state: d.state ?? d.readyState ?? 'UNKNOWN',
    sha: d.meta?.githubCommitSha ?? null,
    url: d.url ?? '',
  }
}

async function probePublicUrl(
  url: string,
  marker: string | undefined,
  doFetch: typeof fetch,
): Promise<DeployStatusCheck> {
  const name = 'public URL serves the app (not a protection wall)'
  try {
    const res = await doFetch(url, { redirect: 'follow' })
    const html = await res.text()
    const wall = WALL_PATTERNS.some((re) => re.test(html))
    const hasMarker = marker ? html.includes(marker) : true
    const ok = res.status === 200 && hasMarker && !wall
    const bits = [`HTTP ${res.status}`]
    if (marker) bits.push(hasMarker ? 'marker found' : `marker "${marker}" MISSING`)
    if (wall) bits.push('LOOKS LIKE AN ACCESS WALL')
    return { name, ok, detail: bits.join(', ') }
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Run the deploy-status gate. Never throws — a crash is reported as a failed check, because a gate
 * that dies is a gate that told you nothing.
 */
export async function runDeployStatusGate(
  config: DeployStatusConfig = {},
): Promise<DeployStatusResult> {
  if (config.notApplicable) {
    return { outcome: 'skipped', checks: [], reason: config.notApplicable }
  }

  const link = readVercelLink()
  const projectId = config.projectId ?? process.env.VERCEL_PROJECT_ID ?? link.projectId
  const teamId = config.teamId ?? process.env.VERCEL_TEAM_ID ?? link.teamId
  const token = config.token ?? process.env.VERCEL_TOKEN
  const publicUrl = config.publicUrl ?? process.env.PUBLIC_ALIAS ?? process.env.PORTFOLIO_GATE_PREVIEW_URL
  const appMarker = config.appMarker ?? process.env.APP_MARKER
  const expectedSha = config.expectedSha ?? process.env.GITHUB_SHA ?? localHeadSha() ?? undefined
  const doFetch = config.fetchImpl ?? fetch

  const missing: string[] = []
  if (!token) missing.push('VERCEL_TOKEN')
  if (!projectId) missing.push('VERCEL_PROJECT_ID (or .vercel/project.json)')
  if (!teamId) missing.push('VERCEL_TEAM_ID (or .vercel/project.json orgId)')
  if (!expectedSha) missing.push('expected commit sha (GITHUB_SHA or a git checkout)')
  if (missing.length) {
    return {
      outcome: 'fail',
      checks: [
        {
          name: 'gate is configured',
          ok: false,
          detail: `missing ${missing.join(', ')} — this gate FAILS rather than skips, because an unverified deploy is the bug it exists to catch. A repo that genuinely does not deploy on Vercel sets notApplicable with a reason.`,
        },
      ],
    }
  }

  let deployment: Deployment
  try {
    deployment = await latestProductionDeployment({ projectId: projectId!, teamId: teamId!, token: token! }, doFetch)

    if (config.wait) {
      const deadline = Date.now() + (config.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
      while (
        Date.now() < deadline &&
        (deployment.sha !== expectedSha || IN_FLIGHT.has(deployment.state))
      ) {
        await sleep(config.pollMs ?? DEFAULT_POLL_MS)
        deployment = await latestProductionDeployment(
          { projectId: projectId!, teamId: teamId!, token: token! },
          doFetch,
        )
      }
    }
  } catch (err) {
    return {
      outcome: 'fail',
      checks: [
        { name: 'query the latest production deployment', ok: false, detail: err instanceof Error ? err.message : String(err) },
      ],
    }
  }

  const checks: DeployStatusCheck[] = [
    {
      name: 'latest production deployment is READY',
      ok: deployment.state === 'READY',
      detail: `state=${deployment.state}`,
    },
    {
      name: 'deployed commit matches the expected ref',
      ok: deployment.sha === expectedSha,
      detail:
        deployment.sha === expectedSha
          ? String(expectedSha).slice(0, 7)
          : `deployed=${(deployment.sha ?? 'none').slice(0, 7)} expected=${String(expectedSha).slice(0, 7)} — PRODUCTION IS STALE`,
    },
  ]

  if (publicUrl) {
    checks.push(await probePublicUrl(publicUrl, appMarker, doFetch))
  } else {
    checks.push({
      name: 'public URL serves the app (not a protection wall)',
      ok: false,
      detail:
        'no public URL configured — set publicUrl / PUBLIC_ALIAS. Without it, a protected alias returning 200 from its SSO page would read as healthy.',
    })
  }

  return {
    outcome: checks.every((c) => c.ok) ? 'pass' : 'fail',
    checks,
    deployment,
  }
}

export function formatDeployStatusResult(result: DeployStatusResult): string {
  if (result.outcome === 'skipped') {
    return `deploy-status: SKIPPED — ${result.reason}`
  }
  const lines = result.checks.map(
    (c) => `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`,
  )
  if (result.deployment) {
    lines.push(`\n  deployment ${result.deployment.id}${result.deployment.url ? ` — https://${result.deployment.url}` : ''}`)
  }
  lines.push(
    result.outcome === 'pass'
      ? '\ndeploy-status: PASS — production is current.'
      : '\ndeploy-status: FAIL — production does not match the expected ref.',
  )
  return lines.join('\n')
}
