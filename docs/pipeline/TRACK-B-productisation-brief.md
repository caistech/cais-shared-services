# Track B — Productising Pipeline (brief)

The goal: split Pipeline into its own repo and productise it. Today proved the **engine converges**
(TEARDOWN 4/14 → RENOVATION through survey → design-build → gate → merge → deploy → re-survey). But
the **operator experience was a mess** — bouncing across cockpit, two repos, Vercel, Supabase, and
PowerShell; hand-merging; hand-fixing imports; spelunking the DB to find a stale card. Every one of
those escape-hatches is a thing the product must absorb.

## The product UX law (headline requirement)
**The operator works on one page.** At each state, exactly ONE affordance is live; the next is greyed
with its unlock condition stated ("locked until survey records RENOVATION"). The cockpit performs all
GitHub / Vercel / Supabase / CI actions via API on the user's behalf. The user never opens a repo, a
terminal, a database, or a CI log. "Do this → (unlocks) → do this."

## The deeper model: self-correcting orchestrator, not gated buttons
The user watches an autonomous loop **converge**, not clicks steps:
```
survey runs → if TEARDOWN → design-build fires automatically
            → build satisfies gate → merges automatically
            → survey re-runs automatically
            → if it finds something else → back to design-build automatically
            → … until RENOVATION
            → then the next compliance/validation gate starts, same loop
            → … to outreach-ready
```
Surfaced as a **row of per-stage progress bars** that light green left-to-right and auto-trigger the
next; a stage going red shows the cell looping its fixer. The human is pulled in only for a genuine
fork (and even then it's one decision on the page, then the loop resumes).

## Architecture: chunks-and-connectors (Dennis's principle)
a) find the standardisable chunks of the steps; b) make each a shared service called when it fits;
c) don't rebuild what's already built; d) build connectors between chunks to suit the situation.

**Every stage is the same cell shape:** `{ runner → verdict → fixer → advance }`. The pipeline is a
chain of identical cells wired by an orchestrator. This dissolves the "raise vs sell" fork — it's not
a fork in the chain, it's a **connector that selects which shared chunk to call** (InvestorPilot's
`partner_type`-keyed outreach contracts are already exactly this pattern, proven).

### Already-built chunks — REUSE, do not rebuild (principle c)
- survey scorer (`survey.ts` pure twin + `SURVEY_MODE.md` skill) — shared, motion-agnostic
- design-build agent-in-CI (button → kickoff → dispatch → PR → ledger) — shared
- gate-check + `pipeline_gates` ledger (with `is_override`) — shared plumbing
- the 14-field card / intake surface — shared
- InvestorPilot `partner_type`-keyed outreach contracts — **already a working connector**

### To BUILD
1. **Cell standardisation** — make survey, design-build, and each compliance/validation test conform
   to one `{runner → verdict → fixer → advance}` interface. (The validation stage Steps 5–6 already
   ARE this shape — each is a runner with a "Run Test" button + a verdict; standardise + chain them.)
2. **The orchestrator** — reads the ledger, fires the next runner on pass, loops the fixer on fail,
   with attempt-caps and human-escalation forks.
3. **Self-correction inside cells** — design-build typechecks before opening the PR and retries
   (so a human never hand-fixes an import like today's lucide `Handshake`); auto-merge via GitHub API
   on green; auto-redeploy-poll; auto-re-survey.
4. **The single-page progress-bar UI** — the product surface; the orchestrator's live state.
5. **Guardrails** — attempt limits; never bypass a REAL failing gate; prod-deploy safety; cost caps
   (each loop spends model tokens).
6. **Gate-override feature** (logged, reasoned) — a card button that writes is_override=true,
   status='pass', reason starting 'RENOVATION', result.verdict='RENOVATION', plus a required human
   reason. SPEC IS FULLY DERIVED from reading the verdict logic this session (survey-verdict.ts head-
   parse + survey.ts isRenovation keys on result.verdict). Replaces today's manual DB INSERT.

## The Ideation Chain (upstream layer that DERIVES the 14 fields)
7-node causal chain (LOCKED): 1.Problem → 2.Origin(awareness source, uploaded to product KB) →
3.Affected(=END USER) → 4.Severity → 5.Coping → 6.Solution → 7.Channel(=DISTRIBUTOR).
- Fixed invariant: distribution is always distributors-who-reach-end-users; node 7 names WHICH
  channel, never WHETHER.
- The 14 validation fields are DERIVED from chain nodes — **Distributor from node 7, End User from
  node 3 (different nodes → they structurally cannot collapse → prevents the deal-findrs
  two-audience bug by construction).**
- Node 7 is a **motion selector** (distributor-sell vs investor-raise vs …) that swaps the downstream
  kit; nodes 1–6 are shared. (Parked: whether nodes 1–6 fill differently per motion — handle via the
  chunks/connectors framing rather than deciding up front.)
- Rule v1: every node needs a stated rationale (no empty beliefs); evidence-weighting deferred.

## Bugs/lessons from today that the product must design out
- **Fetch-cache stale reads** (FIXED) — every cockpit route that reads live ledger state needs
  `dynamic='force-dynamic'` + `fetchCache='force-no-store'`. The card MUST reflect the ledger reliably
  without manual refresh; this was the "card feels broken" root cause.
- **Survey calibration (P3 / prospect-type)** — a distributor product legitimately addresses two
  audiences on its landing (distributor + end-user). Current rule flags this as incoherent and will
  mis-grade EVERY distributor product. Fix `SURVEY_MODE.md`: pass when (a) named distributor archetype
  present AND (b) end-user is the distributor's client AND (c) the relationship is stated; flag only
  genuine contradiction. After the fix, re-run deal-findrs → clean RENOVATION supersedes the override.
- **Hand-merge / drift** — the orchestrator merges via GitHub API on a clean base; no terminal merges.
- **Lucide icon class** — agent typecheck-retry + template lucide bump removes it.
- **Spec-field sync** — the card spec drifted from the built product (still "...for their teams").
  In the productised flow the spec is DERIVED from the chain, so build + spec + survey can't diverge.

---

## ADDENDUM (reconnaissance, same session) — the compliance/validation cells are a scoring veneer, not a real fix loop

Ran the Step 5/6 cells on deal-findrs and inspected what they actually do:

- **Detectors are real.** The checks find genuine issues against the live site: Metadata "Missing OG
  image meta tag", Security Headers "Missing X-Frame-Options/CSP", GTM "No distribution loop
  (share/referral)". Good — these are real signals.
- **Most failures dead-end.** Only Metadata had a "Fix Now"; Security Headers and GTM had none — the
  failure just sits there with no path forward.
- **The one fixer that exists is FAKE.** Clicking "Fix Now" on Metadata flipped the check to green
  but produced **no new deal-findrs deploy and no repo change** (latest deploy still the PR #8 merge
  `65ef8e3`; no commit from the Fix Now). It greened the status WITHOUT patching the product.

**This violates the project's own "no fake success" rule** (the same anti-pattern banned in
design-build: no stubbed forms, no "received" without storing). A compliance green that isn't earned
by a real change to the real product is a fake pass.

### Corrected autofix scope (supersedes the earlier optimistic read)
Track B autofix is NOT "wire up + automate existing fixers." It is:
1. **Build REAL Class-A fixers** — codemods that actually patch the product repo (add OG tag to layout
   metadata; add `headers()` block to next.config.js), commit → PR → auto-merge → redeploy →
   **re-run the real check against the new deploy**. Today's fake Metadata "Fix Now" must be REPLACED.
   These codemods are shared chunks (every product hits the same compliance failures).
2. **Make every re-check real** — a green means the live product now actually has the thing, verified
   against the live deploy (same integrity the survey has: it scores the live DOM, can't be faked).
3. **Class-B failures → design-build agent** with a single-finding brief (GTM's distribution loop is a
   feature build, not a config patch).
4. **Kill the fake-green path entirely** — a check can only go green by passing a real re-test. "Hard,
   but legible" applied to compliance: the green must be earned. No status-only fixes.

### Fixability taxonomy (route the orchestrator by this)
- **Class A — deterministic config patch** (OG image, security headers, metadata, favicon/manifest):
  fixer = codemod → PR → merge → redeploy → real re-check. Reusable shared library.
- **Class B — generative feature** (distribution loop, voice agent placement, etc.): fixer =
  design-build agent fed the single finding → PR → merge → redeploy → real re-check.
- **Class C — judgment/spec** (P3 prospect-type calibration): human fork / logged override. Not
  auto-patchable.
Each check must emit a machine-actionable `{ fixClass, fix descriptor }`, not just prose, so the
orchestrator can route A→codemod, B→design-build, C→human.

---

## PRINCIPLE: two-level feedback — fix the instance, then fix the SOURCE (shift-left)

A finding must (a) drive a REAL fix through design-build (patch the code, PR, merge, redeploy,
re-check against the live deploy — never a fake green), AND (b) if it RECURS across products, be
promoted UPSTREAM so it stops being a finding at all. Fixing the same compliance failure on every
product is treating the symptom; the cure is to put the requirement in the build inputs.

### Inner loop (per-product, reactive)
finding → fixer (Class A codemod / Class B design-build) → PR → auto-merge → redeploy →
real re-check → green. Handles the one-off.

### Outer loop (cross-product, preventive) — the one that stops "fixing the same thing forever"
A finding seen more than once is a **defect in the build inputs**, not a per-product task. Promote it
into one or more of three places, by class:

1. **Build template (`cais-build-template-v2`)** — for anything EVERY product should have by default:
   OG image meta, security headers (CSP / X-Frame-Options / HSTS), favicon/manifest, base metadata.
   A freshly scaffolded product then STARTS compliant; these checks pass on the first survey, forever.
2. **Design-build standards (`design-build.yml` + the standards files the agent is fed)** — for
   anything the agent should ALWAYS produce, so even a rebuild (not just a fresh scaffold) includes it:
   "every build MUST include OG image + security headers + a distribution loop." The agent builds it
   in because it's a hard-rule, every time.
3. **Validation/standards spec (survey + compliance rubrics; ideally a derived spec field)** — so a
   universal requirement (e.g. distribution loop) is a KNOWN target the build aims at, checked at the
   right stage, not discovered as a late-stage surprise at Step 6.

### Operating rule
Every recurring failure triggers: "why isn't this in the template/standards already?" → put it there.
The validation stage should trend toward **mostly-green on first run** as recurring findings get
promoted upstream; a NEW failure type is the signal to add a new template/standard, then it too
stops recurring. This is the chunks-and-connectors doctrine applied to defects: standardise the
common fix into the shared build inputs so it's never rebuilt per-product.

### Today's recurring findings to promote upstream NOW (deal-findrs hit all three)
- Missing OG image meta → **template** (base metadata) + design-build standard.
- Missing security headers (X-Frame-Options / CSP / HSTS) → **template** (`next.config.js` headers)
  + design-build standard.
- No distribution loop (share/referral) → **design-build standard** + consider a derived spec field
  (every distributor product needs a distribution loop by definition — it's node 7 of the chain).

---

## CAPSTONE: self-healing — run-level fixes auto-propagate into the build structure

The outer loop (promote-upstream) should not wait for a human to decide a fix is worth promoting.
A real fix at the run level AUTOMATICALLY writes back into the build structure (template / design-build
standards / spec), so the next build includes it by construction and the failure never recurs. The act
of fixing a thing IS the act of teaching the build. The build inputs improve monotonically over time.

```
run-level failure → real fix (codemod / design-build) → re-check green
                  → classify the fix → auto-promote into build structure (if universal)
                  → next build inherits it by construction → failure never recurs
```

### The critical guard: classify before promoting (self-healing, not self-corrupting)
Not every run-level fix should propagate verbatim — conflating "fix" with "promote" without a guard
rots the build structure. Two failure modes to design against:

1. **Product-specific fix masquerading as universal.** A deal-findrs-only fix must NOT be written into
   the shared template/standards. Propagation needs a **scope classifier: universal vs
   product-specific.** (A/B/C classes help: Class-A config fixes are almost always universal;
   Class-B feature fixes are sometimes universal — e.g. distribution loop — sometimes specific.)
2. **Implementation vs requirement.** Deterministic fixes (Class A) ARE the rule → promote the fix
   itself (the codemod). Generative fixes (Class B) → promote the **REQUIREMENT** ("must have a
   distribution loop"), NOT the specific implementation, and let design-build build it per product.

### Mechanism
```
run-level failure fixed →
  classify:
    universal + deterministic (A) → auto-write the codemod into the template/standards library
    universal + generative    (B) → auto-write the REQUIREMENT into design-build standards + spec
    product-specific              → stays in the product; do NOT promote
  → log WHY (audit trail, like decisions.json)
  → next build inherits universal fixes by construction
```
**Recurrence counter as backstop:** even if the classifier is unsure, a fix applied N times across
products is definitionally universal → force-promote. Self-healing on confidence + promote-on-recurrence.

### Guardrail: self-healing, but LEGIBLE
The build structure (template + standards + spec) becomes a living artifact the pipeline writes to
ITSELF — powerful and slightly dangerous (an autonomous system editing its own build inputs). Same
discipline as the agent merging its own PRs: every auto-promotion is a **logged, reviewable change
(a PR to the template/standards repo, not a silent mutation)**, so a human CAN inspect the system's
self-modifications even when they usually don't need to. Self-healing, but legible.

---

## REFINEMENT: the promotion PR is plumbing; the classify decision happens ON THE CARD

Auto-promotion may (and should) produce a PR to the template/standards repo — that keeps the
self-modification logged, diffable, version-controlled, legible. BUT the user must never go to GitHub
to act on it. The classify-and-promote step is a HUMAN FORK and, per the one-page UX law, it surfaces
ON THE CARD. The card is the cockpit; the PR is plumbing the cockpit operates on the user's behalf.

### Flow
```
run-level failure fixed
  → system proposes a promotion → opens PR to template/standards repo (mechanism, legible)
  → a CARD surfaces: "Proposed build-structure change" showing:
       - what was fixed and why (the finding + the fix)
       - the DIFF, viewable inline on the card (no leaving the page)
       - a suggested default ("looks structural — same fix seen on N other products")
       - a classify control:  [ Structural (applies to all builds) | Specific to this build ]
       - a move-forward action
  → user classifies + confirms ON THE CARD
       - Structural → system MERGES the PR via GitHub API → fix is now in the build structure
       - Specific   → system CLOSES the PR → fix stays in this product only
  → no GitHub, no terminal, no leaving the page
```

### Why this is better than full auto-classification
Earlier draft had the system auto-classify universal-vs-specific (with a recurrence backstop). This
refinement is cleaner and more legible: **the system PROPOSES (and may suggest a default from the
recurrence signal), the human CLASSIFIES on the card with one tap.** Self-healing stays SUPERVISED at
exactly the one point that matters — the decision that mutates the SHARED build structure — without
ever sending the user off-page. Same shape as the gate-override: human makes the judgment call on the
card; the system executes (merge/close via API) from that decision.

### Implication for build
The card needs an inline **diff viewer** and a **classify+merge/close control** wired to the GitHub
API. No new human-facing surface outside the card. The recurrence counter feeds the SUGGESTED default,
not an automatic merge — a human always confirms a change to the shared build structure.

---

## CONTENT CONTRACT: every fork is explained in plain language ON THE CARD

The card must EXPLAIN, not just report. A report says "X failed." An explanation says "here's what X
means for you, here's what we'd do about it, here's what each choice costs you." Since the product's
core promise is that a NON-ENGINEER founder can run the pipeline, every fork the system surfaces must
be readable and decidable without understanding the underlying tech. No raw jargon as the primary text.

### The shape of every surfaced finding/fix/decision
```
"The [test/stage, in plain terms] checked [what it looked at] and found [what's missing/wrong, plainly].
 It's proposing to fix it by [option x / y / z, in plain terms].
 What this means: [the implication — why it matters, what changes, any downside].
 Your choices: [option A — what it does + its consequence] / [option B — ...]."
```
Plain-language explanation comes FIRST. The technical artifact (the diff, the PR, the header names,
the file path) sits behind an optional **"see the technical detail"** expander — available, but never
required to make the decision.

### Example — Security Headers failure (instead of "FAIL: Missing X-Frame-Options, CSP")
> "We checked how your site protects visitors from common web attacks. It's missing two standard
> safety settings that tell browsers how to handle your pages securely — most professional sites have
> these, and some partners/investors check for them.
> **Proposed fix:** add the standard security settings to your site's configuration (a one-line
> change; no effect on how the site looks or works).
> **What this means:** your site passes the security check and looks more credible to technical
> reviewers. No downside, no visible change.
> **Your choices:** *Apply the fix* (recommended — standard and safe) / *Skip for now* (check stays
> red; revisit anytime)."

### Example — the structural-vs-specific classify fork (plain language)
> "We've fixed this same issue on other products before. Make it part of EVERY future build (so you
> never see it again), or just this one?
> **Structural** — adds it to your build template; all future products start with it. *(Recommended —
> universal best practice.)*
> **Just this build** — fixes only this product; future products may hit it again."

### Rule
Every fork = plain-language finding → plain-language proposed fix(es) → plain-language implication →
plain-language choices WITH their consequences. Technical detail is an optional expander, never the
primary text. If a fork can't be explained this way, it isn't ready to surface to the user — that's
the bar.
