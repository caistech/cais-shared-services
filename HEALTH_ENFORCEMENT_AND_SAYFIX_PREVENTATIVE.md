# Health Enforcement Layer + SayFix Preventative Maintenance — IP / Session Handoff

> **What this is.** The captured thinking for two linked things that share one substrate:
> (1) an **internal enforcement layer** that makes it impossible for a portfolio site to reach
> production without meeting the canonical checks, and (2) a **SayFix product upgrade** that turns
> the same health-monitoring substrate into a sellable **preventative-maintenance** service.
>
> **Status.** IP capture only. The **productisation is deferred to a dedicated SayFix session**
> (this doc is its brief). The internal enforcement layer is buildable in our own repos when we
> choose to. Nothing here is built yet beyond the two sensor fixes in §1.
>
> **Origin.** 2026-07-12, off the back of finding two portfolio health sensors silently broken.
> **Owner decision captured:** "if we include the healthchecks into SayFix we can show a much
> stronger service — not just ad-hoc fixes but preventative maintenance."

---

## 1. The evidence that triggered this (why it matters)

Real findings, same night, both invisible until looked at:

- **corporate-ai-solutions** — `health-sensors` GitHub Action had **failed every 6h run for days**
  (exit 1 in 5–9s). Cause was **the check itself, not the site** (site was HTTP 200 throughout):
  the job ran `npx --no-install portfolio-gate-smoke-*` with **no checkout / setup-node / install
  step**, so nothing was installed on the runner and npx 404'd on the public registry. It also
  still shipped the untouched default `auth.config.json` (a marketing site with no user auth).
  **A real outage would have looked identical to this permanent config failure** → the sensor gave
  zero signal.
- **LingoPureAI** — the `health-sensors.yml` was **scaffolded but never committed** (untracked), so
  the product had **no runtime monitoring at all**, plus the same missing-install bug.

Both are now fixed (corporate-ai: install added + auth-smoke dropped as N/A, live-verified green;
LingoPure: committed + install added, auth 8/8 + routes 10/10 live-verified). But the class of
failure is the point.

**The lesson (the thing this doc exists to fix):** the canonical requirements are **defined**
(PRODUCT_STANDARDS, gate-readiness) and **tooled** (naive-tester, voice-auditor, portfolio-gate,
health-sensors) — but **not enforced**. Nothing blocks production on them, sensors drift/rot per
repo, and **no one watches whether the watchmen are even running.** A check that isn't itself
monitored is worse than no check: it manufactures false confidence.

---

## 2. Current state — what exists vs what's missing

| Layer | What it is today | Blocks a bad prod ship? |
|---|---|---|
| PRODUCT_STANDARDS / gate-readiness | The **definition** (docs, 46-check rubric) | No — it's the checklist |
| `/naive-tester`, `/voice-auditor` | **Skills run by hand** in a build session | No — they gate URL-*sharing* via the local url-share Stop hook, not a deploy |
| `portfolio-gate` (`gate.yml`) | CI smoke (auth/routes/session) **on PRs** | Only if branch protection makes it *required* AND Vercel "wait for CI" is on |
| `health-sensors` cron | **Post-deploy** monitor | No — by definition it watches the *already-live* site |
| url-share-gate Stop hook | Local session gate (needs a naive-tester PASS to surface a URL) | Only inside a Claude session, not in CI/CD |

**Three structural gaps:**
1. **No hard pre-prod gate.** Vercel deploys on git push to `main`, independent of Actions unless
   explicitly wired. A push can ship regardless of any check.
2. **Sensor drift.** Each repo copy-pastes `health-sensors.yml` + `*.config.json`; they rot
   independently (missing install step, stale baseUrl, uncustomised auth config, uncommitted file).
3. **No watch-the-watchmen.** Nothing rolls up "which repos have a red or missing sensor."

---

## 3. The two faces of one substrate

The same health-monitoring machinery serves both:

- **Internal enforcement** (governance): don't let *our* sites ship or rot broken.
- **External product** (revenue): sell *clients* continuous preventative maintenance.

Build it once, **dogfood internally, sell externally** — every wired repo is a live proof-point
(the same pattern as usage-meter → cockpit, and the SayFix+Mnemo dogfooding posture). This is the
"encode the methodology once so the machine enforces it" move, applied to reliability.

---

## 4. SayFix product thesis: reactive → preventative (the deferred build)

**Today:** SayFix is *reactive* — a `<SayFixWidget>` a user clicks to file a bug → GitHub issue.
The value story is "we fix what your users report."

**The upgrade:** fold the health substrate in so SayFix also runs **continuous sensors + readiness
monitoring** against each client repo/site and **opens tickets proactively** — "we caught it before
your users did." That reframes SayFix from a bug-report widget into **managed preventative
maintenance**: a stronger service, a higher-value recurring tier, and a much better sales narrative.

Why it fits SayFix specifically:
- It already owns the **tickets table + GitHub wiring + admin console** — proactive tickets slot
  straight in beside user-reported ones.
- The **SayFix+Mnemo partnership** already does semantic recall of prior fixes (Bug Knowledge
  Protocol) — a proactive ticket can arrive *with* the likely fix attached.
- It's already a **distributor-shaped** product (installed per client repo), so preventative
  monitoring is a natural add-on SKU, not a new product.

**Lane note (decide in the SayFix session):** whose brand/keys travel, hosted vs BYOK, and which
lane this monetises as — per BUSINESS_MODEL §2/§3 and the distributor-first gate. Preventative
monitoring is the kind of recurring, ownable, founder-independent shape the model biases toward.

---

## 5. Architecture sketch (for the SayFix session)

```
 per-product repo                     SayFix service                 SayFix admin
 ┌────────────────────┐   report      ┌───────────────────┐          ┌──────────────┐
 │ health sensor      │ ───────────▶  │ health ingest API │ ──────▶  │ status board │
 │ (portfolio-gate    │  (like        │ + rollup          │          │ per repo +   │
 │  smoke + readiness)│  usage-meter) │ (red/missing)     │          │ history      │
 └────────────────────┘               │ + proactive       │          │ alerts       │
          ▲ canonical template        │   ticket opener   │──┐       └──────────────┘
          │ (one source, no drift)    └───────────────────┘  │ opens
                                                Mnemo recall ─┘ ▶ SayFix tickets (with likely fix)
```

Building blocks (map to existing substrate where possible):
- **Canonical sensor** = the portfolio-gate smokes (auth/routes/session) + selected gate-readiness
  checks, packaged so a repo *consumes* it instead of copy-pasting a workflow (kills §2 gap #2).
- **Reporter** = fire-and-forget POST to a SayFix health-ingest endpoint (mirror `@caistech/usage-meter`).
- **Roll-up** = "watch the watchmen": flag any repo whose sensor is **red OR missing OR stale**.
- **Proactive ticket** = on a sustained sensor failure, open a SayFix ticket (dedup, Mnemo-recall a
  prior fix) instead of waiting for a user report.

---

## 6. Internal enforcement layer (buildable in our repos, independent of the product)

The foundation the product sits on — worth doing for us regardless:
1. **Canonical `health-sensors` template** (one source of truth) + per-repo config, so the
   install-step / stale-baseUrl / uncommitted-file drift can't recur. Correct pattern is in
   `gate.yml` and the two fixed sensors (checkout → @caistech-registry setup-node → install → smoke).
2. **A real pre-prod gate:** branch protection on `main` + `gate.yml` required + Vercel
   "wait for CI" → a failing gate blocks the *deploy*, not just the PR.
3. **The roll-up** (§5) pointed at our own portfolio first — the honest dashboard of which products
   actually have a green, committed, running sensor.

---

## 7. Open decisions (resolve in the SayFix session)
- **Client-safe check set.** Routes/uptime are safe against any client site; auth-smoke needs the
  client's test creds; readiness checks may need repo access. Define the tiers.
- **Hosted vs BYOK**, whose brand travels, pricing/lane (§4).
- **Alert channels** (email/Slack/in-app) and the proactive-ticket threshold (don't alert on a
  single transient failure — require N sustained).
- **Relationship to gate-readiness scoring** — is a red sensor a readiness-check input?

---

## 8. Pointers
- Fixed reference sensors: `corporate-ai-solutions/.github/workflows/health-sensors.yml`,
  `LingoPureAI/.github/workflows/health-sensors.yml`; the correct install pattern lives in each
  repo's `gate.yml`.
- Substrate to reuse: `@caistech/portfolio-gate` (the smokes + audits), `@caistech/usage-meter`
  (the fire-and-forget reporter pattern), `@caistech/sayfix-embed` (the widget + tickets),
  the Bug Knowledge Protocol + Mnemo (recall a prior fix onto a proactive ticket).
- Governance context: this doc is the enforcement companion to `PRODUCT_STANDARDS.md` (definition)
  and `THIN_MVP_RUBRIC.md` §6 (gate-readiness). SayFix rollout state: memory `project_sayfix_portfolio_rollout`.

---

## 9. What the SayFix session should know (addendum — 2026-07-12)

**This is no longer greenfield — reconcile, don't restart.** SayFix already shipped
`3afc031` *"feat(sensors): preventative health sensors — catch outages before users, alert both
owner + builder"* (deployed to prod). So the SayFix session's job is to make that feature (a) the
**canonical runner** for the whole portfolio and (b) faithful to the substrate + the failure modes
below — not to build sensors from scratch. First step: read `3afc031` and check it against §5–§7 +
this section.

### 9a. The concrete evidence base (real bugs found 2026-07-12 — the product must catch/avoid these)
These are the exact failure modes tonight surfaced; they are the product's reason to exist and its
own test cases:
1. **A broken check looks identical to a real outage.** `corporate-ai`'s sensor failed every 6h for
   days — but the *site was 200 the whole time*; the **check** was broken (ran
   `npx --no-install portfolio-gate-smoke-*` with no checkout/install → npm 404 on the unscoped bin).
   → The product must distinguish "sensor infra failed" from "target is down," and must **not** page
   the customer for its own broken runner.
2. **The correct workflow shape** (the fix): `checkout → setup-node with registry-url
   npm.pkg.github.com + scope @caistech → install with NODE_AUTH_TOKEN → then the smoke`. Mirror
   `gate.yml`. Ship this ONCE as a canonical template; per-repo copy-paste is what rotted.
3. **Auth-smoke is N/A on a no-user-auth site.** `corporate-ai` is marketing/marketplace (no
   `/login`); the shipped `auth.config.json` was the untouched template pointing at pages that 404.
   → The product needs a **per-target check profile** (routes/uptime always; auth-smoke only where
   user auth exists; session-smoke only where a QA account + real `session.config` exist), not a
   one-size workflow.
4. **An uncommitted sensor = zero monitoring, silently.** `LingoPure`'s `health-sensors.yml` was
   scaffolded but never committed → no monitoring at all, and nothing flagged its absence.
   → **"Watch the watchmen": a MISSING or never-running sensor must alert as loudly as a red one.**
   This is the single highest-value thing the product adds over per-repo crons.

### 9b. Don't fork the substrate (the @caistech-first rule applies here too)
- **Checks:** `@caistech/portfolio-gate` already ships the bins (`portfolio-gate-smoke-auth`,
  `-smoke-routes`, `-smoke-session`, + the audits). Consume them; don't reimplement smokes.
- **Reporter:** copy the `@caistech/usage-meter` shape — fire-and-forget POST to a SayFix ingest
  endpoint, never throws, no-op until env is set. Same ergonomics.
- **Tickets + widget:** `@caistech/sayfix-embed` already owns the tickets table + GitHub wiring — a
  proactive ticket is just a row beside a user-reported one.
- **Likely-fix:** the Bug Knowledge Protocol + Mnemo — on a sustained failure, recall a prior fix and
  attach it to the proactive ticket (the "arrives with the fix" differentiator).

### 9c. "Owner + builder" — get the two recipients right (lane-aware)
The `3afc031` commit already says "alert both owner + builder" — hold that line, and map it to the
business model: **owner = the distributor** (whose customers feel the outage), **builder = the
CAS/operator** (who fixes it). A **white-label** deployment alerts under the **distributor's** brand,
never a CAS one (the "whose brand travels" gate, BUSINESS_MODEL §3). Don't leak CAS branding into a
distributor's incident alert.

### 9d. Threshold + noise discipline (so it's trusted, not muted)
- **N sustained failures**, not one transient blip, before a page/ticket (a single 6h cron miss is
  noise). corporate-ai proved the opposite failure — a *permanent* red that everyone learned to
  ignore. Alert fatigue kills a monitoring product faster than a missed outage.
- **De-dupe** proactive tickets (one open ticket per ongoing incident, not one per run).
- **Self-heal signal:** when a target recovers, resolve the ticket + note duration (that's the
  "we caught it and it's fixed" story the product sells).

### 9e. Client-safe check tiering (what you can run against a client's site)
- **Always safe:** route reachability / uptime / TLS / the marketing surface.
- **Needs the client's test creds:** auth-smoke, session-smoke (their QA account, per §9.5 accounts).
- **Needs repo access:** the gate-readiness static checks. Gate these behind explicit client opt-in.

### 9f. Where the internal enforcement layer meets the product
If SayFix's sensors become the canonical runner, the **internal** enforcement layer (§6) largely
falls out for free: point the same runner + rollup at our own ~38 repos first (dogfood + proof), and
the "which of our products has a green, committed, running sensor?" board is the honest portfolio
health dashboard we currently lack. Build the customer product and the internal governance from the
one substrate.

---

## 10. Field-tested failure taxonomy + 3rd-party deployment architecture (2026-07-12 sweep)

On 2026-07-12 we fixed the sensor across **9 live portfolio repos** and hit, empirically, **every
class of failure a preventative-health-check product will meet in the wild.** This is the single
most valuable input to the SayFix session — it is the product's real test matrix. Grouped by where
the failure lives:

### 10a. CI-install failure modes (all artifacts of running *inside a repo's CI*)
These have nothing to do with whether the target site is healthy — they're install/runner problems:
1. **Runner not installed** — `npx --no-install <bin>` with no checkout/install step → registry 404
   (the original bug, all 25 repos). **A broken runner fast-fails in ~9s and looks identical to a
   real outage.**
2. **Private-registry dependency** — the checks come from the **scoped, private
   `@caistech/portfolio-gate`**; install needs a GitHub-Packages token. Every repo needed
   `setup-node` with `registry-url: npm.pkg.github.com` + `scope: @caistech` +
   `NODE_AUTH_TOKEN`. **← this is the load-bearing 3rd-party blocker, see §10c.**
3. **Lockfile drift + strict install** — `npm ci` / `pnpm install --frozen-lockfile` FAIL on an
   out-of-sync lockfile (F2K-Projects: `Missing @emnapi/runtime from lock file`; F2K-Checkpoint).
   Fix: **tolerant install** (`npm install`, `pnpm install --no-frozen-lockfile`) — a sensor
   validates the live site, not the lockfile.
4. **pnpm ignored-builds** — pnpm 10 exits non-zero on `ERR_PNPM_IGNORED_BUILDS` (sharp/esbuild
   native scripts). Fix: `--ignore-scripts` (a sensor needs the JS bins, not built native deps).
5. **setup-node cache post-step** — `cache: pnpm` errors *"Path(s) for caching do not exist"* in the
   **Post-Setup-Node** step → whole job fails on a benign optimization. Fix: **drop the `cache:` key.**
6. **Package-manager heterogeneity** — npm vs pnpm must be detected + branched (both were present).

**Every one of 1–6 disappears if the checks do NOT run inside the target's CI.** They are the tax of
the in-repo-workflow model.

### 10b. Target-side signal modes (the actual monitoring value — keep these)
These are real signal about the deployment; the product must surface them, not mask them:
7. **Missing/uncommitted sensor** — 17 repos had the workflow file locally but **never pushed to
   `main`** → zero monitoring, silently. The product's **watch-the-watchmen** must alert on
   *absent/never-run*, not only red.
8. **Auth-surface drift** — auth checks hit `/login`,`/signup`,`/forgot-password` that **404** because
   the target is marketing/API/parked/admin-only, or its auth lives elsewhere (property-services:
   none; F2K-OffshoreModular & F2K-Projects: `/admin/login`; F2K-Checkpoint: all present). The
   product must **auto-detect or client-declare the auth surface per target** — and must NOT assume
   `/login` exists.
9. **Wrong/stale target URL** — investorpilot's configured URL was a *dead* domain
   (`investorpilot.vercel.app`) while the live one was `investor-pilot-pi.vercel.app`. The sensor
   correctly went red. **Owning + validating the target URL is the product's job**; a stale URL is a
   false red that trains users to ignore alerts.
10. **Protected / ambiguous endpoints** — `/api/health` returned **401** (auth-protected) where the
    config expected 200. Need **per-route expected-status**, client-declarable.
11. **"Our probe broke" ≠ "your site is down"** — modes 1–6 must never page a client. The product
    must self-distinguish sensor-infra failure from target failure (different severity, different
    recipient).

### 10c. THE architecture implication for 3rd-party clients (read this twice)
The portfolio model — *a GitHub Actions workflow committed into the target repo that installs a
private `@caistech` dep and runs smoke bins from inside CI* — **cannot ship to a 3rd-party SayFix
client.** A client cannot install `@caistech/portfolio-gate` (private moat, §10a-2), and you cannot
assume their package manager, lockfile state, build scripts, auth surface, or URL (§10a-3..6, §10b).
Requiring them to add a workflow + a secret + tuned config files reproduces, on their turf, every
failure we just spent a day fixing by hand.

**→ For 3rd-party, run the checks from SayFix's OWN hosted infra as external black-box probes, NOT
from inside the client's CI.** An external runner hits the client's live URL(s) from outside —
route/uptime/TLS reachability, auth-page presence, expected statuses — with **zero client CI, zero
private dep, zero lockfile/pm/build exposure.** That single decision deletes failure modes 1–6
outright and leaves only the genuine target-side signal (7–11). Consequences to design for:
- **The client registers targets, not workflows:** URL(s) + a **check profile** (auth surface,
  per-route expected statuses, protected endpoints) — self-serve or auto-detected on first probe.
  The per-repo tailoring we did by hand *is the product's onboarding wizard.*
- **Deeper checks that truly need to be inside** (authenticated session-smoke, in-repo readiness)
  require the client's **test creds** (session) or **repo access** (readiness) — gate behind explicit
  opt-in, and *still* prefer SayFix-infra-with-injected-creds over asking them to wire CI.
- **Package the checks for reuse without the private registry** — either a SayFix-hosted runner that
  bundles `@caistech/portfolio-gate`, or a public/thin check runner. Never ask a client to auth to
  `npm.pkg.github.com`.
- **Own target-URL config** as first-class (clients change deploy URLs constantly — §10b-9).
- **Tolerate everything you don't control** on the target; alert only on genuine target-side signal.

**One line for the SayFix session:** *the in-repo-CI sensor is right for OUR ~38 repos (we own the
registry token); for paying clients, flip it to an external hosted probe — targets + profiles, not
workflows + secrets — and modes 1–6 vanish while the real signal (7–11) remains.*

---

## 11. Built — step 1 of the external-probe engine (2026-07-12)

The §10c decision is now **partly built**, not just captured. The 3-layer split it implies (shared
check **engine** · SayFix **hosted execution** · client **registers a target** — never autodeploy into
the client repo) is recorded in SayFix memory `sayfix-health-probe-architecture`.

**Shipped this session:**
- **`@caistech/health-probe@0.1.0`** (published to GitHub Packages) — the shared check ENGINE. Pure,
  app-agnostic `Check` functions + `runChecks` + a `REGISTRY`; zero-dep, injectable fetch, never throws.
  **Tier-0** checks (`reachability`, `http_status`) are live — `http_status` is SayFix's original
  `runHttpSensor` **lifted verbatim** (5xx/unreachable = breach, 4xx is not). `faultDomain`
  (`network|app|auth|target-config`) is the **surviving fault taxonomy** — modes 1–6 (§10a) can't occur
  for an external probe, so they aren't modelled; only the target-side signal (7–11) remains as
  `faultDomain`s a check reports. Registry slots for **Tier-1** (`health_endpoint`, `auth_smoke`) are
  reserved, implementations TBD (they need the wizard's target-side setup).
- **SayFix consumes it** — `src/lib/sensors/http-check.ts` is now a thin adapter over the engine's
  `http_status` check (SayFix `a40bdf3`); `raise.ts`, the `/api/cron/sensors` executor, and the tests
  are unchanged (45/45 green). SayFix's cron is the **hosted executor** (layer 2).

**The two-executor payoff (why the engine exists):** the same library will back **portfolio-gate's CI**
executor (against a preview) and **SayFix's hosted** executor (against prod) — one check set, two
callers. That collapses the CI-vs-hosted duplication §10 warns about.

**① DONE (health-probe 0.2.0):** `health_endpoint` (Tier-1) is built + published — GET `url + healthPath`
with an optional read-only Bearer token + `expectedStatus`; a **401/403 → a `target-config` fault**
(§10b-10). SayFix runs it via the engine's `runChecks([http_status, health_endpoint?])`; `raise.ts` is
now **check-agnostic** (consumes any `CheckResult`; the old `http-check.ts` adapter is deleted); and the
SayFix onboarding wizard step (`/api/beta/health-check` + the install-page `HealthCheckSetup` panel —
token write-only, never returned) lets the owner **register a path + token** (SayFix `0bef92f`; migration
`repos.health_endpoint_path`/`health_token` applied to prod). 50/50 tests green.

**③ DONE (health-probe 0.3.0 + portfolio-gate 0.5.0):** the second consumer is wired. The engine now
exports **`probeOnce`** — the shared GET transport (timeout/abort/never-throw/injectable-fetch/
follow-or-manual-redirect/headers) — and `@caistech/portfolio-gate`'s `runRouteSmoke` GETs through it
instead of its own inline fetch. Key judgement: **only the transport is shared, not the classification.**
CI route-assertion (exact/2xx-lenient, manual redirect, auth-lenient) is deliberately a DIFFERENT policy
from hosted monitoring (5xx-only, follow, 401=target-config), so merging the policies would have changed
portfolio-gate's CI behavior (it gates real repos, no unit tests) — a regression risk avoided. The fiddly,
easy-to-get-wrong fetch is single-sourced; each executor keeps its own semantics. Functionally verified
against live URLs (passes real 200s, correctly flags an expected-status mismatch).

**Live-loop proof (2026-07-12):** the dogfood (`caistech/sayfix`) now has `health_endpoint_path=/api/health`
(a real DB-ping endpoint added + middleware-allowlisted). Triggering the cron in prod returned
`http_status ok; health_endpoint ok` — both Tier-0 and Tier-1 checks running hosted from SayFix's infra.

**② DONE (health-probe 0.4.0 + SayFix `31a57a9`):** `auth_smoke` (Tier-1) — the hosted probe POSTs a
dedicated probe account's `{email,password}` to the target's login endpoint and treats 2xx/3xx = auth
up, 4xx = an `auth` fault, unconfigured = a `target-config` note (opt-in, degrade-don't-fake, so no
alert-fatigue false alarms — §9d). `probeOnce` gained method+body; SayFix's cron adds `auth_smoke` to the
sweep when configured; the install-page wizard panel registers the probe account (password write-only).
v1 assumes a JSON login endpoint (Supabase-gotrue / NextAuth shapes are future variants). **All Tier-0 +
Tier-1 checks now built** — the check set is complete for the current model.

**Remaining:** the **watch-the-watchmen** roll-up (§10b-7 — 17 repos have the sensor file but never
pushed) is an *internal* governance gap, separate from the client model. Provider-specific `auth_smoke`
shapes (gotrue/NextAuth) when a real client needs them.
