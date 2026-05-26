# Gate Readiness Review — workbook guide

> Companion to **`GATE_READINESS_CRITERIA.md`** (the source criteria) and the
> **`GATE_READINESS_REVIEW.xlsx`** sign-off workbook (drafted 2026-05-25, in
> `~/Downloads/`). This doc explains the workbook's intention, structure, what it
> asks the operator to fill, and the context behind every question — so the review
> can be completed without re-deriving what each cell means.
>
> **Last updated:** 2026-05-26.

---

## Intention

The workbook is a **sign-off worksheet** that turns the prose in
`GATE_READINESS_CRITERIA.md` into two reviewable lists Dennis ratifies. Claude
drafted the proposals; **Dennis fills the yellow columns**, and on approval the
answers fold into **THIN_MVP_RUBRIC v2** and the cockpit's **`readiness_criteria`
table**.

That is the point: the "is the thin MVP ready for Gate 1?" test currently leans on
Claude's interpretation of the rubric. This workbook **pins the quality bars and the
blocking/non-blocking tiers to Dennis's own call**, so the gate becomes codified,
machine-applied policy rather than per-product judgement (the §5-rubric discipline
from `BUSINESS_MODEL.md`, extended to readiness).

## The workbook at a glance (37 tabs)

| Block | Tabs | What it is |
|---|---|---|
| **README** | 1 | Instructions + the three legends (Tier / Method / Relevance). |
| **Product promise tabs** | 33 | One per product. **11 pre-drafted** (Singify, Connexions, Kira, RaiseReady, LingoPure, DealFindrs, InvestorPilot, PartnerPilot, NDIS SDA, R&D Tax, CQR) — react/edit. **~22 blank templates** with the promise pre-noted — fill in. |
| **Criteria Classification** | 1 | The 45 readiness checks + Claude's proposed tier ("List 4"). |
| **(old list-delete me)** | 1 | A stale ASCII-table draft. **Junk — safe to delete.** |

**Excluded** (no promise tab — infrastructure / paying-client / marketing): MMC
Build, Corporate AI Solutions site + cockpit, Platform Trust, Property Services
(substrate), coordination-hub, `@caistech/*`.

## What it asks the operator to fill (two tasks)

**Task A — each product tab** (the "I want that" definition):
- `B1` **Needed? (Y/N)** — flag tabs to skip.
- Per attribute row: **Approve? (Y/N)** · **Your Quality Bar (X, not Y)** (edit
  Claude's if you'd set it differently) · **Notes**.

**Task B — the Criteria Classification tab** (per check):
- **Confirm? (Y/N)** · **Your Tier (override dropdown)** · **Weight
  (High/Med/Low, if weighted)** · **Notes**.

### Legends (what you're scoring against)

- **Tier** — `HARD` = blocks the Gate-1 Launch button · `WEIGHTED` = feeds the
  GO/REDESIGN score (waivable) · `CONDITIONAL-*` = only applies when that feature
  exists · `TOO-MUCH` = inverse guard (its *presence* pre-GO is a flag) · `DEFER`
  = scale-infra, not scored at Gate 1.
- **Method** — `AUTO` automatable · `NAIVE` naive-tester live · `VOICE`
  voice-auditor · `JUDGE` human/agent judgement.
- **Relevance** — `IN` experience/DNA · `PRE` pipeline precondition · `SEC`
  security · `COND` feature-conditional · `SCALE` deferred post-Gate-2.

---

## Context — Part A: the product promise tabs

Each tab encodes the **THIN_MVP "I want that" test**: the product's one-line
*Promise (Stage 0)*, broken into the **attributes that make the promise land**,
each with a **quality bar in "X, not Y" form** — because an attribute *present but
weak* fails as surely as a missing one (the Singify lesson: polish that "worked"
but sounded *subtle* produced no "I want that"). Singify, the worked example:

> Karaoke = *real backing in headphones, not speaker bleed* · Polish = *dramatic,
> not subtle* · Coach = *a voice agent, not text tips* · Knows-your-voice =
> *baseline the agent pulls, not read in by a prompt* · See-yourself = *in-browser
> video, not audio-only*.

Per tab, the operator confirms those bars are the right "I want that" line, or
rewrites them. Blank tabs (TenderWatch, F2K Checkpoint, the lingo family, etc.)
carry only the promise — the operator sets the attributes + bars as each nears
Gate 1. The promise tabs feed **check 9** in Part B.

## Context — Part B: the 45 checks (one line each)

### Preconditions — the pipeline gate (all `PRE`)
- **P1** MVP link live (HTTP 200) — `HARD`. The Gate-1 outreach *embeds the link*; no live link, no send.
- **P2** Named distributor archetype on the card, not "SMBs" — `HARD`. Rule 15 distributor-first.
- **P3** The four gate questions answered non-hand-wavily — `HARD`. BizModel §3.
- **P4** "Too much" guard: scale-infra **absent** pre-GO — `TOO-MUCH`. Over-building before validation is the flag.

### Core UX / portfolio DNA (mostly `IN`)
- **1** Explanatory header (what/do/why) + empty states — `WEIGHTED`.
- **2** Responsive 375 + 1440, no h-scroll, thumb-reachable — `HARD`.
- **3** Touch ≥44px, text ≥16px, table mobile strategy — `WEIGHTED`.
- **4** Nav collapses to drawer/hamburger on mobile — `WEIGHTED`.
- **5** Landing page sells the concept — `WEIGHTED`.
- **6** Emotional register matches the product (not a dull shell) — `WEIGHTED`.
- **7** Browser `<title>` = product name (not "Create Next App") — `HARD`.
- **8** OG image + manifest favicon — `DEFER` (polish, post-Gate-2).
- **9** **Promise attributes present AND at quality bar** — `WEIGHTED`. *Hook back to the Part-A tabs.*

### Voice (conditional on the product having voice)
- **10** Voice agent reachable from chrome ≤3 clicks — `CONDITIONAL-HARD`.
- **11** Voice consumes `@caistech/elevenlabs-convai` + `/react`, BYOK, persona — `CONDITIONAL-HARD`.
- **12** Voice proactive + stage-aware — `WEIGHTED`.
- **13** Voice placement: every Required surface voiced (voice-auditor) — `CONDITIONAL-HARD`.
- **14** Voice memory loop *works* — welcome-back recall fires, observable — `CONDITIONAL-HARD`.
- **15** Memory: pull-not-push, distil-then-recall, works off results — `CONDITIONAL-WEIGHTED`.
- **16** Identity server-derived (`conversation_id`, never `user_id`) — `CONDITIONAL-HARD` (SEC).
- **17** Every convai webhook verifies HMAC (`.trim`), unverified → 401 — `CONDITIONAL-HARD` (SEC).
- **18** Allowlist on every public agent — `CONDITIONAL-HARD` (SEC).
- **19** Workspace-bind webhook (not the deprecated per-agent shape) — `CONDITIONAL-HARD` (SEC).
- **20** Cross-session memory authed-only; pre-auth = founder-hardcoded id — `CONDITIONAL-WEIGHTED`.
- **21** Memory owned/deletable/TTL + a user memory surface — `DEFER` (SCALE).

### Auth (only if the product has auth)
- **22** Forgot-password link + working reset — `CONDITIONAL-HARD`.
- **23** Password visibility toggle (shared component) — `CONDITIONAL-HARD`.
- **24** Working magic-link — `CONDITIONAL-HARD`.
- **25** Auth smoke-test: signup/login/reset/magic-link execute — `CONDITIONAL-HARD`.

### Chrome / Settings / Team (mix of `IN` and `SCALE`)
- **26** Persistent left navbar on authed routes + active indicator — `WEIGHTED`.
- **27** `/settings` Profile/Password/Notifications/Account — `DEFER`.
- **28** `profiles` table + `on_auth_user_created` + RLS — `DEFER`.
- **29** Sign Out present — `CONDITIONAL-WEIGHTED`.
- **30** Team admin (orgs/members/roles/invite/usage, `/admin`) — `DEFER`.

### UX safety / flow / content (`IN`)
- **31** Consequence clarity on irreversible/cost/outreach + confirm — `WEIGHTED`.
- **32** Zero dead ends — every screen makes the next action obvious — `WEIGHTED`.
- **33** Content/IP acknowledgment (`/terms` + gate) where 3rd-party IP — `CONDITIONAL-HARD`.
- **34** Address → Mapbox; company/ABN → ABN lookup — `CONDITIONAL-WEIGHTED`.
- **35** Email sender = `updates.corporateaisolutions.com` — `CONDITIONAL-WEIGHTED` (SEC).

### Build discipline / security
- **36** `@caistech`-first (fork-check clean) — `WEIGHTED` (SEC).
- **37** Feature pre-flight manifest + preflight run — `WEIGHTED` (PRE).
- **38** Supabase: idempotent CLI migrations, RLS every table, no client service-key — `CONDITIONAL-HARD` (SEC).
- **39** No secrets in committed files / logs — `HARD` (SEC).
- **40** Vercel env vars sensitive, prod+preview only — `HARD` (SEC).
- **41** Human walkthrough: friction/terminology/"I want that" (naive-tester) — `WEIGHTED`.

**Tier tally of Claude's proposals:** 7 HARD · 14 CONDITIONAL-HARD · 13 WEIGHTED ·
5 CONDITIONAL-WEIGHTED · 5 DEFER · 1 TOO-MUCH (45 total).

---

## The decisions that matter most

The choices that most shape the eventual gate:
1. **Which `WEIGHTED` items get promoted to `HARD`** (and which `HARD` items relax) — this sets what can *block* a launch.
2. **The High/Med/Low weights on the 13 weighted checks** — these set the GO / REDESIGN / NO-GO bands.

Everything else is confirm-or-tweak. On sign-off, the confirmed tiers + weights
become the `readiness_criteria` table and THIN_MVP_RUBRIC v2.
