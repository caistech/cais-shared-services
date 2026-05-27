# Platform Feedback — Singify Walkthrough

**Tester:** Tap-Happy Tim (23, impatient, mobile-first, likes karaoke, non-technical)
**URL:** https://singify-platform.vercel.app/sing
**Date:** 2026-05-27
**Viewports tested:** mobile 375px (primary) + desktop 1440px
**Goal:** Can I actually sing something, and would I come back?

**One-line verdict:** The core flow (voice-check → pick a song → sing along with lyrics) is genuinely fun and works, and search is the standout — but I tapped the big red "sing" button and at first NOTHING happened, the studio page CRASHED twice on cold load before it would open, and the voice "coach" (the whole selling point) is a dead text box that errored when I sent a question. I'd come back IF the page loads reliably and the coach actually talks. Right now it's 50/50.

---

## First load — the studio page (/sing)

- **CRASH on first two cold loads.** Going straight to `/sing` (which is the URL I was handed, and exactly what the landing page's red "Open the practice studio →" button points to) returned **"Page crashed"** twice in a row before it would open on the third try. As Tim, two crashes = I'm gone. I don't retry three times; I close the tab and go back to TikTok. The root domain `/` loaded fine every time, so it's the studio route specifically — probably the audio/mic/camera worklets being heavy. **This is the single most damaging bug** because `/sing` is the link the marketing pushes you to.
- When it DID load, the studio is nicely laid out: a punchy gradient "Let's make you sound amazing" header, a clear explanatory paragraph, a yellow "Pop your headphones in first" callout, and five numbered steps. I knew what to do without reading much. Good.
- Opportunity: pre-warm or lazy-load the heavy audio/camera stuff so the first paint of `/sing` is instant and never crashes — the page should appear, THEN ask for mic/camera when I hit a record button.

## Step 1 — Vocal baseline (the voice check)

- Tapped the big red **"● Start baseline"** button (the obvious colourful one, exactly what Tim does). **Nothing visibly happened at first** — no spinner, no countdown, no "recording" state. That's a dead-feeling half-second where I think it's broken.
- It actually DID respond: a help line appeared — *"Singify needs your microphone to hear you — click 'Allow' when your browser asks. If nothing popped up, your mic is blocked: open the permissions in your browser's address bar and allow it, then try again."* That's genuinely good, clear, non-jargon recovery copy. But it appears BELOW the button where my thumb was, so on a phone I might not see it without scrolling. On a real phone the OS mic prompt would fire, so this path is probably fine for real users — I just couldn't complete it in the test harness (mic grant is blocked in headless).
- The "Singify only listens while you're recording. Your take stays in your browser until you choose to save it." reassurance is a nice touch — addresses the "is this thing spying on me" worry a normal person has.
- Opportunity: when I tap Start baseline, show an immediate visual state (pulsing dot / "asking for your mic…") in the SAME spot as the button so there's zero dead air, even before the OS prompt resolves.

## Step 2 — Pick a song (search) — the best part

- Typed "Someone Like You Adele", hit **Search**. Button showed "Searching…" (disabled) and results came back in ~1.7s — just inside my patience window.
- Got **8 real karaoke versions**, each as a thumbnail card, and — this is the clever bit — each one is **flagged "✓ Karaoke — safe to sing over"** except one tagged **"⚠ Has original vocals"**. That's the thing no other karaoke app does for me, and it's immediately obvious why it matters. This is the moment I went "oh, that's actually smart."
- Tapped the first result. Step 2 ticked to ✓ and Step 3 expanded with the song loaded. Smooth.
- Note: the backing track plays via an embedded **YouTube** iframe, which dragged in a pile of **Google/DoubleClick ad requests** in the network log. For a paid/branded karaoke product, YouTube ads potentially showing on the backing is an experience and rights smell — a real student doesn't want a beer ad before their vocal warm-up.
- Opportunity: the safe-vs-original-vocals flag is the headline feature — lean into it harder (sort safe ones first, maybe hide/collapse the "has vocals" ones behind a "show anyway").

## Step 3 — Sing it (lyrics + camera)

- Step 3 ("Sing it 🎤") loaded the **full scrolling lyrics** for the song and a dark "stage" panel with a "your camera" placeholder and a gradient **"🎤 Start singing"** button. This LOOKS like a real karaoke product — colour, energy, a stage. It passes the "I want that" vibe test; it does not feel like a grey form.
- Same mic/camera-blocked help line appears, with the nice fallback *"You can still play the song below."* — graceful.
- A benign console warning fires from the YouTube embed (`postMessage origin … youtube.com` mismatch) — harmless but noisy.
- I couldn't complete an actual recording (headless mic/camera grant is blocked by the test harness, not the app) — so the produce/polish/coach-on-your-take steps (4 & 5) I could not reach. Flagging that the back half of the promise (the "hear yourself polished" wow moment) is unverified in this pass.

## The voice coach ("Ask about this" / "Ask the coach") — BROKEN

This is the differentiator the landing page sells ("A coach, not a score… talk to a voice coach"). It does not work.

- The floating black **"🎙️ Ask about this"** pill is present on every screen (chrome-level, reachable in one tap — good placement). The inline **"🎙 Ask the coach"** links on each step open the same thing.
- Tapping it opens a panel titled **"Singify coach"** whose close button is literally labelled **"Close voice assistant"** — so it's MEANT to be the voice agent. But the panel only contains a **text box ("Type your question") + a Send button**. **There is no mic button, no "talk"/"speak" affordance, and no actual voice conversation widget** — it's rendering the text fallback, not a voice coach. (Confirmed: the markup uses `.convai-fallback` / `.convai-panel` classes from the voice widget, but no `<elevenlabs-convai>` voice element is mounted.)
- So for a product whose pitch is "talk to a coach," I cannot talk to anything. I can type.
- And **typing doesn't work either**: I typed "How do I find my key?", hit Send, and **nothing came back** — no answer, no "thinking" state — and the console threw **`net::ERR_CONNECTION_REFUSED`**. The Send is wired to an endpoint that isn't reachable (looks like it's pointing at a dead/local backend). So the coach is a dead end: voice mode missing, text mode errors.
- **Mobile layout bug:** the coach panel renders as a thin slice floating in the MIDDLE of the page with a big empty white void below it, instead of a clean bottom-sheet or full-screen takeover. The CSS even has a `@media (max-width:640px) { inset:0 }` full-screen rule, but it isn't taking effect at 375px — so it looks half-broken.
- **Overlap bug (mobile):** the floating "Ask about this" pill **sits on top of and covers the right half of the "Ask the coach" button** in step 1, and overlaps the lyrics/camera panel in step 3. On a phone it's blocking the very button it's meant to be.
- Opportunity: this IS the product. Until the coach actually responds (voice or at least text), the "coach, not a score" promise is unfulfilled and the validation reaction ("I want a coach that knows my voice") can't fire. Fix the endpoint + render the real voice widget + make the panel a proper full-screen mobile sheet that doesn't overlap.

## Navigation, Settings, Login

- **Hamburger (☰)** top-right on mobile opens a clean dropdown: Home / Studio / Settings + a Sign in button. Tap targets fine. Collapses sensibly; desktop shows a persistent left sidebar with active-route highlight. Responsive nav: good.
- **Settings** page (`Settings — Singify`) has an explanatory header and a working **"Reset my voice profile"** action for the device-cached baseline. Profile / Password / Notifications are gated behind "Sign in to manage…" — fine for a no-account trial, but they're stubs today.
- **Login** page is solid and hits the auth checklist: email + password, a **"Show password"** eye toggle, **"Forgot password?"** link, **"Email me a sign-in link"** (magic link), and **"Create an account."** No friction. (Minor: the login tab title is the generic landing title "Singify — sing better between lessons" rather than something like "Sign in — Singify".)
- **/terms** exists and is genuinely good — own-performance vs backing-track rights, personal-use-only, takedown path, 7-day link expiry. Right for a karaoke/3rd-party-IP product. (Did not reach a save/share gate since I couldn't record, so couldn't confirm the acceptance gate fires at save time — the audit notes it's wired at signup.)

## Responsive (375px + 1440px)

- **No horizontal scroll** at either width on any page I hit. Good.
- **375px:** single-column cards, hamburger nav, 16px+ body text, ≥44px buttons. Clean — EXCEPT the floating coach pill overlapping content (above) and the coach panel not going full-screen.
- **1440px:** persistent left sidebar, centered max-width content column, looks intentional, coach pill tucks bottom-right without overlapping. Good.

---

## Standards Check

- §1 Responsive — ✅ **pass.** No h-scroll at 375 or 1440; nav collapses to hamburger; body ≥16px; buttons ≥44px. (One caveat: floating coach pill overlaps the "Ask the coach" button + lyrics panel on mobile, and the coach panel doesn't go full-screen at ≤640px as its own CSS intends — layout defects, not a reflow failure.)
- §2 Auth-page pattern — ✅ **pass.** Login has "Forgot password?", a "Show password" eye toggle, and "Email me a sign-in link" (magic link), plus "Create an account." Reset flow looks wired.
- §4 Authed chrome + Settings — 🟡 **partial.** Persistent nav present on every page; Settings reachable in one click with explanatory header + a working "Reset my voice profile"; Sign in/out present. BUT Profile / Password / Notifications are "sign in to manage" stubs (not yet wired) — could not verify them as a logged-out trial user.
- §5 Explanatory header — ✅ **pass.** Every surface (landing, studio, each step, settings, terms, login) opens with what-it-is / what-to-do / why-it-matters. Empty/initial states keep it.
- §6 Voice agent — ❌ **fail.** A coach launcher ("Ask about this" / "Ask the coach", close btn labelled "Close voice assistant") renders and is reachable in ≤3 clicks from the chrome — BUT clicking it opens only a **text fallback** (no mic/voice widget, no `<elevenlabs-convai>`), and sending a text question returns NOTHING + a `net::ERR_CONNECTION_REFUSED` console error. The voice coach — the product's headline differentiator — is non-functional. (Matches the known VoiceWidget render gap.)
- §7 Scaffold metadata — ✅ **pass.** Tab titles are real product names ("Sing — Singify", "Settings — Singify", "Terms & copyright — Singify", "Singify — sing better between lessons"); none read "Create Next App"/"Next.js"/empty. A `<link rel=icon href=/favicon.ico>` is set (not the default feather). Minor: login page reuses the generic landing title.
- §9 Codicils (observable) — 🟡 **partial.** Content/IP: ✅ /terms page is thorough (own-performance vs backing, personal-use-only, takedown, 7-day expiry). Consequence clarity / next-action-obvious: mostly good (steps tick ✓, mic-permission recovery copy is clear) — BUT the **coach is a dead end** (Send → silent error) and **Start baseline gives no immediate visual feedback**, both of which violate "every screen makes the next action obvious / zero dead ends." Could not reach a save/share consequence gate to confirm the acceptance prompt fires.

---

### Top 3 things to fix before I'd recommend this to a friend
1. **The `/sing` page crashing on cold load** — this is the marketed entry point; two crashes and a real user is gone.
2. **The voice coach** — it's the whole pitch and it's dead (no voice widget + text Send errors with connection-refused). Without it this is "just another karaoke app," which the landing page itself promises it isn't.
3. **Coach panel mobile layout + the floating pill overlapping buttons** — make the panel a proper full-screen sheet and stop the pill covering the "Ask the coach" button.

Would I come back? If you fix the crash and make the coach actually talk to me — yes, the search + safe-karaoke flag + scrolling-lyrics stage genuinely got me. As it is today — I'd bounce after the second crash.

Tim
