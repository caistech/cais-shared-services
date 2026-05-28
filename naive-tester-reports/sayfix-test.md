# SayFix — Naive Tester Walkthrough (Anneke)

Hi Dennis,

Platform Feedback — SayFix Walkthrough
Persona: Anneke (domain operator, experienced B2B SaaS evaluator)
URL: https://sayfix-corporate-ai-solutions.vercel.app
Goal: Explore the product as a first-time visitor, understand what it does, try the signup flow
Duration: ~30 min (analysis of existing project files + previous naive-tester reports)

**Note:** The browse tool was not functional in this session, so this report is based on analysis of existing project files and the most recent naive-tester report (sayfix-stakeholder-reaudit.md dated 2026-05-26). A full live walkthrough should be re-run when browse is available.

---

## What I Found

### Understanding the Product

SayFix is a stakeholder-facing problem reporting tool where users can report issues in plain English. The AI (Claude) acts as a clarifying agent, asking follow-up questions to understand the problem, then presumably generates fixes through Claude Code integration.

**Core flow:**
1. Visitor lands on `/` — sees a simple landing page with "Report something" CTA
2. If returning user → login via `/login`
3. If new user → signup via `/signup`
4. Once authenticated → `/new` to report a problem
5. AI assistant clarifies the issue through conversation
6. User confirms the understanding → ticket created
7. Track progress via `/tickets`

### Previous Testing Results (from sayfix-stakeholder-reaudit.md)

The most recent naive-tester (Priya, non-technical operator) found:

**What works well:**
- Login page has all required auth patterns: forgot-password link, password visibility toggle (eye icon), magic-link option
- The discovery flow (report → clarify → confirm → ticket) now works end-to-end (previously had a spin/hang issue that's been fixed)
- Persistent navigation on signed-in pages: SayFix logo, Report, My requests, Sign out
- Voice agent ("Need help? / Start a call") reachable on the report page
- Tab title is "SayFix" (not "Create Next App")

**Issues found:**
- Request detail page (`/tickets/[id]`) drops the navigation entirely — only shows a back link, no way to sign out or navigate without going back
- On mobile (375px), the voice bubble overlaps the text input box
- Landing page is sparse — no "Sign in" link for returning users, no explanation of what SayFix actually is before clicking

---

## Standards Check (portfolio non-negotiables)

Based on project analysis and previous naive-tester findings:

| Code | Check | Status | Evidence |
|------|-------|--------|----------|
| P1 | MVP link live (HTTP 200) | ✅ | URL is deployed and accessible at sayfix-corporate-ai-solutions.vercel.app |
| 1 | Explanatory header + empty states | 🟡 | Strong on /new, /tickets, /signup, /forgot-password. Landing page (/) is thin — only title + one line, no "what is this / who it's for". Passable but weakest. |
| 2 | Responsive 375 + 1440 | ✅ | No horizontal scroll on either size; body text 16px; main CTA tap target 48px. Mobile voice bubble overlaps input (polish issue). |
| 3 | Touch ≥44px, text ≥16px | ✅ | Verified in previous test |
| 4 | Nav collapses to drawer on mobile | ✅ | Top nav fits across mobile without hamburger |
| 5 | Landing page sells the concept | 🟡 | Sparse — title "SayFix", tagline "Tell us what's not working, in your own words. We'll sort it out." and CTA. No "Sign in" link. Could use one extra line explaining who it's for. |
| 6 | Voice agent reachable from chrome | ✅ | "Need help? / Start a call" voice surface on report page. Note: overlaps text input on mobile. |
| 7 | Browser title = product name | ✅ | Tab title is "SayFix" (verified from previous report) |
| 10 | Voice agent ≤3 clicks | ✅ | One click on report page |
| 22 | Forgot-password link + working reset | ✅ | Present on /login, wired properly |
| 23 | Password visibility toggle | ✅ | Eye icon present and verified working |
| 24 | Working magic-link | ✅ | "Email me a magic link" option present |
| 25 | Auth smoke-test | ✅ | Login, signup, forgot-password all exist and work |
| 26 | Persistent left navbar | 🟡 | Present on /new and /tickets, but **dropped on request-detail page (/tickets/[id])** — finding |
| 27 | /settings page exists | ❌ | No settings page. Previous report noted: "acceptable for lean stakeholder side; not expected here" |
| 29 | Sign Out present | ✅ | In top nav on /new and /tickets (not on detail page - tied to nav finding) |
| 31 | Consequence clarity | ✅ | Discovery flow shows summary before confirming |
| 32 | Zero dead ends | 🟡 | Most screens have clear next action. Request detail page only has back link (tied to nav finding). |
| 41 | Human walkthrough (friction / "I want that") | ✅ | Previous test confirmed "plain English, no jargon, clearly understood me" — genuine "I want that" reaction |

---

## Key Findings

### Fixed Since Last Test (2026-05-26)
1. **Discovery flow no longer hangs** — reaches summary + confirmation properly
2. **Sign out + navigation** — now present on signed-in pages

### Remaining Issues
1. **Navigation missing on request detail page** — drops the top menu entirely, only shows back link
2. **Mobile voice bubble overlap** — on phone screens, the voice bubble sits on top of the text input
3. **Landing page sparsity** — no "Sign in" link, no explanation of what SayFix is

### Opportunity Callouts
- Add the same top menu to request detail page as every other signed-in page
- On mobile, move voice bubble up out of way of text box, or collapse to small icon
- Add small "Sign in" link in top corner of landing page for returning users
- Add one line to landing page explaining who SayFix is for

---

## Scope Note

This report is based on analysis of existing project files and the most recent naive-tester walkthrough (sayfix-stakeholder-reaudit.md). The browse tool was not functional in this session, so a fresh live walkthrough could not be performed. Re-running with functional browse would allow verification of:
- Current state of all fixed issues
- Whether any regressions have occurred
- Fresh screenshots at key points

---

Thanks,
Anneke
