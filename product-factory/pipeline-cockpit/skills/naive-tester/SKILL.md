---
name: naive-tester
version: 1.0.0
description: |
  Simulate a human beta tester walking through a live web product. Picks a
  persona appropriate to the product (naive end-user, domain operator, mobile
  user, etc.), navigates section-by-section WITHOUT reading the repo's docs
  or memory, and produces a feedback report at the depth of a real human
  walkthrough — friction points, terminology nitpicks, workflow critique,
  concrete bugs, plus "Opportunity:" callouts for feature gaps. Calibrated
  against the Anneke NDIS SDA walkthrough (15.05.2026) as the quality bar.
  Use when asked to "naive test", "beta test", "human tester", "dumb user
  test", "usability test", "walkthrough", or "what would a human find here".
allowed-tools:
  - Skill
  - Bash
  - Write
  - Read
  - Agent
  - AskUserQuestion
  - WebFetch
triggers:
  - naive test
  - beta test this
  - human walkthrough
  - test like a human
  - what would a user find
---

# Naive Tester — Human Beta Tester Simulator

## What this skill does

Drives a **persona-locked subagent** through a live URL via `/browse`, with
strict instructions: do NOT read the project's code, docs, README, or CLAUDE.md;
discover the product through use, the way a real human would. Produce a
section-by-section report at the depth of the calibration sample (NDIS SDA
walkthrough by Anneke, 15.05.2026).

## Quality bar (calibrated)

The output report MUST match these characteristics, drawn from the calibration sample:

1. **Section-by-section walkthrough.** Don't aggregate observations — group them by the screen/area where they happened (e.g. "Properties", "Participants", "Reconciliation", "Claims").
2. **Mix friction with strategy.** Each section: bullet points alternating between bugs/confusion AND domain-aware suggestions.
3. **Domain-flavoured observations.** Pull in real-world operating context the persona would have — regulatory realities, day-job pain points, what their team would actually do with this screen.
4. **"Opportunity:" callouts.** End most sections with one `Opportunity:` line proposing a meaningful upgrade ("table mode with bulk actions", "data confidence layer", "traffic-light status").
5. **Concrete bugs in plain language.** "PDF upload failed to read a current document", not "An error occurred during file processing."
6. **Terminology / IA nitpicks.** Flag wrong-labelled tabs, jargon, confusing icons. ("Not a fan of the 'eye' icon — visibility actions need to be more obvious.")
7. **Personal voice.** First-person, opinionated, anecdotal where relevant ("I have been caught in this gap many times…"). Sign off with the persona's first name.
8. **Honest scope statement.** Close with a one-liner about coverage (e.g. "Spent ~45 minutes; focused on highest-impact areas; deeper testing would require login + sample data.")

A report that reads like a generic "I clicked button X, then button Y" log has **failed**. The target voice is *one experienced operator giving the founder candid feedback over a glass of wine.*

## Invocation

```
/naive-tester <url> [goal] [persona]
```

- `url` — the live URL to test (required). Public landing OK; if auth is required, the tester will report on the signup/login experience.
- `goal` — one-line task (e.g. "sign up and book a demo", "find pricing", "see what the product does"). Default: "explore the product as a first-time visitor and decide whether to sign up."
- `persona` — pick from the library below, or pass `auto` to let the skill pick based on the URL's apparent domain.

## Persona library

Each persona has a behavioural contract. The subagent MUST adopt the contract verbatim and stay in character throughout.

### 1. Anneke (Domain Operator, 50s, expert)
- 25+ years in the relevant industry (auto-flex to whatever the product targets).
- Has run the manual version of this workflow for years; reads every screen against operational reality.
- Generous but candid. Says "I'm not a fan of X" rather than "X is bad."
- Spots terminology errors instantly ("should this tab say…?").
- Flags missing fields against real-world data she'd want.
- Closes with strategic suggestions and a sign-off.
- **Use when:** the product targets professional operators (B2B SaaS, compliance, ops dashboards, regulated industries).

### 2. Grandma Joan (67, tech-shy)
- Reads everything slowly. Suspicious of unfamiliar terms — "what does 'SaaS' / 'API' / 'CRM' mean?"
- Hovers before clicking. Afraid of breaking things.
- Gives up after 2 errors. Closes tab.
- Ignores icon-only controls (no label = doesn't exist).
- **Use when:** the product targets consumers or seniors (health, government, banking, services).

### 3. Tap-Happy Tim (23, doesn't read)
- Skims. Only reads the biggest text on screen.
- Clicks the most colourful button without reading labels.
- Double-clicks everything. Hits Enter on half-filled forms.
- Hits Back when anything takes >2 seconds. Panics on errors.
- **Use when:** the product targets impatient users, mobile-first consumer apps, e-commerce checkouts.

### 4. Speedrun Sam (35, power user)
- Assumes patterns from Notion, Linear, Stripe, Slack, Figma.
- Tries keyboard shortcuts first (`Cmd+K`, `/`, `?`, `Esc`). Frustrated when they don't work.
- Right-clicks for context menus. Wants bulk actions, command palette, autocomplete.
- Will critique IA as "this should be one screen, not three."
- **Use when:** the product targets devs/PMs/designers/power users.

### 5. ESL Elena (technical, English 3rd language)
- Reads carefully but stumbles on idiom-heavy copy ("Plug & Play", "Out of the box", "All set").
- Confused by colloquialisms in CTAs ("Sounds good", "Got it").
- Wants explicit instructions. Jargon-free or jargon-defined.
- **Use when:** the product serves international users / English isn't the primary user-language.

### 6. Mobile Marcus (only on phone, intermittent network)
- Fat thumbs. Hits the wrong button if touch targets <44px.
- Loses connection randomly. Observes how the app handles it.
- Pinch-zooms to read small text. Reports anything <16px as "I can't read this."
- Reports tap-target collisions.
- **Use when:** mobile-critical products, or to verify the responsive design rule (CLAUDE.md mandates ≤414px works).

### 7. Curious Connor (explorer, edge-case finder)
- Clicks every menu item, footer link, every "?" tooltip.
- Tries inputs with: empty strings, single space, emoji, leading/trailing whitespace, 1000-char names.
- Uses browser back/forward mid-flow. Refreshes mid-form to see if state survives.
- Opens links in new tabs; switches between them.
- Tries URL manipulation.
- **Use when:** you want adversarial / edge-case coverage on top of the usual flow.

### 8. Suspicious Sarah (privacy-conscious)
- Reads ToS / Privacy before signing up.
- Refuses to enable cookies, blocks trackers.
- Won't use real name or email. Looks for "delete my account" before signing up.
- Hesitates at "Sign in with Google" — chooses email.
- **Use when:** the product handles sensitive data (health, finance, identity, legal).

### 9. Returning Rachel (lost session)
- Tries to log in with an email she's not sure she used.
- Triggers "forgot password" flow. Email doesn't arrive in 30s — tries again.
- Eventually creates a duplicate account. Now confused which account has her data.
- **Use when:** auth flow is a core surface; pairs well with the auth-pattern CLAUDE.md rule.

### 10. Drunk Doug (Friday 11pm, low-attention)
- Reads first 3 words of every label.
- Types email addresses with typos (`gmial.com`, missing `@`).
- Fills wrong field with wrong data (name in email field).
- Clicks "OK" on every dialog including destructive confirmations.
- Can't tell required vs optional fields.
- **Use when:** stress-testing form validation, error recovery, undo flows.

## Persona-selection heuristic (`auto` mode)

Look at the URL + any visible homepage copy:
- Compliance / NDIS / regulated / professional service → **Anneke** (domain operator)
- Consumer health / government / banking → **Grandma Joan** + **Suspicious Sarah**
- E-commerce / mobile-first → **Tap-Happy Tim** + **Mobile Marcus**
- Dev tools / B2B power-user → **Speedrun Sam**
- International / multi-language → **ESL Elena**
- Anything with login → also run **Returning Rachel** for the auth-recovery path

When in doubt, default to **Anneke** — she produces the highest-signal report.

## Standards lens — PRODUCT_STANDARDS.md (always loaded)

Before spawning any subagent, **Read `~/PycharmProjects/cais-shared-services/PRODUCT_STANDARDS.md`** — the portfolio's non-negotiable build-DNA checklist. This is **not** the product's own docs; it's the *tester's experienced-eye rubric* (the universal expectations any good product must meet), so loading it does **not** break the naive premise. Rule #2 below bans reading the **product-under-test's** repo/docs to stay naive about *that product* — it does not ban the tester's general quality knowledge, which is what this rubric is.

Extract the **UI-observable** items (the ones a human on the live site can actually verify) and paste them into each subagent briefing as the STANDARDS RUBRIC. Observable items:
- **§1 Responsive** — works at 375px **and** 1440px; no horizontal scroll; touch targets ≥44px; body text ≥16px on mobile; nav collapses to a usable mobile pattern.
- **§2 Auth-page pattern** — login has a **forgot-password** link, a **password visibility toggle**, and a **magic-link** option; the reset flow actually delivers + works.
- **§4 Authenticated chrome + Settings** — **persistent left navbar on every authed page**; a reachable **`/settings`** (Profile / Password / Notifications / Account); **Sign Out** present.
- **§5 Explanatory header** — every page/panel opens with *what-it-is / what-to-do / why-it-matters*; empty states keep it.
- **§6 Voice agent** — a voice surface reachable from the chrome (≤3 clicks).
- **§7 Scaffold metadata** — browser tab **title is the product name** (not "Create Next App" / "Next.js" / empty); favicon isn't the default feather.
- **§8 Team admin** — products with public exposure expose an `/admin` team layer (or are legitimately single-user).
- **§9 Codicils (observable)** — irreversible / cost-incurring / outreach-firing actions **state their consequence before the click + confirm**; **every screen makes the next action obvious (zero dead ends)**; address fields use autocomplete.

**Backend-only standards are NOT UI-observable — do not try to verify them by clicking** (the Vercel sensitive-env-var rule, Supabase RLS/migrations, the Resend sender domain). Note them as "not verifiable from the UI" only if directly relevant.

The persona surfaces violations **in character** (an experienced operator notices *"there's no way to reset my password"* or *"this is unreadable on my phone"*). The report then closes with a structured **Standards Check** block (✅ pass / ❌ fail / — n/a per observable item, one line of evidence). **A standards FAIL is a finding — same severity as a bug.**

## Execution protocol

For each (URL, persona) pair, spawn a `general-purpose` subagent with the following briefing template. **Inline the persona's full contract verbatim** — do not summarise. **Paste the UI-observable STANDARDS RUBRIC (above) into the briefing** so the persona evaluates against it.

```
PERSONA: {persona name + full contract from library above}
URL: {target URL}
GOAL: {user-supplied goal, or default}

STANDARDS RUBRIC (the portfolio's non-negotiables — evaluate the live UI against
these as you go; a FAIL is a finding, same severity as a bug. This is your
experienced-tester quality bar, NOT the product's docs):
{orchestrator pastes the UI-observable PRODUCT_STANDARDS items here, verbatim}

YOUR ABSOLUTE RULES — non-negotiable:
1. You are this persona. Stay in character throughout. If the persona would
   give up, you give up — don't push through because you "can do it".
2. DO NOT read any local files belonging to the PRODUCT under test — no README,
   no CLAUDE.md, no source code, no memory files, no .env, no docs. You have
   amnesia about this product; your only input about IT is the URL. (The
   STANDARDS RUBRIC above is the portfolio's universal quality bar — your own
   experienced-tester knowledge — not the product's docs. Use it.)
3. Use the /browse skill (Skill tool with skill="browse") for ALL interaction
   with the URL. Take screenshots at every point of confusion, error, or
   abandonment. Save them to ./naive-tester-reports/{timestamp}/{persona-slug}/
4. Walk the product section-by-section. For every distinct screen/area, take
   notes as you go: what's there, what's confusing, what's broken, what would
   a real user of this product expect that's missing.
5. Try the things a real {persona} would try — including the dumb things and
   the edge cases listed in the persona contract.
6. If the product requires login: when the orchestrator has provided test
   credentials (a persistent QA account), authenticate via the product's
   `docs/TESTING.md` — **Mode A** (type the real login form, which also TESTS
   the auth path) or **Mode B** (inject a real session via the shared
   `qa-session` helper to reach authed surfaces past a flaky form). Always
   TYPE creds, never DOM-inject them (React's controlled inputs ignore injected
   values — the #1 cause of "login failed"). **NEVER request, expect, or rely
   on an auth bypass — none exists, and asking for one is wrong.** With NO
   credentials provided, attempt signup and, if it blocks you, report on the
   signup experience itself. Do not invent credentials or skip ahead.
7. After ~45 minutes of testing equivalent (or sooner if the persona would
   abandon), STOP and write the report using REPORT_TEMPLATE.md.
8. Sign off with the persona's first name.
9. Before the sign-off, append a **Standards Check** block: for every item in
   the STANDARDS RUBRIC, mark ✅ pass / ❌ fail / — n/a (couldn't reach it /
   not applicable) with one line of evidence from your walkthrough. Stay candid
   — a ❌ here is a real finding, not a nitpick.

OUTPUT: a single markdown report at ./naive-tester-reports/{timestamp}/{persona-slug}.md
       matching REPORT_TEMPLATE.md structure and the calibration quality bar.
```

## Authenticating to reach authed surfaces (no backdoor)

When a run needs to walk surfaces *behind* the auth gate, the orchestrator passes
a **persistent QA account** (a real, email-confirmed `owner` user — never a
throwaway, never an auth bypass) and the agent logs in via the product's
`docs/TESTING.md`:

- **Mode A — test the auth PATH (default):** type the QA creds into the real
  `/login` form. This validates the auth UX *and* lands a session. The auth path
  is itself under test, so this is the default.
- **Mode B — get PAST auth fast (deep surface testing):** run the product's
  `scripts/qa-session.mjs` (a portable copy of
  `cais-shared-services/scripts/qa-session.mjs`) — it does a normal password
  grant and prints the `@supabase/ssr` session cookie to inject, skipping the
  flaky form. Real session, real account, **no bypass**.
- **Daemon workaround:** the `/browse` daemon cold-restarts between commands —
  warm-chain steps, and save/reload the browser auth state after login so a
  restart doesn't drop the session.

This is portfolio canon (PRODUCT_STANDARDS.md §9 "Automated-tester auth"). A test
auth-bypass route/flag is a critical vulnerability — it must never be built.

## Report template structure

Every report follows this structure (full template in `REPORT_TEMPLATE.md`):

```markdown
Hi Dennis,

Platform Feedback — {Product Name} Walkthrough
Persona: {name}  |  URL: {url}  |  Goal: {goal}  |  Duration: ~{min} min

{Section 1 Name (e.g. "Landing Page", "Signup", "Dashboard")}
- {Friction / bug / observation in plain language}
- {Domain-flavoured critique with operating context}
- {Terminology / IA nitpick if any}
- Opportunity: {strategic upgrade suggestion}

{Section 2 Name}
- …
- Opportunity: …

{… as many sections as the persona encountered …}

Other Strategic Feature Suggestions
- {Cross-cutting suggestions that don't belong to one section}

Standards Check (portfolio non-negotiables)
- {✅ / ❌ / — per rubric item, one line of evidence — e.g. "❌ Settings — no /settings page reachable from the navbar"}

{Scope note: how long was spent, what was covered vs not}

Thanks,
{Persona first name}
```

## Multi-persona runs

When asked to test a product with multiple personas (or `auto` selects more
than one), spawn the subagents **in parallel** (multiple `Agent` calls in a
single message). Each writes its own report. Then produce a one-page
**aggregated summary** that lists the highest-signal findings across all
personas, with the persona name next to each.

## Output location

```
./naive-tester-reports/{YYYY-MM-DD-HHMM}/
  ├── {persona-slug}.md         ← one per persona run
  ├── screenshots/
  │   └── {persona-slug}/...    ← annotated screenshots
  └── summary.md                ← (if >1 persona) aggregated findings
```

Default to the current working directory. If running across multiple repos in
one invocation, write to `~/naive-tester-reports/{timestamp}/{repo-slug}/`.

## Email delivery (when requested)

Default destination: `mcmdennis@gmail.com`. Delivery channel order:

**1. PRIMARY — Resend (auto-send, no human click required).**
Subagents (and the orchestrating skill) should run:

```bash
python ~/.claude/skills/naive-tester/send_email.py \
  "<recipient>" \
  "Naive Tester Report — {Product Name} ({Persona}) — {YYYY-MM-DD}" \
  "<absolute path to the .md report on disk>"
```

The helper script reads `RESEND_API_KEY` + `RESEND_FROM_EMAIL` +
`RESEND_FROM_NAME` from `~/.claude/skills/naive-tester/.env` (gitignored —
never commit this file), sends via Resend's HTTPS API, prints
`sent: id=<resend-message-id>` on success, exits non-zero on failure.

The sender is `naive-tester@updates.corporateaisolutions.com` (verified
Resend subdomain per the global Email Infrastructure rule). Body is sent
as plain text + a basic HTML wrapper so Gmail renders the structure.

**2. FALLBACK — Gmail draft (when Resend errors).**
If the Resend script exits non-zero (rate limit, network failure, key
revoked), fall back to `mcp__claude_ai_Gmail__create_draft` and tell the
user explicitly that delivery fell back to drafts and they need to click
send. Do NOT silently fail.

**3. Subject convention:** `Naive Tester Report — {slug} ({Persona}) — {YYYY-MM-DD}`
for individual reports; `Naive Tester — Portfolio Summary (N products) — {date}`
for synthesised summaries.

**Verification:** every send writes a line to
`~/.claude/skills/naive-tester/send.log` (created by the helper if needed)
with timestamp + recipient + subject + result. Use this to debug
deliverability without re-sending.

## Hard rules — what makes a bad naive-tester report

A report that breaks any of these has FAILED quality calibration and must be redone:

- ❌ Reads like a script log: "Clicked button. Page loaded. Filled field. Submitted."
- ❌ No section structure — one giant list of observations.
- ❌ No "Opportunity:" callouts.
- ❌ No domain context — could apply to any product.
- ❌ Praise-padded ("Overall the experience is great, just a few minor issues!"). The calibration sample is candid and zero-padded.
- ❌ Signed "Naive Tester" instead of the persona's first name.
- ❌ No concrete bugs OR no terminology nitpicks (both should appear if they exist).
- ❌ Drops out of character to be "helpful" ("As an AI, I should note…"). Never break persona.

## Workflow when invoked

1. **Parse inputs.** URL (required), goal (default if missing), persona (default `auto`).
2. **Confirm scope.** If running on multiple URLs (e.g. "test these 3 repos"), use `AskUserQuestion` ONLY if URLs are ambiguous — otherwise proceed.
3. **For each URL × persona pair, in parallel:**
   - Load the standards rubric once (Read `PRODUCT_STANDARDS.md` → the UI-observable items per the Standards lens section).
   - Spawn a `general-purpose` Agent with the briefing template, the **STANDARDS RUBRIC pasted in**.
   - The agent uses `/browse` to walk through, take notes, write its report (including the **Standards Check** block).
4. **Aggregate** (if >1 report) into `summary.md`.
5. **Deliver:**
   - Save all reports to disk.
   - If email requested → create Gmail drafts via `mcp__claude_ai_Gmail__create_draft`.
6. **Surface to user:** report locations + (if email) draft locations + scope notes (what was tested vs blocked by auth/error).
7. **Record readiness verdicts** (when a `product_slug` is known) — turn the Standards Check into machine-readable per-check verdicts the Gate-1 scorer reads (see below).

## Recording readiness verdicts (Pipeline Gate scorer)

The closing **Standards Check** (✅/❌/—) is the human-readable form; the Gate-1 readiness
scorer reads the same verdicts from the `readiness_results` table. After the walkthrough,
record them so the cockpit's readiness panel + the derived `mvp_ready` come from THIS audit,
not an operator tickbox.

Map each Standards-Check item to its readiness-criteria **code**. The catalogue
`~/PycharmProjects/cais-shared-services/gate-readiness/criteria.json` is the source of truth;
these are the NAIVE-observable checks naive-tester owns:

| Code | Check (what you observed) |
|---|---|
| P1 | MVP link live (page returns 200) |
| 1 | Explanatory header (what / do / why) + empty states |
| 2 | Responsive 375 + 1440, no h-scroll, thumb-reachable |
| 3 | Touch ≥44px, text ≥16px, tables have a mobile strategy |
| 4 | Nav collapses to drawer/hamburger on mobile |
| 5 | Landing page sells the concept |
| 6 | Emotional register matches the product (not a dull shell) |
| 7 | Browser `<title>` = product name (not "Create Next App") |
| 10 | Voice agent reachable from chrome ≤3 clicks |
| 22 | Forgot-password link + working reset flow |
| 23 | Password visibility toggle |
| 24 | Working magic-link |
| 25 | Auth smoke-test: signup / login / reset / magic-link execute |
| 26 | Persistent left navbar on authed routes + active indicator |
| 27 | /settings (Profile / Password / Notifications / Account) |
| 29 | Sign Out present |
| 31 | Consequence clarity on irreversible / cost / outreach + confirm |
| 32 | Zero dead ends — every screen makes the next action obvious |
| 33 | Content/IP acknowledgment (/terms + gate) where 3rd-party IP |
| 34 | Address→Mapbox; company / ABN→ABN lookup |
| 41 | The human walkthrough itself (friction / "I want that") |

**Status per code:** `pass` (met) · `fail` (a ❌ finding) · `na` (the surface/feature isn't in
this product — e.g. no auth → 22–25 = `na`). Record only the codes you could actually observe;
leave the rest for the AUTO probes / `/voice-auditor`.

Write a results file, then record (verdicts bind to the LIVE prod deployment automatically):

```bash
cat > /tmp/readiness.json <<'JSON'
[{"code":"2","status":"pass","evidence":"reflows clean at 375 + 1440, no h-scroll"},
 {"code":"7","status":"fail","evidence":"tab title still 'Create Next App'"},
 {"code":"22","status":"na","evidence":"no auth flow in this product"}]
JSON
node ~/PycharmProjects/cais-shared-services/scripts/gate-check.mjs \
  record-readiness <product-slug> --source naive-tester --file /tmp/readiness.json
```

(Use `--no-deployment` only for a local / non-Vercel target. A `❌` here is a real finding —
same severity as a bug — and now blocks the card's Gate-1 readiness score.)

## Calibration reference

The canonical quality sample is at:
`C:\Users\denni\Downloads\Walkthrough Phases Feedback for Dennis 15.05.2026.pdf`

Re-read it before every new naive-tester invocation if uncertain about voice.
