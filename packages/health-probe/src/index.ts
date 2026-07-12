/**
 * @caistech/health-probe — the external health-probe check ENGINE.
 *
 * This is the "what to check and how" for hosted site monitoring, extracted so ONE check library
 * serves two executors: SayFix runs it HOSTED against prod on a cron; @caistech/portfolio-gate runs
 * it in CI against a preview. The engine itself is pure — it never schedules, persists, owns tenancy,
 * or creates tickets. Give it a target + a set of checks; it returns verdicts. The consumer does the
 * rest (dedup, tickets, alerts, storage).
 *
 * Why it exists: the in-repo-CI health-sensor model can't ship to a paying client (you can't assume
 * their package manager / lockfile / build scripts / secrets). Running these checks as EXTERNAL probes
 * from your own infra deletes every CI-install failure mode and keeps only the target-side one
 * (faultDomain "target-config") — which is exactly what a target's onboarding wizard sets up.
 *
 * Tiers: Tier-0 checks (reachability, http_status) need ZERO cooperation from the target — any public
 * URL. Tier-1 checks (health_endpoint, auth_smoke, …) need target-side setup (a health path, a scoped
 * token) and are added as the wizard grows.
 *
 * Zero-dep (native fetch), injectable fetch (unit-testable without a network), and NEVER throws — a
 * thrown/timed-out probe becomes an "unreachable" verdict, not an exception.
 */

/** What we probe. Tier-0 needs only `url`; Tier-1 checks read `healthPath` / `token`. */
export interface ProbeTarget {
  url: string;
  /** e.g. "/api/health" — the endpoint a Tier-1 health_endpoint check hits. Default "/api/health". */
  healthPath?: string;
  /** A read-only, health-scoped token the target owner exposed for Tier-1 checks (sent as a Bearer header). */
  token?: string;
  /** The status a healthy health_endpoint returns. Default 200 — set it where a target's health route
   *  legitimately answers with something else (the §10b-10 protected-endpoint case). */
  expectedStatus?: number;
}

export type CheckKind = "reachability" | "http_status" | "health_endpoint" | "auth_smoke";
export type Severity = "blocked" | "impaired" | "annoying" | "nice-to-have";
/** Where the fault lives. The in-CI install faults (runner/lockfile/pnpm/cache) can't occur for an
 *  external probe — only these remain, and "target-config" is the one a wizard resolves. */
export type FaultDomain = "network" | "app" | "auth" | "target-config";

export interface CheckResult {
  kind: CheckKind;
  /** Healthy? A passing probe. */
  ok: boolean;
  severity: Severity;
  /** Human-readable, ready to drop into an alert ("<url> returned HTTP 503"). */
  symptom: string;
  faultDomain: FaultDomain;
  /** Structured extras — status code, timing, payload. */
  detail?: Record<string, unknown>;
}

export interface RunOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface Check {
  kind: CheckKind;
  /** 0 = zero target cooperation (any public URL); 1 = needs target-side setup (a health path / token). */
  tier: 0 | 1;
  /** One-line wizard copy for what the target owner must expose to enable this check (Tier-1). */
  requires?: string;
  run(target: ProbeTarget, opts?: RunOptions): Promise<CheckResult>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "caistech-health-probe/0.1 (+https://sayfix.app)";

export interface ProbeOnceOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Follow redirects (default — hosted monitoring) or surface them as a status (CI route assertion). */
  redirect?: "follow" | "manual";
  /** Extra request headers (e.g. an Authorization Bearer token). */
  headers?: Record<string, string>;
}

export type ProbeOnceResult = { status: number } | { error: string };

/**
 * One GET with a hard timeout — the **shared transport** both executors build on: SayFix's hosted
 * checks AND @caistech/portfolio-gate's CI route-smoke. Resolves to a status, or an `error` string on
 * throw/abort; NEVER throws. Injectable fetch for tests. The two callers keep their OWN classification
 * policy (hosted: 5xx-only/follow/401=target-config · CI: exact/2xx-lenient/manual/auth-lenient) — only
 * this fiddly, easy-to-get-wrong transport is single-sourced.
 */
export async function probeOnce(url: string, opts: ProbeOnceOptions = {}): Promise<ProbeOnceResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: opts.redirect ?? "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...(opts.headers ?? {}) },
    });
    return { status: res.status };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `no response within ${timeoutMs}ms`
        : (err as Error)?.message ?? "network error";
    return { error: reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tier-0 · did the site answer at all? Any HTTP response (even an error status) passes; only a
 * throw/timeout fails. The lightest liveness signal — use when you only care "is it up?".
 */
export const reachabilityCheck: Check = {
  kind: "reachability",
  tier: 0,
  async run(target, opts = {}) {
    const r = await probeOnce(target.url, opts);
    if ("error" in r) {
      return {
        kind: "reachability",
        ok: false,
        severity: "blocked",
        faultDomain: "network",
        symptom: `${target.url} is unreachable (${r.error})`,
        detail: { unreachable: true },
      };
    }
    return {
      kind: "reachability",
      ok: true,
      severity: "nice-to-have",
      faultDomain: "network",
      symptom: `${target.url} responded (HTTP ${r.status})`,
      detail: { status: r.status },
    };
  },
};

/**
 * Tier-0 · is the server erroring on a request a real visitor would make? A 5xx OR an unreachable host
 * is a user-facing breach; 4xx is deliberately NOT (a 401/403/404 on a health URL is a misconfigured
 * target, not a site outage). This is SayFix's original `runHttpSensor`, lifted verbatim.
 */
export const httpStatusCheck: Check = {
  kind: "http_status",
  tier: 0,
  async run(target, opts = {}) {
    const r = await probeOnce(target.url, opts);
    if ("error" in r) {
      return {
        kind: "http_status",
        ok: false,
        severity: "blocked",
        faultDomain: "network",
        symptom: `${target.url} is unreachable (${r.error})`,
        detail: { unreachable: true },
      };
    }
    if (r.status >= 500) {
      return {
        kind: "http_status",
        ok: false,
        severity: "blocked",
        faultDomain: "app",
        symptom: `${target.url} returned HTTP ${r.status}`,
        detail: { status: r.status },
      };
    }
    return {
      kind: "http_status",
      ok: true,
      severity: "nice-to-have",
      faultDomain: "app",
      symptom: `${target.url} responded HTTP ${r.status}`,
      detail: { status: r.status },
    };
  },
};

/** Resolve base + path into an absolute URL. Paths carry a leading slash ("/api/health"). */
function joinUrl(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
}

/**
 * Tier-1 · does the target's own health endpoint report healthy? GETs `url + healthPath` (default
 * "/api/health"), sending the target owner's read-only `token` as a Bearer header when present, and
 * expects `expectedStatus` (default 200). A 401/403 is a **target-config** fault (the endpoint needs
 * to be exposed or a token supplied — §10b-10), distinct from a 5xx app fault or an unreachable host.
 * Needs target-side setup, so it's Tier-1 (the consumer's onboarding wizard collects the path + token).
 */
export const healthEndpointCheck: Check = {
  kind: "health_endpoint",
  tier: 1,
  requires:
    "Expose a health endpoint (e.g. /api/health) that returns 200 when healthy; optionally protect it and give us a read-only health token.",
  async run(target, opts = {}) {
    const path = target.healthPath ?? "/api/health";
    const url = joinUrl(target.url, path);
    const expected = target.expectedStatus ?? 200;
    const headers: Record<string, string> = target.token ? { Authorization: `Bearer ${target.token}` } : {};
    const r = await probeOnce(url, { ...opts, headers });
    if ("error" in r) {
      return {
        kind: "health_endpoint",
        ok: false,
        severity: "blocked",
        faultDomain: "network",
        symptom: `${url} is unreachable (${r.error})`,
        detail: { unreachable: true },
      };
    }
    if (r.status === expected) {
      return {
        kind: "health_endpoint",
        ok: true,
        severity: "nice-to-have",
        faultDomain: "app",
        symptom: `${url} responded HTTP ${r.status} (healthy)`,
        detail: { status: r.status },
      };
    }
    if (r.status === 401 || r.status === 403) {
      return {
        kind: "health_endpoint",
        ok: false,
        severity: "impaired",
        faultDomain: "target-config",
        symptom: `${url} needs auth (HTTP ${r.status}) — expose the health endpoint or provide a read-only health token`,
        detail: { status: r.status },
      };
    }
    return {
      kind: "health_endpoint",
      ok: false,
      severity: r.status >= 500 ? "blocked" : "impaired",
      faultDomain: "app",
      symptom: `${url} returned HTTP ${r.status} (expected ${expected})`,
      detail: { status: r.status, expected },
    };
  },
};

/** The catalog of built-in checks, keyed by kind. The consumer picks which to enable per target. */
export const REGISTRY: Record<CheckKind, Check | undefined> = {
  reachability: reachabilityCheck,
  http_status: httpStatusCheck,
  health_endpoint: healthEndpointCheck,
  // Tier-1, still TBD (needs a client-provisioned probe account):
  auth_smoke: undefined,
};

/** Resolve check kinds → Check implementations, skipping any not yet implemented. */
export function resolveChecks(kinds: CheckKind[]): Check[] {
  return kinds.map((k) => REGISTRY[k]).filter((c): c is Check => Boolean(c));
}

/**
 * Run a set of checks against one target. Pure orchestration — runs them concurrently, never throws
 * (a check that somehow rejects becomes an unreachable-style failed verdict), returns every result.
 */
export async function runChecks(
  target: ProbeTarget,
  checks: Check[],
  opts: RunOptions = {},
): Promise<CheckResult[]> {
  return Promise.all(
    checks.map((c) =>
      c.run(target, opts).catch(
        (err): CheckResult => ({
          kind: c.kind,
          ok: false,
          severity: "blocked",
          faultDomain: "network",
          symptom: `${target.url} ${c.kind} check failed (${(err as Error)?.message ?? "error"})`,
          detail: { threw: true },
        }),
      ),
    ),
  );
}
