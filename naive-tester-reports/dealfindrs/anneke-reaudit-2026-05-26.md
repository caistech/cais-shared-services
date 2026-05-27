# DealFindrs — Naive-Tester Re-Audit

Hi Dennis,

**Product:** DealFindrs · **Persona:** Anneke (Domain Operator — buyers' agent / property professional, 25+ yrs AU) · **URL:** https://deal-findrs.vercel.app · **Goal:** Cold first-time visit → decide to sign up → actually create an account end-to-end and reach the product (re-test of the previously "dead" Create Account button). Separately judge whether the product matches its buyers'-agent ICP. · **Duration:** ~40 min equivalent.

---

## HEADLINE VERDICT (read this first)

**SIGNUP WORKS — end to end.** The "Create Account & Continue" button is no longer dead. I filled every required field, ticked Terms, and clicked submit. It fired a real `POST` to `…supabase.co/auth/v1/signup` (redirect_to `/auth/callback?next=/setup`), the request returned **HTTP 200** in ~4.2s, and the page showed: *"We've sent a confirmation link to anneke.test+70443344@gmail.com. Click it to activate your account, then log in."* That's a clean, standard double-opt-in. Whatever was broken before is fixed. A real person can create an account today (the only thing I can't verify without inbox access is that the confirmation email actually lands — worth a live send-test, see Other Suggestions).

**ICP VERDICT — there's a real mismatch.** The hero sells to *"buyers' agents & property firms"* and promises *"a steady flow of scored deals."* The actual product — and especially **/reports** — is a **development-feasibility tool for sell-side promoters/developers**: QS construction-cost reports, GRV/PRSV valuations, IRR/ROC/peak-debt feasibility, Affordable Gap (HAFF/NHFIC), and a Finance Pack "for the broker/lender meeting." As a buyers' agent I'd want yield, comparables, rental return, holding costs, strata, zoning — none of that is here. This product is for the person *building/funding* the deal, not the person *buying* on a client's behalf. The headline and the product are pointed at two different people.

---

## Section-by-section walkthrough

### 1. Landing page
The page itself is well made — dark, confident, the Green/Amber/Red colour story lands instantly, pricing is clear (Free / $99 / $299). I like it as a page. What I *don't* like is that it can't decide who it's talking to. In the space of one screen it says *"For buyers' agents & property firms"* (the hero), then *"property development promoters,"* then *"Built by developers, for developers."* Those are three different audiences, and as a buyers' agent the second and third tell me this isn't for me. The feature list confirms it: "minimum GM%," "Auto-Generate IMs" (Investment Memorandums), "DealFindrs submit opportunities, Promoters review and approve." That's a deal-origination/promotion workflow, not a buy-side sourcing tool. I run the buy side — I assess a listing against a client's brief, I don't write IMs to raise equity.

The tab title reads "DealFindrs | AI-Powered Project Assessment" — fine, real product name, not a scaffold default. But "Project Assessment" again signals development, not buying.

**Opportunity:** Pick one ICP per page and commit. If the real customer is the developer/promoter (which the whole product says it is), change the hero from "buyers' agents" to "property developers & deal promoters" and the mismatch evaporates. If you genuinely want buyers' agents, you'd need a different product underneath (yield, comps, holding costs) — the current engine doesn't serve them.

### 2. /reports
This is the most honest page on the site and also the clincher for the ICP question. The explanatory header is excellent — *what this page is / what to do / why it matters*, exactly the orientation I want. The six artifacts (RAG → QS → Valuation → Feasibility → Affordable Gap → Finance Pack) with the "one record, no spreadsheet drift" dependency story is genuinely good thinking; the audit-trail-back-to-the-assumption line is the kind of thing a lender actually cares about.

But every word of it is sell-side/feasibility. GRV, PRSV, TDC reconciliation, IRR/ROC/peak debt, contingency and prelims, HAFF/NHFIC co-investment, "the export for the broker/lender meeting." This is a feasibility-and-finance stack for someone *promoting a development to raise money*. A buyers' agent doesn't produce a QS report or a Finance Pack — we produce a recommendation to a client to buy (or not). Nothing here speaks to rental yield, comparable *sales for a purchaser*, holding costs, strata levies, body-corp, or council zoning from a buyer's lens.

**Opportunity:** /reports is your strongest asset — lean into it as the *developer feasibility* promise and re-point the whole funnel there. It's wasted under a buyers'-agent banner.

### 3. Signup (the main event)
The form is complete and well-built: First/Last name, Email ("This will be your admin login" — nice touch), Company name, Company address, City, Country (defaults Australia, sensible), Mobile, Password + Confirm (8-char minimum enforced), Terms checkbox. Password field has a working eye toggle (I clicked it — the input flipped from masked to plain text). Mobile layout is clean single-column with big tap targets.

I filled it all as Anneke Vandenberg / Vandenberg Buyers Advocacy / Brisbane / Australia / a throwaway gmail / a 12-char password, ticked Terms, submitted. It worked (see Headline). Two nits:

- **The confirmation banner appears *above the still-fully-populated form*.** For a half-second I wasn't sure it had worked — the form's all still sitting there with my details, so my instinct was "do I press it again?" A cleaner pattern replaces the form with a dedicated "check your email" success screen so there's zero ambiguity and no double-submit risk.
- **Terms of Service and Privacy Policy links both go to `#` (dead anchors), and `/terms` returns a 404.** You're making me *tick a box agreeing to documents that don't exist.* For a free trial that's sloppy; for a $99–$299/mo product collecting business details, it's a genuine gap — and the portfolio standard says a content/legal product needs real `/terms` and `/privacy` pages.

**Opportunity:** Ship real `/terms` and `/privacy` pages and wire the links before you take a cent; swap the post-submit state to a full "check your email" screen.

### 4. Login / auth pattern
Login is the best-behaved auth page in the walkthrough — it has all three things I look for: a **Forgot password?** link, a **password visibility toggle**, *and* an **"Email me a magic link"** option. That's the full pattern, and it's rare to see all three. No complaints here beyond the generic tab title (same "AI-Powered Project Assessment" as every other page).

**Opportunity:** None needed — this is the standard the rest of the site should match. (I didn't fire the magic link or reset to avoid spamming; worth a live send-test internally.)

### 5. Post-signup / product
I couldn't reach the authenticated product because the account requires email confirmation first (correct behaviour) and I have no inbox access for the throwaway address. So I can't comment on the in-app chrome, Settings, the voice "Voice-Guided Input" feature the landing promises, or whether `/setup` (the post-callback redirect) does the right thing. Flagging as **not covered** rather than pass/fail.

**Opportunity:** For QA, stand up a confirmed test account so a tester can walk the authed surfaces (the portfolio's "real QA account + docs/TESTING.md" standard).

---

## Other Strategic Feature Suggestions

- **Live email send-test.** The 200 + "we sent a link" message is necessary but not sufficient — the real failure mode is the email never arriving (Supabase built-in SMTP is rate-limited; the portfolio standard is Resend on `updates.corporateaisolutions.com`). Confirm a real inbox receives the link before you call signup "done."
- **Make /reports the funnel, not a sub-page.** It's the clearest articulation of value on the whole site. The developer who reads it will get it immediately.
- **Address & company fields are plain text.** A property tool collecting a company address should use address autocomplete (Mapbox) and an ABN lookup on the company field — both portfolio standards, and both reduce typos in the very data you'll print on a Finance Pack.
- **Decide the ICP before the next marketing spend.** Every dollar driving buyers' agents to this page is a dollar driving the wrong person to a developer tool.

---

## Standards Check (portfolio non-negotiables)

| Item | Result | Evidence |
|---|---|---|
| §1 Responsive | ✅ | No horizontal scroll at 375px (landing + signup); body 16px; submit button 88px tall; cards/pricing reflow to single column. |
| §2 Auth-page pattern | ✅ | Login has Forgot-password link + password eye toggle + "Email me a magic link"; signup password toggle works (flips type password→text on click). |
| §4 Auth chrome + Settings | — | Not reachable — account needs email confirmation; couldn't enter the authed app to verify navbar/Settings/Sign Out. |
| §5 Explanatory header | 🟡 | /reports header is exemplary (what/do/why). Landing + login lack a true 3-part header; signup just says "Create Your Account / Start your 14-day free trial." Acceptable but uneven. |
| §6 Voice agent | ❌ | No voice surface on any public page (no `elevenlabs-convai`, no voice widget). Landing *promises* "Voice-Guided Input" but it's presumably behind auth — not reachable from the public chrome. |
| §7 Scaffold metadata | 🟡 | Tab title is the real product name (good, not "Create Next App") — but **no favicon at all** (no `link[rel=icon]`), and every page shares the one generic title. |
| §8 Team admin | — | Product is multi-user/multi-tenant by design ("5 users", "Promoters review and approve") but the /admin layer sits behind auth — not verifiable cold. |
| §9 Codicils | ❌ | **Terms/Privacy links = `#`; `/terms` 404s** while the signup forces agreement to them. Address field = plain text (no Mapbox); company field = plain text (no ABN lookup). |

---

## Scope note

**Covered:** Landing (desktop + mobile), /reports (the ICP-decisive page), full signup form fill + submit + observed network/console/result, login auth-pattern, mobile responsive (375px) on landing + signup, favicon/voice/metadata checks, Terms/Privacy link + /terms page check, address/company autocomplete check. **Not covered:** the authenticated product (Settings, chrome, in-app voice, /setup, /admin) — blocked behind email confirmation with no inbox access; live email *delivery* (only confirmed the 200 + "sent" message, not receipt); the magic-link and password-reset flows weren't fired to avoid sending mail. Browse daemon restarted between commands in this environment, which caused a couple of `@ref` collisions mid-fill — those were a tooling quirk, not product bugs (verified the form has single, non-duplicated inputs and the submit fires correctly).

Anneke
