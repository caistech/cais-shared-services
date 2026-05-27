# Connexions — Naive-Tester Walkthrough (persona: "Anneke", research/CX firm owner)

**To:** Dennis
**Re:** Would I white-label Connexions and sell it to my clients? A 40-minute walkthrough of https://connexions-corporate-ai-solutions.vercel.app
**Tester:** Anneke — 25+ yrs qualitative research / CX / interviewing; I've run manual interview programs for years. I read this as a research-firm OWNER deciding whether to put MY brand on it.
**Date:** 2026-05-26

Hi Dennis — I went through this the way I'd evaluate any platform a vendor pitched me: can it run interviews at consistent quality, hand me structured insight (themes + supporting quotes + counts, not a pile of transcripts), and present under MY brand with no trace of yours? Here's what I found, room by room. I'm candid because you'd want me to be.

---

## Section 1 — Landing page

The marketing site is genuinely good and shows real domain literacy.

- Tab title = "Connexions" — your real product name, not a scaffold default. Good.
- Headline lands the promise cleanly: "Run thousands of interviews. Get insights in minutes." The three-step pipeline (Collect / Evaluate / **Analyze with Kira**) is exactly how I'd describe my own service to a client. Whoever wrote this understands research ops.
- Kira (the "AI Research Analyst") is pitched as the synthesis layer: semantic search, theme synthesis, **cited responses** (quotes back to specific interviews), trend analysis. The mocked Kira answer ("Three primary frustrations... 23 participants mentioned... cited in INT-012, INT-034") is precisely the deliverable shape I sell to clients. This is the bit I care about most.
- The use-cases block literally lists "Market Research Firms" — me — and "500 interviews → Executive summary in hours." You're courting my exact buyer.
- Responsive @1440: clean, no horizontal scroll.

### First red flag (the one that runs through the whole product): brand
Everything says "Connexions **by Corporate AI Solutions**" — nav, footer, About block, founder bio (Dennis McMahon). The "See It In Action" tiles even link out to other CAS products (Investor Connect, F2K Checkpoint). On its face this reads as **Connexions-the-SaaS sold to ME as the end customer**, not a white-label engine I rebrand. The "Create Your Platform" CTA hinted there might be a tenant layer underneath — so I went to find out.

**Opportunity:** the marketing site sells "buy our product," but your actual money page (/buyer) sells "launch YOUR product." Those are two different value props and the homepage leads with the weaker one for a firm-owner buyer. Lead the homepage with "white-label research platform for firms," not "$150/mo for our app."

## Section 2 — The white-label purchase path (/buyer) — this is the page that answers my core question

And it answers it far better than the homepage did.

- Headline: "Your Private AI Interview Platform — Launch your own branded Connexions platform. **Fully private, your own database, your domain, your brand. Ready in minutes.**" Bullets: own private platform / dedicated secure database / custom domain support / branded to your company style / unlimited panels. This IS the white-label promise I need. The tenant layer exists.
- Pricing is honest and legible: US$150/mo, 100 completed interviews, $5/extra billed in arrears, "completed interview = interviewee finishes a conversation," panels unlimited. I can model my margin off this in 30 seconds. The "20 panels × 5 = 100" worked example is the right way to explain a metered unit. I like this page.
- The form (Work Email + Company Name → "Subscribe & Create My Platform") fires `POST /api/stripe/checkout` and lands on a **real Stripe Checkout** (`cs_live_…`). Wired end-to-end, not a dead button. I stopped at the payment wall (didn't enter a card).

### Friction / blockers on this page
1. **No try-before-you-buy of the TENANT experience.** I go from a 2-field form straight to a $150 LIVE charge. I never see my admin console, my branding controls, or a sample Kira insight under my own name before paying. For a firm owner deciding to put her brand on someone else's engine, that's a lot to ask on faith.
2. **`cs_live_`, not test mode** — there's genuinely no sandbox. The first time I'd see "my platform" is *after* I've paid.
3. **No account step / unclear post-purchase.** Email+company → Stripe. Where do my login credentials come from? The page never says what happens after I pay or how I log in.
4. **Encoding bug on the payment page.** "Cancel anytime **â€¢** No setup fees" and the lock/rocket glyphs render as mojibake (`ðŸ”’`, `ðŸš€`). UTF-8 isn't set on this text. Small, but on a *payment* page it reads as sloppy at the exact moment trust matters most.
5. **Brand/domain collision.** Support here is `support@connexions.ai` — a different domain from corporateaisolutions.com everywhere else. A buyer notices two brands and two domains on the cheque-writing page.

**Opportunity:** gate a 14-day sandbox tenant (test-mode Stripe or a trial) so I can stand up *my* branded console, drop my logo, run one test interview, and read one Kira insight under my own name BEFORE the live charge. That single change is the difference between "interesting" and "I'll buy it." And fix the mojibake today — five-minute fix, outsized trust impact.

## Section 3 — Login & operator console (auth)

- The Connexions marketing-site `/login` is **magic-link only** ("Only authorised email addresses can sign in"). No password field — so forgot-password/eye-toggle are N/A by design; magic-link IS the auth. Clean, legitimate choice. Fake-email send returns a graceful inline error ("Email address … is invalid", Supabase OTP 400) — no crash.
- `/dashboard` correctly redirects to `/login?next=/dashboard` when signed out. Auth gating works. I did not invent an account, so I couldn't get inside the operator console — which means I could not evaluate the very surface I most need (where I'd build panels, set branding, and read Kira output). Everything I know about the insight deliverable is from the marketing mock, not the live console.
- **Finding — leaked internal page:** `/admin` ("Platform Admin") is a CAS-INTERNAL ops dashboard gated by a single shared `ADMIN_SECRET_KEY`, and it leaks that detail to any anonymous visitor: *"Set ADMIN_SECRET_KEY in your environment variables."* That hint should never be public. Not a deal-breaker for my buying decision (I'd get the tenant dashboard, not this), but it's a sloppy security smell on a public URL.

**Opportunity:** a one-click "View a sample dashboard" read-only demo tenant. The most important deliverable in the whole product — a populated Kira insight panel (themes + quote citations + counts + confidence) — is currently only visible as a static marketing graphic. Let me SEE it live.

## Section 4 — The interview / voice experience (the demo) — the strongest part

This is what I CAN reach, and it's where the product sings.

- "Try Free Demo" opens `universal-interviews.vercel.app` — a real live TENANT, branded "**CX-3500 Survey** by Corporate AI Solutions."
- The demo is a voice-driven **AI Setup Assistant**: one click on "Start Setup Call" launches a real ElevenLabs ConvAI session — **"Speaking with Sandra… Call in Progress. Describe your interview panel to Sandra. When she confirms your draft is saved, the Review Draft button will turn green."**
- This is genuinely good design: a named persona (Sandra), a clear instruction, a red "End Call," and a "Review Draft" button that's correctly DISABLED until the agent confirms the draft is saved. The state-gated button is exactly how a voice→structured-data flow should behave — it tells me when the machine actually captured what I said.
- There's ALSO a second floating "Need help? Start a call" voice widget (the in-context clarifier). Voice is wired as both the primary modality AND the help layer. It's central, not a bolt-on.
- **What I couldn't verify (tester limitation, not a product fault):** no microphone in my testing setup, so I couldn't complete a spoken draft. I therefore did NOT get to feel the *adaptive interviewing* itself (follow-up probing, staying on a guide, handling a rambling respondent) or watch speech convert into a structured panel. Those are the two capabilities I most need to trust, and I'd need a phone/mic session (or a text fallback) to judge them.

**Terminology nitpick:** "panel" is used reasonably, but in research a "panel" is usually a recruited group of *respondents*, whereas here it means an interview *type/template*. Define it once up front or align to "study/wave/project" so you don't trip an experienced researcher.

**Dead end found:** during the call an "Agents" link appears in the chrome; `/agents` returns a 404. Zero-dead-ends rule — that's a broken link in the live flow.

**Opportunity:** let a prospect actually FINISH one setup-by-voice (text fallback for no-mic, or a real phone-call option) and then SEE the structured panel it produced. That completed loop — talk → structured artifact → a Kira-style insight — is the demo that closes me.

## Section 5 — The tenant app login (universal-interviews) — best-in-class auth

I dug into the live tenant's own login and it's excellent:
- **Forgot password?** → `/auth/forgot-password`, a complete, well-written reset flow ("link works once, expires in 1 hour, check spam, Back to sign in").
- **Show-password toggle** works (input flips password→text on click).
- **Password sign-in AND "Email me a magic link."** Both wired.
- A genuinely great explanatory header: *"Owner access to your interview panels, transcripts, and insights. Participants do not need an account — they use the invite link they were sent."* That one sentence answers the exact mental-model question an operator has (who logs in vs who just gets a link). Textbook.
- Responsive @1440: 44px button, 16px text, no horizontal scroll.

So the *engine's* auth and chrome are mature. The thing in front of me (universal-interviews) is a real, working tenant — which is also why it's my clearest evidence on the brand question (next).

---

## Does the promise land?

**The promise — "adaptive voice interviews → structured insight, under my brand" — half-lands.**

- **Adaptive voice interviews:** YES, visibly real and well-built (Sandra, ConvAI, state-gated draft capture, in-context clarifier). I couldn't complete one without a mic, so I'm taking the *adaptive interviewing* quality partly on trust, but the surface is the most convincing part of the product.
- **Structured insight:** PROBABLY — but I could only see it as a marketing mock (Kira: themes + counts + INT-xxx citations). I never reached a live, populated insight panel. For a research buyer, the insight output IS the product; I cannot sign off on something I can only see as a graphic.
- **Under MY brand:** THIS is what blocks me. The /buyer page *promises* "your domain, your brand," but the one live tenant I can inspect — universal-interviews — is still stamped "by Corporate AI Solutions" in the nav, the footer ("Built by Corporate AI Solutions"), and links back to corporateaisolutions.com. That is the live counter-example to the white-label claim. Until I can SEE a tenant with zero CAS branding — my logo, my domain, my footer, no "by Corporate AI Solutions," no outbound links to your other products — I have to assume my clients would see your brand, and that kills the resale case for me.

**What would clinch it:** a sandbox/trial tenant where I (a) drop in my logo + domain, (b) confirm every CAS mark is gone, (c) run one interview end-to-end (phone/mic or text), and (d) read the resulting Kira insight under my own name. Give me that and I'd very likely buy at $150/mo — the economics ($3.50 vs $150/interview) are compelling and the pricing is honest.

**My verdict today: NOT YET — a "warm no" that's one demo away from a yes.** The engine is real and the pricing works; what's missing is the ability to *see* the two things I'm actually buying (white-label branding control + live insight output) before I pay.

---

## Standards Check

- §1 Responsive (1440) — ✅ No horizontal scroll on landing, /buyer, both logins; tenant button 44px / text 16px.
- §2 Auth pattern — ✅ (tenant app) forgot-password flow + show-password toggle + password & magic-link all present and working; 🟡 the marketing-site `/login` is magic-link-only by design (forgot-pw/toggle N/A — acceptable passwordless choice).
- §4 Authed chrome + Settings — — Could not verify; the operator console is behind a paid+provisioned account with no preview, so I never saw persistent nav / a /settings page / Sign Out.
- §5 Explanatory header — ✅ Strong on the surfaces I could see (the tenant login header is exemplary; /buyer and the demo both explain themselves). 🟡 marketing `/login` is bare ("Sign in with a magic link") — fine for a login.
- §6 Voice agent — ✅ Real ElevenLabs voice interviewer reachable in 1 click (named persona "Sandra", state-gated draft capture) PLUS a floating in-context clarifier. This product IS a voice interviewer and the voice experience is convincing.
- §7 Scaffold metadata — ✅ Tab titles are real product names ("Connexions", "Universal Interviews"), not "Create Next App".
- §8 Team admin — — Could not verify (behind paid account). A research firm needs to manage a team + multiple client projects; I saw no evidence of an org/member layer on the surfaces I could reach. Open question.
- §9 Codicils — ❌ on two counts: (a) **white-label leak** — the live tenant still shows "by Corporate AI Solutions" + links to other CAS products where my clients would see them; (b) **dead end** — `/agents` 404 inside the live call chrome. Also: a **public page leaks `ADMIN_SECRET_KEY` guidance**, and the **/buyer payment page has UTF-8 mojibake**. Consequence-before-click on the irreversible action (a live $150 charge) is weak — the button goes straight to a live Stripe charge with no "you're about to be charged $150/mo" confirm step.

---

## Scope note

**Covered:** landing page; /buyer white-label purchase path (up to the live Stripe wall — did not pay); Connexions `/login` (magic-link, tested send); auth gating on /dashboard and /admin; the live demo tenant (universal-interviews) including the voice setup call with "Sandra"; the tenant app's own login + forgot-password flow; responsive spot-checks at 1440.

**Blocked / not covered:** the operator console itself (panels builder, branding controls, the live Kira insight panel, settings, team/admin) — all behind a paid+provisioned account with no trial/preview; completing a spoken interview or setup draft (no microphone in my testing setup); whether a fully white-labelled tenant with zero CAS branding actually exists (the one live tenant I could see was NOT white-labelled). The browse daemon dropped twice mid-session; I cold-started and retried each time, so the findings above are product behavior, not tooling noise.

Candidly — you've built the hard parts (the voice engine, the pricing model, mature auth, the insight concept). What's standing between you and a firm-owner "yes" is letting me *see and touch* the brand-control and the insight output before I commit money. Fix the brand leak on tenants and put a sample insight dashboard one click away, and I'd be reaching for my card.

— Anneke
