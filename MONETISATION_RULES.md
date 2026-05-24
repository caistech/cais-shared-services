# MONETISATION_RULES.md

Non-negotiable rules for the methodology-monetisation operation. These are treated with the same severity as the AUTH PAGE PATTERN and RESPONSIVE DESIGN rules in the global `CLAUDE.md`. Missing or violating any of these is a bug, not a polish item.

> **Canonical location:** `cais-shared-services/MONETISATION_RULES.md` (this file — version-controlled, travels with the repo, readable from any clone). The narrative that frames these rules is `BUSINESS_MODEL.md` next to it; §9 there summarises every rule in one line. Moved here from `C:\Users\denni\` on 2026-05-24 so the full rule text is portable.
>
> **Last updated:** 2026-05-24 (rules locked; header added 2026-05-25).

**Sibling artifacts** (operator-local — these stay in the home directory, not in the repo, because they are personal/weekly-operational rather than shared doctrine):
- State file (what's true this week): `C:\Users\denni\MONETISATION_STATE.md`
- Execution plan (milestone sequence): `C:\Users\denni\MONETISATION_EXECUTION_PLAN.md`
- Design doc (the strategy): `C:\Users\denni\.gstack\projects\denni\denni-unknown-design-20260520-014844.md`

---

## RULE 1 — BANDWIDTH TRIPWIRE IS HARD (NON-NEGOTIABLE)

Portfolio-side hours must not drop below **~25 hrs/wk for 4 consecutive weeks**. If they do, new engagement intake pauses immediately and any active engagements drop to 1 until the metric recovers for 4 consecutive weeks.

### How to apply

- Track weekly in `MONETISATION_STATE.md` Tripwire table. No exceptions for "I was busy this week" — log a number even if it's low.
- Tripwire status flips on a rolling 4-week window, not a single bad week. One bad week is yellow; four is red.
- Red status = immediate pause on prospect calls, no contract signing, no scope expansion on active engagements. Existing engagements are honoured at reduced load.
- The recovery path is symmetric: 4 consecutive weeks of ≥25 hrs portfolio time to flip back to green.

### Why this rule exists

The single load-bearing risk in the entire monetisation plan. Both the doc's author and the round-1 reviewer flagged this as where the plan most likely breaks. The 17+ products fund the substrate that the engagements install; if engagements cannibalise portfolio time, the substrate rots, the products that prove the substrate fail in production, the case studies become un-publishable, and the entire monetisation thesis collapses. The factory funds the engagements — never the other way around.

### Verification heuristic before claiming OK to sign a new engagement

- Pull `MONETISATION_STATE.md` Tripwire table.
- Last 4 weeks ≥25 hrs portfolio-side? If yes, proceed. If no, do not sign — defer or decline.

---

## RULE 1B — VALUE-WEIGHTED EFFORT ALLOCATION (NON-NEGOTIABLE)

Operator time is the scarce resource every lane competes for. Effort is allocated by a **value-weighted formula across the four lanes + infrastructure**, applied uniformly as policy — NOT per-task gut feel (same discipline as the product-selection rubric in `BUSINESS_MODEL.md` §5). Rule 1's engagement-bandwidth tripwire becomes one *instance* of this rule's floors: Rule 1 protects the portfolio from engagements; Rule 1B protects high-value work from **all** low-value work, in every direction. Locked 2026-05-24.

### The formula

**1. Lane value weights** — what a unit of effort *there* is worth (0–10):

| Stream | Weight |
|---|---|
| Lane 1 — paid distributor SaaS (primary revenue) | 10 |
| Infrastructure (`@caistech`) — leverage multiplier | 8 |
| Lane 3 — contract builds (direct revenue, on demand) | 6 |
| Lane 2 — studio in-residence (capped) | 5 |
| Lane 4 — BYOK-only (awareness, no revenue) | 2 |

**2. Task Value Score (TVS)** = the weight of the highest-value lane the task serves **+2 for each additional lane served from the same effort** (the multi-lane leverage bonus). A BYOK-only build scores 2; a distributor build that throws off a BYOK marketing offshoot scores 10+2 = **12** — the sweet spot the formula deliberately rewards. Design builds to serve multiple lanes.

**3. Allocation** — discretionary build/sell time flows in proportion to TVS, subject to:
- **Floors (anti-starvation):** infrastructure ≥ ~20% of discretionary time; cash-delivery (lane-1 hosted ops + active lane-3 contracts) ≥ its committed load. Shiny new builds cannot starve the substrate or the paying work.
- **Caps:** lane 2 ≤ its capacity cap (2×3mo / 1×6mo per year, per Rule 1 + Rule 7); lane-4-*only* work ≤ ~10% of discretionary time (past that, low-value awareness is eating revenue work).

**4. The drift tripwire** — fires when low-value work breaches a high-value floor over the rolling 4-week window (e.g. cash-delivery or infra below floor while lane-4-only or speculative new-build time is above cap). Same window mechanic as Rule 1.

### How to apply

- Tag each substantive block of build/sell time with the lane(s) it serves; compute TVS. Track the time-weighted-average TVS + floor/cap status in `MONETISATION_STATE.md` alongside the Rule 1 tripwire.
- When choosing what to do next, prefer the higher-TVS task — explicitly favour multi-lane builds (distributor + BYOK-offshoot) over single-lane ones.
- Weights, the +2 bonus, floors, and caps are a **one-time policy** from the thesis; review only if the output is obviously wrong, never by re-scoring a single task by gut.

### Why this rule exists

Rule 1 guarded only one direction (engagements eating the portfolio) because it predates lane 1 being the primary revenue lane. With four lanes of differing value competing for the same hours — and the most *interesting* work (new builds) often the lowest-value (BYOK-only) — an undifferentiated "portfolio hours" bucket lets low-value work crowd out high-value work invisibly (it all reads as "portfolio time"). This rule makes the trade-off explicit and formulaic, so effort tracks value the way product selection tracks the rubric. Dennis 2026-05-24: low value = build for BYOK-only; high value = build for a distributor with a BYOK offshoot; medium = studio/VC in-residence (some time, capped).

### Verification heuristic before committing a block of time

- What lane(s) does this serve? What's its TVS? Is there a higher-TVS option (especially a multi-lane one) I'm skipping for a more interesting low-value one?
- Are infra + cash-delivery above their floors this week? If a floor is breached and I'm about to do lane-4-only / speculative work, stop — the tripwire condition is forming.

---

## RULE 2 — WEEKLY TIME-LOG PRECEDES ENGAGEMENT INTAKE (NON-NEGOTIABLE)

You cannot sign engagement N if you have not been logging weekly hours for at least 4 weeks prior. Instrumentation precedes intake.

### How to apply

- Engagement 1 cannot sign until the time-log has been running for ≥4 weeks (so the tripwire check above has actual data).
- Each subsequent engagement requires the immediately prior 4 weeks of logged hours.
- "I'll start logging when the engagement begins" violates this rule.

### Why this rule exists

Rule 1 is enforceable only if Rule 2 is. Without 4 weeks of prior data, the tripwire check is a vibes call. The reviewer raised this as the most important fix: "the gate decision at month 4 will need actual portfolio hours data, which is not currently tracked." This rule closes that gap before it can cause a bad signing decision.

### Verification heuristic before scheduling a prospect call

- Has time-logging been running ≥4 weeks? If no, the call is fine, but a contract is not.

---

## RULE 3 — NDA + SANITISATION CHECK BEFORE EVERY PUBLIC ARTIFACT REFERENCING A CLIENT (NON-NEGOTIABLE)

Every Factory Floor post, every public CLAUDE.md drop, every case study, and every LinkedIn share that references a current or former client must pass a sanitisation review **before** it is published.

### How to apply

- Sanitisation checklist: client name, Supabase project ref, Vercel project slug, domain, internal-only file paths, specific commit references, anything covered by an NDA, anything covered by a service agreement confidentiality clause.
- If unsure whether a reference is covered, treat it as covered. Default-deny.
- For named-client case studies (the publishable kind), explicit written consent is required — see Rule 4.
- MMC Build is named explicitly here because it is a paying client likely under NDA. Anything in any public artifact that references mmcbuild, MMC Build, the project name, the Vercel slug, or any commit must be cleared before publish.

### Why this rule exists

A single naming leak in a Factory Floor post causes a contract issue with a paying client, which kills the funding for the substrate that funds the engagements. The cost of half a day of sanitisation review is small; the cost of a paying client filing a breach is unrecoverable. The user's exact concern from the office-hours session: "NDA check with MMC Build before publishing anything that references the project."

### Verification heuristic before clicking publish

- Run the file through the sanitisation checklist above. List every client-related reference in the artifact.
- For each reference, can you state which authorisation covers it? Public website? Signed consent? Generic / no client tie? If "I think it's fine," it's not fine.
- If anything is uncertain, hold the post until cleared.

---

## RULE 4 — CASE-STUDY CONSENT CLAUSE IS MANDATORY IN EVERY ENGAGEMENT CONTRACT (NON-NEGOTIABLE)

No engagement contract is signed without an explicit case-study consent clause, negotiated up-front and baked into the standard template.

### How to apply

- The standard contract template includes a clause specifying: (a) Dennis may publish a quantified case study at engagement end; (b) the client gets review rights with a fixed turnaround window (suggested 14 days); (c) the client can request anonymisation but cannot block publication entirely if the engagement was a commercial success; (d) the case study format follows the published case-study spec.
- If a client refuses the clause, the engagement does not proceed. This is a precondition, not a negotiation item.
- "We'll add the clause later if it goes well" violates this rule. Late case-study negotiation is structurally weak — the client has all the leverage.

### Why this rule exists

The Studio Fund (Phase 2) thesis is gated on published case studies. Engagements without case-study rights are pure consulting — they produce cash but not the asset that builds the brand and funds the next stage. The reviewer specifically flagged this as a gap: contract templates were hand-waved in the design doc. Locking the clause up-front protects every downstream stage.

### Verification heuristic before signing

- Open the contract draft. Locate the case-study consent clause. If it is missing, the contract is not ready to sign — regardless of how close to close.

---

## RULE 5 — FIRST PUBLIC ARTIFACT SHIPS BEFORE ANY SALES OUTREACH (NON-NEGOTIABLE)

No prospect outreach (cold, warm, or warm-intro-via-existing-network) until the first public artifact — sanitised CLAUDE.md gist or doctrine doc — is live and shareable.

### How to apply

- Order of operations: Step 0 (sanitisation triage) → publish gist + README → LinkedIn share → THEN prospect conversations.
- "I want to start conversations now and publish later" violates this rule.
- Existing inbound or warm intros that arrive before the publish are not "outreach" but should be queued — you can take an introductory call but do not pitch an engagement until the artifact is live.

### Why this rule exists

The audience-led monetisation premise (#2 in the design doc) is that the public artifact makes the value of the methodology legible *before* a prospect talks to you. If prospects encounter the methodology purely through Dennis's verbal pitch, the audience-led thesis is unfalsified — you cannot tell whether the methodology sells on its own merits or because Dennis is good in a room. Publishing before pitching tests the premise honestly. It also gives every conversation a concrete artifact to point to, which compresses the sales cycle.

### Verification heuristic before sending a prospect message

- Is the public artifact live? If yes, proceed. If no, write the artifact first.

---

## RULE 6 — ANTI-FORK ON SHARED MONETISATION ARTIFACTS (NON-NEGOTIABLE)

There is one contract template, one case-study spec, one Factory Floor post template, one engagement-onboarding checklist. If engagement N needs something different, fix the shared artifact — do not fork it into a per-engagement copy.

### How to apply

- Same discipline as the `@caistech` shared-services rule in the global `CLAUDE.md`. If engagement 2 needs a clause not in the template, add it to the template (parameterised if needed) and use the updated template.
- Per-engagement Word-doc snowflakes are the failure mode. Every fork accumulates as future technical debt and dilutes the leverage the rule exists to create.
- The first time a divergence is needed, it goes in the shared artifact. The second time it's needed, the shared artifact is the only place to look.

### Why this rule exists

The whole methodology rests on substrate reuse. Forking the contract template on engagement 2 is the same anti-pattern as forking `@caistech/platform-trust-middleware` into a consumer repo. Both compound into chaos; both have already been ruled-out at the infrastructure level. The monetisation operation must inherit that discipline or it cannot honestly claim to teach it.

### Verification heuristic before creating a new contract

- Is this a copy of the template with N modifications? If yes, the template needs N additions — make them in the template first, then derive the contract.

---

## RULE 7 — EQUITY CEILING: 3% PER COUNTERPARTY (NON-NEGOTIABLE)

No engagement contract takes more than **3% equity** in any single counterparty. This ceiling is firm regardless of perceived upside.

### How to apply

- Cap applies to common, preferred, options, or any economic-equivalent instrument.
- The cap applies **per counterparty**, not aggregate-per-stint. Under the hybrid engagement model (Shape B of the `/engagement` page spec — host studio + cohort portfolio companies as separate counterparties), each counterparty has its own 3% ceiling. So a single stint can total >3% equity exposure across the cohort, but no single signed party gives up more than 3%.
- Target bands by counterparty type (locked 2026-05-19):
  - **Host (VC fund / studio / accelerator / dev shop):** target 1–3%, midpoint 2%.
  - **Cohort portfolio company (fractional CTO retainer alongside the host engagement):** target 0.25–1%, midpoint 0.5%. The 3% Rule 7 cap is the absolute ceiling on these too, but signing a cohort company at >1% is a yellow flag — that level of equity should buy more than the cohort-fractional-CTO scope and probably needs to be a standalone engagement.
- If a client offers more equity in lieu of cash, the answer is "no — the cash floor is the cash floor." (See Rule 1 — cash funds the portfolio that funds the engagements.)
- Cumulative exposure across all active + past engagements informs the Studio Fund conflict-of-interest profile, so a per-counterparty ceiling is the only mechanism that bounds it.

### Why this rule exists

The Phase 2 Studio Fund thesis requires LPs to back Dennis without prior equity positions creating undisclosable conflicts of interest. The reviewer flagged this: "1–3% × 2–3 shops/year × 3–5 years = 9–45% of Dennis's time bound to other people's cap tables. If a Studio Fund happens in 2027–2028, that prior equity may constrain LP terms (conflict of interest)." Capping at 3% per engagement keeps the cumulative exposure bounded and disclosable.

### Verification heuristic before signing

- Read the equity clause. Convert any complex instrument to economic-equivalent equity. Is the number ≤3% **for this counterparty**? If not, renegotiate or decline.
- If the stint involves multiple counterparties (hybrid engagement model), repeat the check per signed party. The aggregate across the stint can exceed 3% — that's expected and intentional in the hybrid model — but no individual signature can.

---

## RULE 8 — PORTFOLIO ROT TRUMPS ENGAGEMENT GROWTH (NON-NEGOTIABLE)

If any REGULATED-tier project (mmcbuild, F2K-Checkpoint, F2K-Fund-Tokenisation, platform-trust, ndissda-automate, r-and-d-tax, disaster-support) is in incident state, engagement work pauses that week. The substrate that funds the engagements is repaired first.

### How to apply

- "Incident state" means: production outage, regulatory deadline at risk, paying-client escalation, RLS leak, auth breach, or any other Tier-1 issue per the `CLAUDE.md` risk-tier rules.
- When an incident is declared, the engagement day for that week is dropped. Inform the engagement client same-day with a brief explanation ("a regulated-tier project incident is taking priority this week, we will resume Monday").
- This is not a renegotiation of the engagement scope — it is a one-week deferral. Repeat occurrences trigger Rule 1 (bandwidth tripwire) review.

### Why this rule exists

Two failure modes this prevents: (a) the regulated portfolio rotting because engagement work cannibalises incident response — exactly the bandwidth concern Rule 1 covers, but Rule 1 is monthly-window; this rule is incident-day; (b) the brand being damaged because a Factory Floor post about "leverage across the portfolio" lands the same week a client incident is being mishandled. The factory must demonstrably work on its own products before it can credibly install elsewhere.

### Verification heuristic at the start of each engagement day

- Quick portfolio status check before engagement work begins. Any Tier-1 incident open? If yes, defer the day. If no, proceed.

---

## RULE 9 — `@caistech` REGISTRY STAYS CLOSED (NON-NEGOTIABLE)

The `@caistech/*` package source code is the moat. Per-product BYOK-free releases show *consumption* of `@caistech` (visible in `package.json`), never the source. Per-product repositories may be MIT-licensed; the shared-services hub stays private.

### How to apply

- BYOK product repos contain product-specific code only. Imports from `@caistech/*` are visible in `package.json` and resolved against the private GitHub Packages registry at install time.
- Each release's README explicitly names which `@caistech/*` packages it consumes — that visibility IS the methodology proof. Readers can see the substrate without the substrate being open.
- Open contributions to BYOK product repos are welcome under the product's license. If a contribution touches behaviour that lives in an `@caistech/*` package, the path is: open a discussion → Dennis files an issue against the hub → improvement lands in the hub → product version-bumps the dependency.
- The contribution-back clause in the engagement contract template (see Rule 4 / Rule 6 ecosystem) matches this pattern: improvements to shared packages flow back to the hub under existing license; client-specific code stays with the contributor.

### Why this rule exists

The substrate is the unicorn — per the "factory IS the moat" positioning that frames the whole monetisation plan. Open-sourcing the substrate would dilute the studio-in-residence value proposition: the engagement is *"install access to the hub for the duration of your retainer"*. If the hub source is public, the engagement reduces to commodity consulting. The asymmetry (consumers see consumption, only operators-in-residence see source) is what makes Phase 1 cash work and what makes the Phase 2 Studio Fund credible later. Lose the asymmetry and both stages collapse.

### Verification heuristic before any product release

- Does this repo include source code for any file under `cais-shared-services/packages/`? If yes, remove it. The product consumes `@caistech` via imports; it never vendors.
- Does the README name the `@caistech/*` packages it depends on, with a short sentence on what each one does? If no, add this section — it's the methodology proof for readers.

---

## RULE 10 — EVERY KEY IS USER-PROVIDED IN EVERY BYOK PRODUCT (NON-NEGOTIABLE)

In every BYOK-free product release, **every external service whose usage scales with end-user activity** requires a user-provided credential at install or in-app settings. Zero exceptions. No fallback to CAS-owned accounts. No *"we'll just proxy this one because it's small"*.

This rule covers, at minimum: LLM providers (Anthropic, OpenAI, OpenRouter), email senders (Resend, SendGrid, Postmark), enrichment APIs (Hunter, Apollo, Clearbit), search APIs (Brave, Serper, Tavily), voice providers (ElevenLabs), geocoding (Mapbox, Google Maps), CRMs (Go High Level, HubSpot), social channels (Unipile, LinkedIn API, Slack), Supabase project credentials, and anything else the product consumes from a third party that bills by usage.

### How to apply

- Every required third-party service has a row in the product's in-app settings UI (e.g. `/settings/credentials`) for the user's credential. Missing credential = the relevant feature is **disabled** with a clear message, never silently proxied through a CAS-owned key.
- LLM keys accept multiple providers as user choice: direct Anthropic, direct OpenAI, or OpenRouter. The user picks; the product never falls back to a CAS-owned key.
- Credentials are stored per-user, **encrypted at rest**, in a project-local Supabase table (e.g. `operator_credentials`). Never written into deployment env vars at build time on a CAS-owned account.
- The README has a **"Required credentials"** section listing every required key: service name, where to obtain a key, cost model (free tier / paid), whether the key is required or optional, what feature degrades without it.
- A product that **cannot be fully BYOK** for structural reasons (e.g. it depends on a CAS-exclusive contract or a service that doesn't expose user-level credentials) does **not** ship in BYOK form. It stays internal until it can be made fully BYOK, OR it ships as an explicit paid SaaS where the cost passthrough is itemised on the user's invoice.
- Self-hosting path: same constraint. Any `setup.sh` or one-click-deploy template prompts the user for every key; there is no default key file pointing at a CAS-owned account.

### Why this rule exists

The user's exact framing on 2026-05-20: *"its got to be clean or i have the worst of all worlds, no revenue and costs."* The third pillar of the methodology monetisation plan — BYOK-free open-source products as a distribution surface — only works if it is **genuinely zero-marginal-cost-per-user for CAS**. One leaky key (Hunter, Resend, anything that bills per request) plus 100 users at moderate scale generates four or five figures of monthly API spend with no offsetting revenue. Catching this post-release means rotating keys, breaking user installs, and a public methodology credibility hit ("the operator who teaches portfolio engineering can't run his own free products without bleeding cash"). The rule must be absolute at release time.

### The single carve-out

CAS-side infrastructure that scales with the **number of installs** rather than per-install usage volume — release download counters, anonymous install telemetry, version-check pings — is acceptable *if and only if* it is disclosed in the README and clearly opt-out-able by the user. Anything that scales with end-user product usage is not in this carve-out and is covered by the main rule.

### Verification heuristic before any BYOK product release (RELEASE-BLOCKING)

- Audit every `process.env.X` reference in the codebase. For each one, classify:
  - **(a) user-provided credential** — surfaced in the in-app settings UI, stored per-user encrypted, no CAS fallback.
  - **(b) CAS-owned but scales-with-installs** — acceptable per the carve-out; verify disclosure in README and opt-out path.
  - **(c) CAS-owned and scales-with-end-user-usage** — **BLOCKING**. Refactor to (a) before release. No exceptions.
- Settings UI parity check: every (a) appears as a row in the in-app credentials settings page. If a key only lives in deployment env vars, the user has no path to set it — that's not BYOK, that's "Dennis-pays-by-default with a manual override nobody will find."
- README parity check: every (a) appears in the "Required credentials" section with a where-to-get-it link and cost note.

---

## RULE 11 — THE OPERATOR DOES NOT WAIT (NON-NEGOTIABLE)

When a vendor (or any external party whose response gates progress) is silent or slow, the operator move is to **draft the answer or workaround yourself from public surfaces**, not to wait. The methodology's whole thesis rests on the operator routing around bottlenecks the substrate has already absorbed; reflexively reaching for *wait / defer / risk-flag* defaults is the failure mode this rule prevents.

### How to apply

- When facing a blocker that depends on a vendor response (bug report unanswered, API question unresolved, support ticket pending, documentation gap unfilled): assume the response time is *indefinite* and plan accordingly.
- Pull the public surfaces yourself — vendor docs, public GitHub repo / commits / issues, community Slack/Discord archive, SDK source code, recent changelog, your own symptom data, comparable reports from other customers if visible.
- Use CQR-shaped tooling (or any KB-retrieval + LLM-drafting pipeline) to produce a high-confidence drafted answer or workaround from those public surfaces in **minutes**.
- Build the workaround into your pipeline. Document the assumption. Move on.
- If/when the vendor eventually responds, reconcile against the workaround. If they confirm: remove the workaround. If they don't: the workaround was the right call anyway.
- The decision to wait is a deliberate choice (cost vs. value of the answer), not a default posture. If you find yourself waiting because you haven't drafted, you are violating this rule.

### Why this rule exists

The user has called out reflexive *wait-for-vendor* framing repeatedly across this session — *"none of it's non-trivial — that's why it's a good thing to surface as many of these items now"*, and again on 2026-05-20: *"why weeks? why not minutes? that's what CQR does after all."* Both corrections expose the same Claude / operator failure mode: when an external dependency is slow, the reflex is to defer rather than route around. For an operator running 17+ products against N external vendors, vendor response time would dominate the critical path if waiting were the default. The methodology's defensibility — the factory ships fast because the substrate absorbs the work the operator would otherwise wait for — requires this rule to hold *especially* when the substrate is doing its job well enough that waiting looks cheap. It isn't. Waiting compounds.

The rule also has a second-order purpose: it surfaces the CQR-shaped product opportunity. When the operator routes around vendor silence by drafting answers from public surfaces, that is *literally what CQR does as a product*. Every time this rule fires, it generates evidence for the CQR thesis — Factory Floor essay material, customer-self-serve ICP validation, and concrete proof that vendor response time is a real cost worth eliminating.

### Verification heuristic before any "wait for X" decision

- Is the answer (or a working approximation) producible from public surfaces in <1 hour using CQR-shaped tooling? If yes, draft it. Do not wait.
- Is the cost of waiting (blocked work, stalled deploy, customer-impact compounding) higher than the cost of running the draft pipeline? If yes, draft it. Do not wait.
- Does the wait have a defined deadline (a specific date or commitment from the vendor)? If no, the wait is open-ended — treat as indefinite and route around.
- If you have already chosen to wait, did you record that decision with a date and a tripwire ("if no response by X, switch to drafted workaround")? If no, the wait was a default, not a decision — go back and draft.

If any answer is "no" → the operator was about to wait when the methodology calls for drafting. Stop, draft, move forward.

---

## RULE 12 — NO UNCOVERED COST EXPOSURE (NON-NEGOTIABLE)

**We are never exposed to costs that are not pre-covered.** Every dollar of vendor cost, infrastructure cost, or operational cost CAS incurs on behalf of a customer must already be covered by money in hand — prepaid credits, paid-in-advance subscription cycle, or escrow — before the cost is incurred. Not "we'll bill at end of month for what they used." Not "we'll absorb the overage and chase reconciliation later." Not "it's a small leak, we can eat it."

### How to apply

- **BYOK products** satisfy this rule by construction — every metered call lands on the customer's own vendor account. No CAS exposure to engineer around. (This is Rule 10's same DNA in different clothes.)
- **Hosted products** must engineer compliance:
  - Subscription cycles bill in advance; the cycle does not start until the payment clears.
  - Credit packages are prepaid balance; calls draw down the balance; balance below the cost of the next call disables the feature (see Rule 14).
  - Single-tenant infra fixed costs (Supabase Pro, Vercel Pro share, etc.) are amortised into the plan price and invoiced in advance, not in arrears.
  - Add-on usage (voice minutes beyond plan, extra API calls beyond plan) requires a topped-up credit balance before the call is allowed.
- **Pricing formula compliance:** the monthly price must cover the **ceiling + buffer**, not the **expected average**. The pricing formula's margin layer exists in part to absorb cap-lag dollars (the small window between "customer hits cap" and "customer actually tops up or upgrades"). Pricing for expected average violates this rule because actual usage volatility regularly exceeds expected — and the volatility lands on CAS.
- **Customer-facing language:** the model is "prepaid + transparent" — never "post-bill + surprise invoice." Marketing copy says "pay your plan, use up to X; need more, top up or upgrade." It does not say "we'll bill you for what you use."
- **Refund policy when a customer cancels mid-cycle:** the customer keeps the rest of the cycle they've already paid for; CAS does not refund and does not extend. The pre-pay model is symmetric — we don't pre-spend on their behalf and they don't pre-spend on ours.

### Why this rule exists

The user's exact framing on 2026-05-23: *"the philosophy is that we are never exposed to costs that are not pre-covered."* Hosted products with usage-based vendor costs (LLM, voice, email-at-scale) can incur four-figure vendor bills in a single bad week if one customer's usage spikes and CAS is the named account holder. Without this rule, the BYOK Factory's hosted tier is structurally a venture loss-leader pretending to be a SaaS — the worst of all worlds. With it, the hosted tier is a predictable revenue surface and a controlled cost surface in the same shape.

This rule sits above Rules 13 + 14 — single-tenant choice and usage caps are *implementations* of this principle, not the principle itself. If any future mechanic (a new pricing model, a new product type, a new vendor integration) is proposed and cannot satisfy "no uncovered cost exposure," the mechanic is the bug, not the rule.

### Verification heuristic before launching any hosted product or pricing tier

- Walk the worst-case usage scenario: a customer on the bottom plan uses 10× their fair-share quota in a week. Does CAS pay any vendor bill that isn't covered by money already received from that customer? If yes, the mechanic violates this rule. Refactor before launch.
- Walk the cancellation scenario: a customer cancels the day after the cycle bills. Does CAS owe a refund larger than the unspent portion of the prepaid balance? If yes, the refund policy or the billing model violates this rule.
- Walk the cap-lag scenario: a customer hits 100% of plan limit at 3am. From 3am until they top up or upgrade, can the system continue to incur vendor costs on their behalf? If yes, Rule 14's hard-cut is not actually hard. Fix it.

---

## RULE 13 — SINGLE-TENANT IS ALWAYS A CUSTOMER CHOICE (NON-NEGOTIABLE)

Every hosted product purchase flow MUST offer single-tenant as a customer-selectable option, with rationale capture, regardless of whether the product has an operational reason to require single-tenant. The customer's regulatory or privacy requirements may force single-tenant even when CAS's infrastructure has no operational difference.

### How to apply

- The hosted checkout flow presents two tenancy options, side by side:
  - **Shared infrastructure (default)** — same Vercel project + Supabase project as other customers; RLS-isolated data; zero marginal infra cost; lowest price tier available.
  - **Dedicated infrastructure** — your own Vercel project + your own Supabase project; physically isolated; higher fixed monthly cost (~$45–65/mo baseline + plan price); required if your compliance regime mandates it (HIPAA, FedRAMP, certain financial-services configurations, certain state government regimes).
- A short rationale field is captured at checkout when the customer picks dedicated infra. Free-text — "internal compliance policy" / "data-residency clause in our customer contract" / "audit team requires it" / etc. Captured on `hosting_subscriptions.tenancy_rationale` (or whatever the equivalent table is).
- **Single-tenant is also forced on, with no customer choice, for any product whose risk tier is REGULATED** per global CLAUDE.md (mmcbuild, F2K-Checkpoint, F2K-Fund-Tokenisation, platform-trust, ndissda-automate, r-and-d-tax, disaster-support). The checkout flow for those products defaults to dedicated infra and does not offer shared as an option. Multi-tenant is offered for STANDARD-tier and REVENUE-tier products.
- The pricing formula (see `docs/PRICING_FORMULA.md`) treats `infra_fixed` as ~$0 for shared, ~$50/mo for dedicated. Plan prices reflect both options where both are offered.

### Why this rule exists

The user's exact framing on 2026-05-23: *"some clients may need single tenant for regulatory reasons even if there is no operational reason to separate."* A customer's compliance regime is not something CAS can reason about from outside — they know their auditor, their contracts, their regulators. If single-tenant isn't a visible option at purchase, those customers either decline the product (lost revenue) or accept shared and then quietly violate their own compliance (worse — CAS becomes the named vendor in a compliance incident). Both failure modes are eliminated by making tenancy a customer-facing choice with captured rationale.

The rule also future-proofs the upsell path: a customer who chose shared at v1 can switch to dedicated later as their compliance posture matures. The migration is a defined operation (clone the data, point the customer at the new instance) — but the choice surface has to exist from day one so the customer never feels locked in.

### Verification heuristic before launching any hosted product

- Open the checkout flow. Are two tenancy options visible? If no, fix it before launch.
- Is the rationale field present when dedicated is selected? If no, fix it.
- Does the pricing tier change reflect the `infra_fixed` delta? If no, the formula isn't being applied consistently.
- For REGULATED-tier products: is shared even offered? If yes, remove it — REGULATED forces dedicated.

---

## RULE 14 — USAGE CAP IS HARD-CUT, NOT SOFT-WARN (NON-NEGOTIABLE)

Every hosted plan has a usage ceiling. When a customer hits the ceiling, the relevant feature is **disabled** until the customer adds credits or upgrades the plan. Soft warnings ("you're approaching your limit") are layered on top, but the hard cut at 100% is non-negotiable. This rule is the implementation of Rule 12 — without the hard cut, "no uncovered cost exposure" is wishful thinking.

### How to apply

- **Three-stage UX, mandatory shape:**
  1. **80% of tier consumed** — a non-blocking banner appears in the product UI: *"You're at 80% of this month's [unit]. [Top up credits] · [Upgrade plan]."* An email is sent to the account admin.
  2. **100% of tier consumed** — the feature that drives the usage is **disabled with a clear "out of credit" message** that names the unit and surfaces the same two CTAs. The rest of the product remains usable for non-metered features (login, settings, viewing past data, exporting).
  3. **Top-up or upgrade clears the block immediately** — no waiting until next cycle. The customer can resume usage the moment the payment clears.
- **Caps are tracked in real time on a server-side `usage_meters` table** keyed `(tenant_id, meter_name, period_start)`. Every metered call atomically increments the meter and checks the cap in the same transaction — the check-and-increment must be race-safe (e.g. `UPDATE ... WHERE current_value + cost <= cap RETURNING ...`).
- **Caps have a small admin-set headroom** (default 5%) to absorb in-flight requests already approved when the cap was hit. The plan price covers up to 100% + headroom; anything beyond requires top-up. The headroom is the engineered version of "cap-lag protection" from Rule 12.
- **What counts as a "unit" varies by product** — LLM tokens, voice minutes, generated documents, leads scraped, etc. Each product declares its meters in the same shape (`PRODUCT_METERS` constant or equivalent) so the admin dashboard, billing webhook, and cap-enforcement layer can all read from one source.
- **Real-time cost tracking lives in a shared services package, not per-product** (Dennis 2026-05-23). The cap-enforcement layer, the per-customer meter table shape, the Stripe webhook handler for top-ups, the admin-dashboard real-time meter view, and the 80% / 100% notification dispatch logic are all the same code across every hosted product — extract to **`@caistech/usage-meters`** (placeholder name) the second time it's needed, per the `@caistech` shared-services-first rule in global `CLAUDE.md`. The first hosted product that needs it builds it inline; the second one is the trigger to extract. Don't fork the meter implementation per product — that's the failure mode the shared-services rule exists to prevent. Until the shared package lands, each per-product implementation must follow the same shape (table schema, meter-name convention, atomic check-and-increment SQL pattern) so the extraction is mechanical when the trigger fires.
- **Credits are prepaid, never post-billed.** Top-up flow charges Stripe immediately; balance is credited the moment the webhook fires; the cap check uses the new balance from the next call onward.
- **Upgrade is immediate, prorated.** Customer upgrades mid-cycle → the higher tier's cap applies from that moment; the proration charge clears via Stripe before the new cap takes effect. Per Rule 12, the upgrade does not retroactively cover prior over-cap usage (because there wasn't any — the hard cut prevented it).

### Why this rule exists

The user's exact framing on 2026-05-23: *"needs an upper tier which is actively monitored so if a client hits an upper tier they are advised needs to a) add credits or b) upgrade plan."* Combined with Rule 12 (no uncovered cost exposure), "actively monitored" means actively *enforced*, not just instrumented. Monitoring without enforcement is post-incident reporting — by the time CAS sees the alert, the cost is already incurred. Enforcement at the call-site is the only mechanism that makes the cost ceiling and the revenue ceiling identical numbers.

The 80% soft warning exists because hard-cutting a customer without warning is hostile UX — the warning gives them time to top up before they lose access. But the 100% cut is the load-bearing mechanic.

### Verification heuristic before launching any hosted plan

- Trigger 100% usage in a staging environment. Does the feature disable, or does the next call still go through? If it goes through, the cap is decorative.
- Trigger a race: 10 concurrent calls when the cap allows for 5. Do exactly 5 succeed and 5 hit the cap-disabled state? If more than 5 succeed, the check-and-increment is not atomic. Fix it.
- Trigger top-up at the cap. Does the next call succeed within seconds of the Stripe webhook firing? If there's a delay > 30s, the balance read is cached too aggressively. Fix it.
- Walk the admin dashboard. Are per-customer usage meters visible to the customer's admin user in real time? (See the global TEAM ADMIN rule.)

---

## RULE 15 — DISTRIBUTOR-FIRST PRODUCT GATE (NON-NEGOTIABLE)

**We sell to operators who already have customers, not to end users.** Every product CAS builds is infrastructure for a distributor — a VC accelerator, a drafting firm, a research agency, a corporate training provider, a language school, an accountancy practice, an NDIS coordinator, a software consultancy — who in turn onsells to their existing book of clients. CAS clips a small amount per active end-user; the distributor prices however they like above that and keeps the margin. We are infrastructure, not service provider.

### The product gate — asked before any new build

Before any new product reaches build (and before any existing in-migration product converts to BYOK/hosted), the following four questions are answered. Captured in the project's design doc, in the office-hours record, and in `cais-shared-services/portfolio-manifest.yaml` per-product.

1. **Who is the distributor?** Name the operator-archetype: their business shape, what they already sell, who their existing customers are. *"SMBs"* is not an answer; *"Australian accountancy firms with 200–800 SME clients running annual R&D tax claims"* is.
2. **Why them?** What's the specific fit between this product and the distributor's existing offering? What does it let them sell that they currently can't?
3. **Why this problem, why now?** What's the wedge that makes this the right product to give that distributor today (regulatory shift, AI-cost crossover, vendor gap, market timing)?
4. **How does it grow their business?** Concrete: more revenue per existing client / more new clients / higher retention / lower churn / higher LTV. If the distributor's answer is *"it's nice to have,"* the product is not a sale — it's a giveaway.

If any of the four can't be answered with specificity, the product does not reach build. Re-route to office-hours.

### The pricing shape — per-active-end-user clip

Distributor-product hosted pricing is **$10–20 per active end-user per month**, paid by the distributor to CAS. The distributor sets their own per-end-user price to their clients (likely 3–10× the clip) and keeps the margin. The clip is deliberately low because the distributor is doing the customer-acquisition work, the support work, and the relationship — CAS is providing the infrastructure layer they monetise.

- **BYOK path** — distributor self-hosts on their own infra; CAS gets nothing from end-user volume; small annual license possible (defer until first BYOK distributor asks). Use when the distributor is technical enough to operate it.
- **Hosted path** — CAS runs it; clip applies. Rules 12 (no uncovered cost exposure), 13 (single-tenant choice), 14 (hard-cut cap) all still apply at the distributor-account level — the distributor's account has the cap; the clip × end-user-count is invoiced in advance per Rule 12.

This is a second pricing model on top of the plan-with-cap shape in `docs/PRICING_FORMULA.md`. Distributor-products price by clip; direct-to-end-user products (the override exception below) price by plan-with-cap.

### Three-tier admin layer

The TEAM ADMIN rule in global `CLAUDE.md` extends to three tiers for distributor products:

- **CAS** — manages distributor accounts; sees aggregate clip-billable end-user counts.
- **Distributor admin** — manages their own end-user organisations; sees their own clip bill; sets their own pricing.
- **End-user admin** — manages their team within the distributor's instance; sees their own usage.

The org schema and admin UI specifications in the global TEAM ADMIN rule cover this — `organisations` rows nest under a `distributor_id` for distributor-products. Same five admin sections (Members / Usage / Billing / Tenancy / Organisation) at each tier with appropriately-scoped visibility.

### Personal-interest override

Some products in the portfolio are built or kept because Dennis has personal interest, not because they pass the distributor gate. Examples might include Kira (personal AI thinking partner) or StoryVerse (kids' books). The override is permitted but **must be conscious and documented**:

- The product's `portfolio-manifest.yaml` entry carries `distributor_gate_status: personal-interest-override` plus a one-line rationale.
- These products are NOT load-bearing for the monetisation thesis. They consume operator time at Dennis's discretion. They do not get studio-in-residence prioritisation, do not get the conversion-sweep auto-promote, and do not generate clip revenue.
- Reviewing the override list each quarter is healthy; products that no longer carry personal interest should be killed, not kept on life support.

### Why this rule exists

The user's exact framing on 2026-05-23: *"to spend the time on the build, we need to be focused on creating products that have a 'distributor market' where providing them with platform means they can onsell to their clients. We should keep our 'clip' low $10 or 20 dollars per month per using client and they can price how they like — we are infrastructure rather than service provider."*

CAS is one operator and a small set of `@caistech/*` packages. The unit-economics arithmetic only works through *leverage* — building infrastructure that distributors monetise to their existing book of clients. Selling end-to-end to end-users requires CAS to do customer acquisition, support, and relationship work that the operator does not have hours for and that 17+ products cannot sustain. Selling to distributors who already have customers means each acquisition acquires *their* book at once.

The rule also closes the failure mode revealed by the 2026-05-23 BYOK conversion sweep: that the GO/NO-GO decisions were being made on per-product heuristics without checking the distributor question first. Several products that scored "BYOK-suitable" target end-users with no obvious distributor layer (e.g. independent hair stylists, individual airline passengers) — those are weaker fits than voice-generator products that scored "needs-discussion" but actually have natural distributor wrappers (corporate training providers, language schools, research agencies). This rule corrects the priority.

### Verification heuristic before any new product reaches build

- Walk the four product-gate questions. Can each be answered with specific named distributor type, specific named fit, specific named wedge, specific named growth lever? If any answer is hand-wavy, send it back to office-hours.
- If the answer is "I don't know who the distributor is yet," that's an honest answer — and the product does not reach build until office-hours resolves it.
- If the answer is "there is no distributor; I want to build it anyway," accept it as a personal-interest override with the manifest annotation above. Do not pretend a distributor exists where one doesn't.

### When this rule applies

- Every new product idea.
- Every product currently in the BYOK conversion sweep (re-run the sweep through this lens).
- Every studio-in-residence engagement scope (the cohort companies the host installs are themselves distributors — products to be built during the engagement are gated by this rule).
- Every Factory Floor essay and case study (distributor framing in the narrative, not end-user framing).

---

## When these rules apply

- All current and future studio-in-residence engagements.
- All public artifacts (Factory Floor posts, gists, case studies, LinkedIn / social shares).
- All prospect conversations and contract negotiations.
- All decisions about taking on additional clients, products, or commitments that consume operator time.
- Rules 12–14 also apply to **every hosted product purchase flow** across the portfolio — every product that exposes a paid hosted tier ships with these three rules wired in from day one.
- Rule 15 applies to **every new product idea and every existing product still on `releaseMode: 'in-migration'`** — the distributor-first gate runs before any build/conversion work begins.

## Why this file exists

The factory works because the rules in the global `CLAUDE.md` are non-negotiable across 17+ products. The monetisation operation needs the same discipline turned inward, or it becomes the very thing the methodology critiques: half-finished initiatives, scope creep, "Phase 2 will be addressed later," undefined success criteria, missing instrumentation. Locking these rules now — before the first engagement signs, before the first post ships — is the same move that locks `@caistech` discipline before a new product spins up.

## When to revise this file

- After engagement 1's case study is published — review whether any rule needs tightening or relaxing based on real evidence.
- After Phase 1.5 productisation triggers (if it ever does) — additional rules may be needed for fixed-scope SKU operations.
- Before Phase 2 LP conversations begin — review for any conflict-of-interest gaps these rules don't yet cover.

Revisions are append-only with dated change notes. Removing a rule requires explicit written reasoning, same as the auth-pattern rule.
