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
