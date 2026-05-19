# Naive Tester Remediation Plan — cais-interview-agent

**Date:** 2026-05-19
**Persona tested:** Sam (technical founder, Series A B2B AI startup, $4M raised, 8 engineers)
**Surface tested:** https://cais-interview-agent.vercel.app
**Tester score:** 2/10
**Tester decision:** Would NOT book a follow-up call
**Source report:** `C:\Users\denni\naive-tester-reports\2026-05-19-1711\cais-interview-agent.md`

> **Status:** PLAN ONLY — DO NOT EXECUTE. This document scopes the fix; a separate session
> will land the changes.

---

## 1. Headline finding

Sam came in expecting "AI agency screening interview — voice or chat, six smart questions,
output a scoped brief and a calendar link". What he got was a 307 from `/` straight to
`/interview`, which rendered a single sentence: *"Missing install id. This page is reached
from inside an MCP client after the funnel prompt fires."* No CTA, no fallback, no contact.

His unconscious read: *"Dennis built a thing only Dennis can use."* Since the intake tool
itself is the partnership demo, that's the worst possible signal to send a prospect.

**Quote (the kill shot, report line 35):**
> "The meta-message of a partnership intake tool is itself a product demo — if the intake
> is half-built and dead-ends, my unconscious read is 'they will deliver me a half-built
> thing that dead-ends'."

---

## 2. Root-cause map (where the dead end lives in code)

| Symptom | File | Line(s) | What it does today |
|---|---|---|---|
| Root URL dead-ends straight into `/interview` (server-side 307) | `src/app/page.tsx` | 1–5 | `redirect("/interview")` — no marketing landing exists |
| "Missing install id" wall for any non-MCP visitor | `src/app/interview/page.tsx` | 40–51 | Hard gate on `isUuid(installId)`; else render error block with no CTA |
| Error copy is system-voice, not user-voice | `src/app/interview/page.tsx` | 43–48 | "This page is reached from inside an MCP client after the funnel prompt fires" — jargon-first |
| Metadata description is good but invisible | `src/app/layout.tsx` | 4–7 | "Tell us what you're building so we can route you to the right next step" sits in `<head>`, never surfaced as headline |
| `submitInterview` server action ALSO gates on `isUuid(installId)` | `src/app/interview/actions.ts` | 26–28 | Even if we render a public form without an install_id, submit will fail unless we mint one |
| No `not-found.tsx` / catch-all | `src/app/` | – | `/start`, `/demo`, `/signup`, `/login`, `/install`, `/mcp`, `/about` all 404 (Sam tested all of them) |
| No favicon / og-image / manifest | `src/app/` + `public/` | – | 8 console 404s on page load (favicon, manifest.json, og-image) |

The architecture is sound — clean Next.js 15 App Router, server actions, Supabase + Resend
wired correctly. What's missing is **a public front door**. The MCP-gated deep-link flow
should be a *progressive enhancement*, not the only door.

---

## 3. Proposed fixes (in priority order)

### P0 — Critical: replace the dead end with a public landing fallback

**Goal:** When a visitor arrives with no `install_id`, render a real landing page that
explains what CAIS is, who it's for, and gives them a way to start the interview anyway
(by minting a sessionless `install_id` server-side). Do NOT show "Missing install id".

#### 3.1 Build a public landing at `/`

Replace `src/app/page.tsx` (currently a 5-line `redirect("/interview")`) with a real
marketing page. Structure:

**Explanatory header (per the global UI EXPLANATORY HEADER RULE — 3 questions):**
1. **What is this?** — "CAIS Interview — the front door to Corporate AI Solutions."
2. **What does the user do here?** — "Tell us what you're building in two minutes."
3. **Why does it matter?** — "We route you to the right CAIS product, pod, or paid sprint
   — or to dennis@corporateaisolutions.com if it's a fit for a direct conversation."

**Page sections (top to bottom):**
- Hero: positioning headline (use the meta description copy: *"Tell us what you're building
  so we can route you to the right next step"*), one-sentence subheadline, primary CTA
  `Start interview` (links to `/interview/start` — see 3.2).
- Three-step explainer strip: (1) Two-minute interview · (2) Routed to the right product or
  pod · (3) Direct email follow-up from Dennis if there's a fit.
- Social proof row: "Built by Dennis McMahon · 17 shipped AI products · $5K-in-7-days factory
  model" — with three thumbnail logos (Connexions, F2K, InvestorPilot) linking out.
- Founder card / "Who is CAIS": one-paragraph bio, contact links (email
  dennis@corporateaisolutions.com, phone +61 402 612 471, WhatsApp), pulled from the
  Connexions footer.
- Secondary "Skip the AI and email Dennis" link at the bottom — catches the 20% who don't
  want an AI intake.

**Responsive (per global RESPONSIVE DESIGN RULE):** mobile-first, single column ≤768px,
two-column hero ≥1024px, 44×44px tap targets, 16px base type, full-width CTA on mobile.

#### 3.2 Add `/interview/start` — public-mode entry that mints an install_id

New route: `src/app/interview/start/page.tsx`. Server component. Logic:

1. Generate a UUID (`crypto.randomUUID()`).
2. Upsert into `mcp_install` with `mcp_name = "public_landing"` and the new `install_id`
   (mirrors `markStarted` in `page.tsx` lines 15–28, but with a `source = "public"` marker
   in the row so analytics can distinguish MCP-funnel installs from public-landing installs).
3. Redirect to `/interview?install_id=<new-uuid>&mcp=public_landing&source=public`.

This makes the existing `InterviewForm` work unchanged. The agent is identical; only the
provenance differs.

> **Open question for execution session:** does `mcp_install` schema need a new column
> (e.g. `source TEXT NOT NULL DEFAULT 'mcp_funnel'`) so we can distinguish? If yes, this
> requires a Supabase migration. Per the SUPABASE MIGRATIONS rule, the execution session
> applies it via `supabase db push` — does not punt to the user. Idempotent
> (`ADD COLUMN IF NOT EXISTS`).

#### 3.3 Rewrite the `/interview` no-install_id branch to be a CTA, not a wall

`src/app/interview/page.tsx` lines 40–51 currently render an error block. Replace with:

- Friendly headline (NOT "Missing install id"): "Looks like you arrived directly — let's
  start fresh."
- One-sentence framing: "If you came from your MCP client, the link should include an
  install id. If not, no problem — start a fresh interview below."
- Primary CTA: `Start a fresh interview` → links to `/interview/start` (which mints the
  install_id and bounces back).
- Secondary link: `Or email dennis@corporateaisolutions.com directly`.

User-voice, not system-voice. Two paths forward, never zero.

### P1 — High: surface positioning, founder, and social proof on the interview page itself

Even users with a valid `install_id` currently see a bare form (`src/app/interview/page.tsx`
lines 56–78). Add a slim "About CAIS" panel beneath the form:

- Founder line: "Built by Dennis McMahon — 17 shipped AI products."
- Three logo thumbnails (Connexions, F2K, InvestorPilot) linking to the live products.
- Contact escape hatch: "Prefer email? dennis@corporateaisolutions.com" link in the page
  footer.

This is the same content as the public landing's social-proof row — extract into a shared
component (`src/components/SocialProofStrip.tsx`) and import in both places.

### P2 — High: fix the meta polish (favicon, og-image, manifest, title)

Sam logged 8 console 404s on page load (favicon, manifest.json, og-image — "the basics").
The bar is low and the fix is small:

- Add `public/favicon.ico` (CAIS brand mark).
- Add `public/og-image.png` (1200×630, social-share preview).
- Add `public/manifest.json` (minimal PWA manifest).
- Update `src/app/layout.tsx` metadata:
  - `title: "CAIS Interview — tell us what you're building"` (less dry than current
    "CAIS Interview").
  - Add `openGraph` block referencing `og-image.png`.
  - Add `icons: { icon: "/favicon.ico" }`.

### P3 — Medium: improve the form copy and add a sixth-question preview mode

Per Sam's report line 25: an agent that pushed on *"(a) what would have to be true for this
to be a 10x outcome for your business, (b) what's the smallest version that proves the
thesis, (c) who on your team owns the integration"* would already be top-quartile vs the
four AI agencies he interviewed this month.

The current form has ONE free-text field ("What are you building?"). Consider expanding to
a structured six-question agent pass:

1. What are you building?
2. What would have to be true for this to be a 10x outcome?
3. What's the smallest version that proves the thesis?
4. Who on your team owns the integration?
5. What's your timeline / budget shape (sprint, retainer, equity)?
6. What have you already tried?

This is a **product change**, not a bug fix. Flag for /office-hours rather than ship in
the remediation pass.

Also (cheaper, do now): add Sam's suggested *"What I would ask if you were sitting across
from me"* preview — a one-pager listing the six questions with a "I want to do this live
with a human instead" checkbox. Gives prospects who don't want an AI intake a fast track.

### P4 — Low: explicit 404 page

Sam tested `/start`, `/demo`, `/signup`, `/login`, `/install`, `/mcp`, `/about`,
`/interview/new` — all bare Next.js 404s. Add `src/app/not-found.tsx` that:

- Apologises gracefully.
- Links back to `/` (the new public landing).
- Surfaces the email escape hatch.

Also redirect the obvious paths Sam tried: `/start` → `/interview/start`, `/demo` → `/`,
`/about` → `/` (until a real about page exists), `/login` → `/` (no auth, but stop the 404).

### P5 — Documentation: update the README

`README.md` lines 6–8 say the URL is reached *"by clicking the prompt URL inside an MCP
client"*. With the public-mode entry point added, update to clarify that there are now
**two valid entry paths**:

- **MCP-funnel path (existing):** prompt URL fires inside MCP client → `/interview?install_id=<uuid>&mcp=au-compliance&trigger=<tool>`.
- **Public-landing path (new):** visitor lands on `/` → clicks "Start interview" →
  `/interview/start` mints an install_id with `mcp_name=public_landing` → redirects to
  `/interview?install_id=<new-uuid>&mcp=public_landing&source=public`.

Add an "Analytics note" line: routing payloads now include `source` so the operator
dashboard can split funnel-attributed responses from cold-traffic responses.

---

## 4. Acceptance criteria (how we know the remediation worked)

A re-test by the same persona should achieve **≥7/10** on Sam's rubric. Specifically:

- [ ] Root URL `/` renders a marketing page with hero, three-step explainer, social proof,
      founder card, contact escape hatch. NOT a 307 redirect.
- [ ] `/interview` with no `install_id` renders a user-voice CTA (NOT "Missing install id"
      error). Two paths offered: start fresh, or email directly.
- [ ] `/interview/start` mints a UUID, upserts `mcp_install` with `source=public`,
      redirects to `/interview?install_id=<new>`.
- [ ] The interview form is reachable end-to-end from a cold visit, no MCP client required.
- [ ] Submission writes to `mcp_engagement` with `routing_payload.source = "public"` for
      public-mode users.
- [ ] Favicon, og-image, manifest.json all load without 404. Console clean on page load.
- [ ] `<title>` reads "CAIS Interview — tell us what you're building" (not the current
      bare "CAIS Interview").
- [ ] Founder identity, contact info, and social proof surface on BOTH the landing and the
      interview page.
- [ ] Mobile (375px) and laptop (≥1280px) viewports both work — verified via `/browse`
      skill before claiming done (per RESPONSIVE DESIGN RULE).
- [ ] All paths Sam tested (`/start`, `/demo`, `/about`, etc.) either redirect or land a
      `not-found.tsx` with an escape hatch, not a bare 404.

---

## 5. What this remediation does NOT change

- The MCP-funnel deep-link path keeps working exactly as before. Existing `install_id`
  URLs from `cais-au-compliance-mcp` still hit `/interview?install_id=<uuid>&mcp=au-compliance`
  and render the form. The MCP funnel is now an **enhancement** rather than the only door.
- The Resend welcome email, operator notification, Connexions intake redirect, and
  `/thank-you` flow are all untouched.
- Admin dashboard at `/admin/*` is untouched.
- The Supabase schema for `mcp_install`, `mcp_engagement`, `mcp_call` is preserved. If
  3.2 needs a new `source` column, it's an additive nullable column with a default — fully
  backward-compatible.

---

## 6. Effort estimate

| Phase | Scope | Estimate |
|---|---|---|
| P0 (landing + no-install_id branch + `/interview/start`) | Critical front-door fix | 3–4 hrs |
| P1 (social proof, founder, contact on interview page) | Share component, both surfaces | 1 hr |
| P2 (favicon, og-image, manifest, title) | Asset polish | 30 min |
| P3 (form copy refresh + question preview) | Copy + one new component | 1–2 hrs |
| P4 (`not-found.tsx` + path redirects) | One file + middleware edits | 30 min |
| P5 (README update) | Docs | 15 min |
| **Total (P0–P2 minimum to ship)** | Public-mode front door + polish | **~5 hrs** |
| **Total (P0–P5 full pass)** | Everything | **~8 hrs** |

P0–P2 is the minimum bar to flip Sam's verdict from 2/10 to 7+/10. P3–P5 lift it further
toward "this is a real product I want to engage with".

---

## 7. Open decisions for the execution session

1. **`mcp_install.source` column** — add or not? Recommendation: yes, additive nullable
   column with default `'mcp_funnel'`. Lets the operator dashboard split funnel-attributed
   responses from cold traffic. Migration is idempotent (`ADD COLUMN IF NOT EXISTS`).
2. **Public-mode triage** — does the public landing show the same "for someone else / for
   yourself" routing fork? Recommendation: yes, keeps the Connexions routing intact and
   gives cold visitors the same path to the Platform Trust Sprint as MCP-funnel respondents.
3. **CTA copy on the landing** — "Start interview" vs "Tell us what you're building" vs
   "Get routed". Recommendation: "Tell us what you're building" — matches the meta
   description and is more inviting than "Start interview" (which sounds like a job
   interview).
4. **Q6 preview / live-human fast-track** — ship in this pass (P3) or defer to office-hours
   product session? Recommendation: defer. The remediation should fix the dead end, not
   redesign the interview agent.
5. **Logo thumbnails for social proof** — do we have brand-approved assets for Connexions,
   F2K, InvestorPilot? If not, ship text-only "17 shipped AI products" line for P1 and
   queue logo prep separately.

---

## 8. Source quotes from Sam's report (for review-pipeline grounding)

- *"For a domain literally named cais-interview-agent.vercel.app this is the front door,
  and the front door has been bricked up."* (line 9)
- *"'Missing install id' is an error message, not a page title. It is written from the
  system's point of view ('you are missing a thing I need'), not from the user's ('here is
  what to do next')."* (line 16)
- *"The reference to 'MCP client' and 'funnel prompt' is jargon that will lose 95% of
  visitors."* (line 17)
- *"Make the install_id flow a progressive enhancement, not a gate."* (line 41)
- *"I leave thinking 'Dennis built a thing only Dennis can use.' That is not the signal a
  build partner wants to send to a prospective client."* (line 35)
- *"The bones are there — clean Next.js, fast load, decent meta description, mobile
  reflows. It just needs a front door."* (line 50)

---

**Remediation owner:** Dennis (Corporate AI Solutions)
**Next step:** open a new session, run /plan-eng-review on this document, then implement
P0 → P2 in a single PR. Re-invite Sam (or run the /naive-tester skill again) for verification.
