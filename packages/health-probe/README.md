# @caistech/health-probe

The external health-probe **check engine** — the *"what to check and how"* for hosted site
monitoring. Pure, app-agnostic `Check` functions + a `runChecks` runner + a `REGISTRY`. It does **not**
schedule, persist, own tenancy, or create tickets — the **consumer's executor** does that.

## Why it exists (the 3-layer split)

Running health checks as a **GitHub Actions workflow committed into the target repo** cannot ship to a
paying client — you can't assume their package manager, lockfile state, build scripts, or that they can
install a private `@caistech` dep (the field-tested failure taxonomy: `HEALTH_ENFORCEMENT_AND_SAYFIX_PREVENTATIVE.md` §10).

The fix is to run the same checks as **external probes from your own infra**. This package is the shared
check library that makes that possible — consumed by two executors:

| Layer | Owner | Role |
|---|---|---|
| **Check engine** | **this package** | the check functions + failure-domain metadata |
| Hosted execution | SayFix | runs it against **prod** on a cron, per registered target → ticket + alert |
| CI execution | `@caistech/portfolio-gate` | runs it against a **preview** as a pre-merge gate |

The client only **registers a target** (a URL + a check profile) — nothing is deployed into their repo.

## Install

```bash
npm install @caistech/health-probe   # registry: npm.pkg.github.com, token NODE_AUTH_TOKEN
```

## Usage

```ts
import { httpStatusCheck, runChecks, resolveChecks, REGISTRY, type CheckResult } from "@caistech/health-probe";

// one check
const r: CheckResult = await httpStatusCheck.run({ url: "https://acme.example" });
if (!r.ok) console.log(r.symptom); // "https://acme.example returned HTTP 503"

// several checks (concurrent, never throws)
const results = await runChecks({ url: "https://acme.example" }, resolveChecks(["reachability", "http_status"]));
```

- **`Check.run(target, opts?)`** — pure; `opts.fetchImpl` is injectable (unit-testable without a
  network); `opts.timeoutMs` (default 10s). Never throws — a thrown/timed-out probe becomes an
  `unreachable` verdict (`faultDomain: "network"`).
- **`CheckResult`** — `{ kind, ok, severity, symptom, faultDomain, detail }`. `symptom` is ready to
  drop into an alert. `faultDomain` (`network | app | auth | target-config`) is the surviving fault
  taxonomy — the CI-install faults can't occur for an external probe.
- **`REGISTRY`** — the catalog keyed by `CheckKind`; `resolveChecks(kinds)` skips any not-yet-built.

## Tiers

- **Tier-0** (`reachability`, `http_status`) — zero target cooperation; any public URL. *Built.*
  `http_status` is SayFix's original `runHttpSensor`, lifted verbatim: a **5xx or unreachable** host is
  a breach; **4xx is not** (a 401/403/404 on a health URL is a misconfigured target, not an outage).
- **Tier-1** — need target-side setup collected by the consumer's onboarding wizard. **`health_endpoint`
  is live** (v0.2.0): GETs `url + healthPath` (default `/api/health`) sending `token` as a Bearer header,
  expects `expectedStatus` (default 200); a **401/403 → `faultDomain: "target-config"`** (expose it or
  supply a token — the §10b-10 case), distinct from a 5xx app fault. `auth_smoke` (needs a
  client-provisioned probe account) is still a reserved registry slot, TBD.

## Extending

Add a check by implementing `Check` and registering it in `REGISTRY`. Set `tier: 1` and a `requires`
line (the one-liner a wizard shows the target owner) for anything needing target-side setup.

**Status:** v0.2.0 — Tier-0 (`reachability`, `http_status`) + Tier-1 `health_endpoint` live, consumed
by SayFix's `/api/cron/sensors` (with an owner wizard step registering the health path + token). Zero
runtime deps.
