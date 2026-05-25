# Gate Readiness Criteria — the objective thin-MVP / Gate-1 test

> **What this is.** The definition of how a methodology-cockpit gate verdict is *measured*
> rather than *felt*. It turns the subjective question **"is the thin MVP adequate?"** into a
> composite of ~40 objective checks (run by the existing canonicals) plus **one** structured
> judgement. It is the seed doc for two things: the **THIN_MVP_RUBRIC v2** readiness section and
> the methodology cockpit's `readiness_criteria` table + Readiness panel.
>
> Companion to `THIN_MVP_RUBRIC.md` (what goes in a thin MVP), `PRODUCT_STANDARDS.md` (the build-DNA
> checklist the canonicals enforce), and `VOICE_MEMORY_STANDARD.md` (the voice floor `/voice-auditor`
> loads). **Severity:** auth-pattern severity — a gate fired on feeling is the expensive failure
> (a false NO-GO kills a good product; a false GO burns the validation audience).
>
> **Last updated:** 2026-05-25. **Status:** spec / Phase-0 catalogue — not yet built.

---

## 0. Why this exists

Today an operator opens a cockpit card and makes a **subjective** call on whether the thin MVP is
"adequate" for Gate 1. That is unreliable and — more importantly — **it doesn't survive delegation
to the agent layer**, which is the whole north-star point (encode the methodology so the tireless
room is infinite). Gate readiness must be a **measured composite of objective criteria**, each with
a defined verification method, producing a score + a list of open items. The operator's role moves
from *"does this feel adequate?"* to *"here are the 2 unmet criteria — fix, or waive with a logged
reason."* Subjectivity is allowed only as an explicit, recorded **override** — never the default.

---

## 1. The core reframe — readiness vs validation

"Is the thin MVP adequate?" feels subjective because it secretly fuses **two different questions**:

| Question | Who answers it | How |
|---|---|---|
| **A. Is it READY to be shown?** | the machine (the canonicals) | objective audit — standards + DNA + promise-attributes + preconditions |
| **B. Does the promise LAND?** | the **audience**, not the operator | the validation outreach itself — the distributor/end-user reaction *is* the measurement |

**Gate 1 = question A only.** It must *never* ask the operator to predict the reaction — that is
precisely what Gate 1's outreach exists to measure. Answering B with a gut feel at Gate 1 is the
mistake. Question B's answer returns later as evidence (the `sync` webhook signals) and drives
**Gate 2**. This split is what makes the verdict objective: Gate 1 becomes *"did the MVP pass the
readiness audit?"* (measured), and *"will they want it?"* stops being an opinion and becomes a
campaign result.

---

## 2. When it runs — the trigger model

A cockpit **Hypothesis Card is created at ideation** — it is an *idea*, not a repo. The thin MVP is
built later in the pipeline. So the thin-MVP test is **neither** a one-time "on log-in" event **nor**
a "test-first-then-log" step. It runs at **one transition in the card's life**: when the thin MVP is
built + deployed (the card's `mvp_url` is set) and you are deciding whether to **fire Gate 1** (the
kick-off outreach that embeds the MVP link).

```
idea logged (card created)        → readiness: N/A (no MVP yet)
   ↓ feasibility
build thin MVP + deploy           → mvp_url set on the card
   ↓
RUN THE THIN-MVP TEST  ←──────────── this IS the Gate-1 readiness check
   ↓  pass → unlocks the Gate-1 "Launch" button;  fail → open items listed
Gate 1 fires (outreach embeds the MVP link)
   ↓ dual-stream validation (distributor + end-user)
Gate 2 (go/no-go) → full build
```

**The test gates the outreach, not the card creation.** In the chosen execution model (option **a**):
an agent runs the test (during the build, iteratively, and a final time before flipping Gate 1); the
result is **posted to the card** via a `readiness` endpoint; the cockpit **displays the latest run**
("last audited X ago · re-run") and **disables the Gate-1 Launch button until the hard-gate criteria
pass**. It does **not** auto-run on page load — the auditors are agent/CLI skills today, and the
`#9` quality bar can't be fully automated anyway, so "auto-run on open" would over-promise.

**Same machinery, two distinct uses** — don't conflate them:

| Use | Trigger | Purpose |
|---|---|---|
| **Thin-MVP test (Gate-1 readiness)** | per *card*, when its MVP is deployed + approaching Gate 1 | unlock the validation outreach |
| **Portfolio compliance sweep** | per *repo*, ongoing | keep existing live products standards-compliant |

(The Kira / Connexions voice-webhook/allowlist migration of 2026-05-25 was the **sweep** — live
products, fixing drift — *not* a Gate-1 readiness test.)

---

## 3. The composite test (two-sided)

"Run all canonicals and check every standard is met" is **wrong** for a thin MVP. The
THIN_MVP_RUBRIC's core is *full experience, **zero** scale-infrastructure*, so the test is two-sided:

- **Positive side** — the thin-MVP-relevant subset (Layers 1/2/3 + security-when-present) must **pass**.
- **Negative side — the "too much" guard** — the scale-infra standards (team-admin, billing, full
  Settings/`profiles`, multi-tenant) should be **absent**. Their *presence* pre-Gate-2 is a **failure
  signal** (operator hours burned on plumbing), not a pass. *A product that satisfies every canonical
  check has over-built and FAILS the thin-MVP test.*

The composite, in four steps:

1. **Orchestrate the canonicals** — `/naive-tester` (live UAT + Standards Check), `/voice-auditor`
   (placement map + **behavioural memory-loop** check), and the `AUTO` checks (real `<title>`,
   fork-check clean, no committed secrets, webhook HMAC + allowlist via `getAgent`, RLS, sensitive env).
2. **Filter through the thin-MVP lens** — score only the `IN` / `PRE` / `SEC-when-present` rows; mark
   any `SCALE` row found as a *"too much"* flag.
3. **Add the parts no canonical covers** — the **`#9` promise-attributes** (per-product quality-bar
   checklist, §6) and the **Layer-3 pipeline preconditions** (link live, distributor named, four gate
   questions answered).
4. **Produce** — a readiness score (`met / total`) + open items (each named with its fix) + the
   "too much" flag list + the single recorded `#9` judgement (against a written bar).

---

## 4. Table A — everything the canonicals already check

**Method:** `AUTO` = automatable (HTTP/grep/deploy-title/getAgent) · `NAIVE` = naive-tester live ·
`VOICE` = voice-auditor · `JUDGE` = agent/human judgement (irreducible).
**Thin-MVP?:** `IN` = experience/DNA, always in · `PRE` = Gate-1 pipeline precondition · `SEC` =
correctness/security (whenever the feature exists) · `COND` = only if that feature is present ·
`SCALE` = scale-infra, deferred to post-Gate-2 (presence pre-GO = a "too much" flag).

| # | Check | Source | Method | Thin-MVP? |
|--|--|--|--|--|
| 1 | Explanatory header (what / do / why) + empty states | PS §5 | NAIVE/JUDGE | **IN** |
| 2 | Responsive 375 + 1440, no h-scroll, thumb-reachable | PS §1,§0 | NAIVE/AUTO | **IN** |
| 3 | Touch ≥44px, text ≥16px, tables have a mobile strategy | PS §1 | NAIVE | **IN** |
| 4 | Nav collapses to drawer/hamburger on mobile | PS §1 | NAIVE | **IN** |
| 5 | Landing page sells the concept | THIN §3 | NAIVE/JUDGE | **IN** |
| 6 | Emotional register matches product (not a dull grey shell) | PS §9 | NAIVE/JUDGE | **IN** |
| 7 | Browser tab `<title>` = product name (not "Create Next App") | PS §7 | **AUTO** | **IN** |
| 8 | OG image + manifest favicon | PS §7 | AUTO | SCALE (polish) |
| 9 | **Promise attributes present AND at quality bar** | THIN §2/§3 | JUDGE | **IN — core** |
| 10 | Voice agent reachable from chrome ≤3 clicks | PS §6 | VOICE/NAIVE | **IN** (nuanced input / voice = value) |
| 11 | Voice consumes `@caistech/elevenlabs-convai` + `/react`, BYOK, persona | PS §6 | VOICE/grep | COND (voice present) |
| 12 | Voice proactive + stage-aware | PS §6 | VOICE live | **IN** (coaching) |
| 13 | Voice placement map: every Required surface is voiced | voice-auditor | VOICE | **IN**/COND |
| 14 | **Voice memory loop works** (welcome-back recall fires, observable, degrades-don't-fake) | VMS 1–2,13,16 | VOICE behavioural | **IN** (if continuity = the promise) |
| 15 | Memory: pull-not-push, distil-then-recall, works off results | VMS 3–6 | grep/JUDGE | COND (memory present) |
| 16 | Identity server-derived (`conversation_id`, never `user_id`) | VMS 9 | grep | SEC (voice present) |
| 17 | Every convai webhook verifies HMAC (`.trim()`), unverified→401 | VMS 10, PS §6 | grep/AUTO | **SEC** (voice present) |
| 18 | Allowlist on every public agent | VMS 18, PS §6 | AUTO (getAgent) | **SEC** (voice present) |
| 19 | Workspace-bind webhook (not deprecated per-agent shape) | VMS 18, PS §6 | grep/AUTO | **SEC** (voice present) |
| 20 | Cross-session memory authed-only; pre-auth = founder-hardcoded `user_id` | VMS 11 | grep | COND |
| 21 | Memory owned/deletable/TTL + user memory surface | VMS 12 | JUDGE | SCALE (post-GO) |
| 22 | Forgot-password link + working reset flow | PS §2 | NAIVE/AUTO | **COND** (auth present) |
| 23 | Password visibility toggle (shared component) | PS §2 | NAIVE | COND (auth present) |
| 24 | Working magic-link | PS §2 | NAIVE | COND (auth present) |
| 25 | Auth smoke-test: signup/login/reset/magic-link execute | PS §3 | AUTO/NAIVE | COND (auth present) |
| 26 | Persistent left navbar on every authed route + active indicator | PS §4 | NAIVE | **IN** (chrome is DNA) |
| 27 | `/settings` with Profile/Password/Notifications/Account | PS §4 | NAIVE | SCALE (lean settings ok) |
| 28 | `profiles` table + `on_auth_user_created` + RLS | PS §4 | grep/SQL | SCALE |
| 29 | Sign Out present | PS §4 | NAIVE | **IN** (if auth present) |
| 30 | Team admin: orgs/members/roles/invite/usage, `/admin` | PS §8 | grep/SQL | **SCALE** |
| 31 | Consequence clarity on irreversible/cost/outreach actions + confirm | PS §0/§9 | NAIVE | **IN** |
| 32 | Zero dead ends — every screen makes the next action obvious | PS §9 | NAIVE | **IN** |
| 33 | Content/IP acknowledgment (`/terms` + gate) where 3rd-party IP | PS §9 | NAIVE | **IN** (if applicable) |
| 34 | Address → Mapbox; company/ABN → ABN lookup | PS §9 | NAIVE | COND (those fields present) |
| 35 | Email sender = `updates.corporateaisolutions.com` | PS §9 | grep | SEC (email present) |
| 36 | `@caistech`-first (fork-check clean) | PS §9 | **AUTO** | SEC (always) |
| 37 | Feature pre-flight manifest + preflight run | PS §9 | AUTO | PRE (process) |
| 38 | Supabase: idempotent migrations via CLI, RLS every table, no client service-key | PS §9 | grep/SQL | **SEC** (DB present) |
| 39 | No secrets in committed files / logs | PS §9 | **AUTO** | **SEC** (always) |
| 40 | Vercel env vars sensitive, prod+preview only | PS §9 | AUTO | SEC (deployed) |
| 41 | Human walkthrough: friction / terminology / "I want that" reaction | naive-tester | NAIVE | **IN** |

---

## 5. Table B — the Gate-1 readiness shortlist (the in-scope subset, in 3 layers)

Cross-checked against what Singify's thin slice actually shipped (PRD §3.5 + the PRODUCT_STANDARDS
Singify appendix + the dogfood findings).

**Layer 1 — Portfolio DNA / experience (always in; NAIVE/AUTO):**
`#1` headers · `#2–4` responsive + sizing + mobile nav · `#5` landing sells it · `#6` emotional
register · `#7` real title · `#26` persistent nav chrome · `#29` Sign Out (if auth) · `#31`
consequence clarity · `#32` zero dead ends · `#33` IP/terms ack.

**Layer 2 — Thin-MVP experience completeness (the core; JUDGE):**
`#9` **promise attributes present + at quality bar** — the per-product checklist. Singify's, concrete:
video record · sing-along to **real backing in headphones** (+ the dogfood **headphone-nudge** quality
gate) · **voice-agent coach** (`#10,#12`) · **vocal baseline → "knows your voice"** (`#14`) ·
**dramatic** (not subtle) polish ← the quality-bar item that "present-but-weak" fails.

**Layer 2b — Voice as the value (coaching products; VOICE behavioural):**
`#12` proactive + stage-aware · `#13` Required surfaces voiced · `#14` **memory loop works**
(Singify: *"welcome back — baseline X, last take 68, beat it"*) · `#20` founder-hardcoded pre-auth.

**Layer 3 — Pipeline preconditions (PRE; AUTO/JUDGE):**
MVP link live (HTTP 200) · named distributor archetype on the card (not "SMBs") · four gate questions
answered non-hand-wavily · **"too much" check** (`#30` team-admin, billing, multi-tenant = should be ABSENT).

**Always-on security (SEC; AUTO/grep — when the feature exists):**
`#17` webhook HMAC · `#18` allowlist · `#19` workspace-bind · `#36` no forks · `#38` RLS · `#39` no
secrets · `#40` sensitive env. *(These were the exact gaps the Kira/Connexions sweep closed — so they
are measurable and were failing before.)*

**Deferred to post-Gate-2 (SCALE — presence pre-GO is itself a flag):**
`#8` OG/favicon · `#21` memory user-surface · `#27/#28` full Settings + `profiles` · `#30` team admin.

---

## 6. The one irreducible judgement — promise attributes (`#9`)

Everything else reduces to AUTO/NAIVE/VOICE. `#9` is the **only** structurally-subjective criterion —
and it is exactly the hole that produced "is the MVP adequate?" gut calls. The fix is to make each
product's **Stage-0 promise** a *structured artifact* on the card: a list of promise attributes, each
with an explicit **quality bar**, scored present/absent + meets-bar. Singify is the template:

| Promise attribute | Quality bar | Status |
|---|---|---|
| Karaoke / sing-along | real backing in headphones (not a metronome) | ✅ |
| Polish | **dramatic**, not subtle (a subtle transform produces no "I want that") | ✅ |
| Coach | a **voice** agent, not text tips | ✅ |
| "Knows your voice" | vocal baseline pulled by the agent (memory loop works) | ✅ |

This converts *"I feel the polish is weak"* into *"polish attribute: quality bar = 'dramatic' → fails."*
It is recorded against the card, with a one-line evidence note — a logged decision, not a vibe.

---

## 7. Open items for THIN_MVP_RUBRIC v2 (the tensions this surfaced)

1. **Auth is ambiguous.** THIN §5 lists "Auth / ToS / accounts" as *OUT* (scale infra), but Singify's
   thin slice *shipped* full auth (§2/§3 ✅). Resolution for v2: **auth is `COND`, driven by the
   promise** — if cross-session continuity ("knows your voice") *is* the demoed promise, you need
   identity, but VMS rule 11 says that's a **founder-hardcoded `user_id`**, not a full auth system.
   So `#22–28` are `COND`, never Gate-1 *blockers*; a thin MVP with full auth+settings is arguably
   *"too much."*
2. **`#9` promise-attributes has no defined verification** — it's pure `JUDGE` today. v2 must add the
   per-product **promise-attribute schema** (§6 above) so `#9` becomes a structured checklist, not a vibe.

---

## 8. How this seeds the build

- **THIN_MVP_RUBRIC v2** — add a "Gate-1 Readiness Criteria" section (Tables A/B), resolve the §7
  tensions, and add the promise-attribute schema. *(This is the logged thin-mvp-review todo — Phase 0;
  nothing else can be built until "ready" is objectively defined.)*
- **Methodology cockpit** — `readiness_criteria` (catalogue, seeded from this doc), `card_promise_attributes`,
  `readiness_runs`, `readiness_results`; a `POST /api/methodology/cards/[slug]/readiness` endpoint; a
  **Readiness panel** on `/admin/methodology/[slug]` showing `met/total` + open items; the **Gate-1
  Launch button hard-gated** on the latest run (or an explicit recorded waiver). Execution = option (a):
  agent runs the canonicals + posts results; the cockpit displays, never auto-runs on load.
- **Phasing:** Phase 0 = rubric v2 (definition). Phase 1 = data model + endpoint + Readiness panel
  (option a). Phase 2 = headless service for the mechanical AUTO checks. Phase 3 = launch hard-gate + waiver flow.

---

## 9. Status (2026-05-25)

Phase-0 **catalogue complete** (this doc): all four canonicals inventoried (PRODUCT_STANDARDS,
naive-tester, voice-auditor, VOICE_MEMORY_STANDARD), every check mapped to a verification method +
thin-MVP relevance, cross-checked against Singify. **Not yet built:** the rubric v2 revision, the
cockpit data model/endpoint/panel, the launch hard-gate. Next action = the rubric v2 (Phase 0), which
this doc seeds.
