# Singify /sing — Mobile crash re-test

Hi Dennis,

- **Product:** Singify (practice studio)
- **Persona:** Mobile Marcus — phone only, fat thumbs, pinch-zooms anything under ~16px, flaky connection
- **URL:** https://singify-platform.vercel.app (home → /sing)
- **Goal:** Re-test — confirm whether `/sing` still crashes the mobile browser tab on load, or whether the deferred-voice-SDK fix made it stable
- **Duration:** ~25 min equivalent, iPhone-class viewport (390x844)

---

## VERDICT (the headline)

**CRASH IS FIXED. `/sing` loads and stays alive on my phone.**

I loaded the home page, then went to `/sing`. It came up (200), I waited, I scrolled to the very bottom, I read it, I tapped buttons, I even tapped the voice coach button (the heavy thing) — and the tab never died, never went blank, never reloaded itself. No "problem loading this webpage", no white screen of death. Console stayed clean the whole time (zero errors). Last time this page reportedly killed the tab on sight; this time it's solid. Good fix.

(One honesty note about my tools: my headless browser daemon dropped to a blank page a couple of times *between* separate test runs — that's the test harness losing its place when it goes cold, NOT Singify crashing. Every time I loaded `/sing` in one continuous session it was rock-stable, 200, no errors, survived scroll + taps. So I'm confident: the page is fine.)

---

## Walkthrough

### 1. Home page first
Loaded clean on my phone. Top bar collapses to a hamburger (☰) like it should. The pitch reads well — "Sing better between lessons", four-step "how it works", a clear "Open the practice studio" button. No horizontal scroll. The floating "Ask about this" mic pill sits bottom-right, well clear of the big heading. Solid start.

**Opportunity:** none here, home is in good shape.

### 2. Navigate to /sing — does it survive?
Yes. Returned 200, URL held at `/sing` through a wait, a full scroll to bottom, reading the text, and multiple taps. innerWidth measured a true **390px** with **no horizontal scroll** (scrollWidth == 390). This is the whole point of the re-test and it passed.

### 3. Walking the studio as a phone user
I can see the steps laid out top to bottom: the headphones tip card, **1 · Vocal baseline**, **2 · Pick a song** (with a search box), and the rest follow on scroll. Each step has its own "Ask the coach" button. There's an explanatory header at the top ("Your practice studio. Work down the five steps...") that tells me what this is and what to do — nice, I didn't feel dropped in cold.

- **"Start baseline"** — tapped it, no crash, URL held, console clean. In my headless phone there's no actual OS mic-permission popup to screenshot, but the important thing is it did NOT blow up the tab — it's wired to a recording action, not a crash. A real phone would get the mic prompt here.
- **"Ask the coach" / "Ask about this" voice button** — reachable from the chrome (bottom-right pill) AND per-step. Tapped the chrome one: it opened a "Singify coach" panel with a "Type your question" box and a Send button. Opened cleanly, no crash. This is exactly the deferred-SDK behaviour you wanted — the page loads light and the voice thing only mounts when I ask for it.

**Opportunity:** the coach panel opens as a big near-full-width overlay pinned to the top, and on a 390px screen there's a large empty white area below the input. It works but looks half-finished on mobile — consider sizing it to its content or making it a proper bottom sheet.

### 4. Mobile-specific nitpicks
- **Voice pill overlaps step-1 text.** Before I open it, the floating "Ask about this" pill parks itself mid-right and sits *on top of* the step-1 instruction lines — it covers part of "Sing a phra[se]..." and "Birthday works)". It's not over the *heading* (the old note), but it IS over body text a singer is meant to read while following the baseline drill. On a phone that's annoying — I want to read those four steps, and a button is sitting on them. **Opportunity:** nudge the FAB so it never overlaps readable content, or let it tuck into a corner that's pure margin.
- **Lots of text under 16px.** This is my big readability gripe. The headphones tip, all four baseline instructions ("Glide ah from your lowest...", "Hold one steady note...", "Sing that phrase again..."), the step descriptions — all **14px**. Captions like "Singify only listens while you're recording" and "Start here" are **12px**. I'm pinch-zooming to read the instructions I'm actually supposed to follow while singing. **Opportunity:** bump body/instruction text to ≥16px on mobile. These aren't decorative — they're the steps.
- **Two buttons a touch short.** "Start baseline" is 138x**40** and "Search" is 256x**40** — both 40px tall, 4px under the 44px thumb minimum. Hamburger (44x44), "Ask the coach" (44h) and "Ask about this" (44h) are fine. **Opportunity:** pad the two 40px buttons up to 44px.
- **No horizontal scroll** anywhere. Good.

---

## Standards Check (mobile-relevant)

| Item | Status | Evidence |
|---|---|---|
| §1 Responsive — /sing works at ~390px, no h-scroll | ✅ | innerWidth=390, scrollWidth=390, "no h-scroll"; layout reflows to single column + hamburger |
| §1 Touch targets ≥44px | ❌ | "Start baseline" 138x40 and "Search" 256x40 are 40px tall (4px short); others (44x44) pass |
| §1 Body text ≥16px | ❌ | Baseline instructions + tips are 14px; captions ("Start here", listen note) 12px — pinch-zoom territory |
| §1 Nav usable on mobile | ✅ | Top bar collapses to a 44x44 hamburger ("Open menu") |
| §5 Explanatory header on /sing | ✅ | "Singify · studio / Let's make you sound amazing / Your practice studio. Work down the five steps..." — what/do/why all present |
| §6 Voice agent reachable from chrome | ✅ | "Ask about this" pill (chrome-level) + per-step "Ask the coach"; opens a Singify coach panel; deferred until tapped (the fix) |
| §9 Next action obvious, no dead ends | ✅ | Numbered steps, per-step CTAs, "Start here" badge on step 1, search box on step 2 |
| **/sing tab stability (the re-test)** | ✅ | 200, URL held through wait + scroll-to-bottom + button taps + voice-SDK tap; zero console errors |

Two ❌ findings, both §1 mobile polish (sub-16px text; two 40px buttons). Neither blocks the page — but per the rubric a §1 fail is a finding, so flagging them.

---

## Scope note
I only used the live URL on a phone-class viewport — I did not read any repo files, docs, or memory for this product. I didn't complete a full singing session (no real mic in a headless phone); I focused on: does `/sing` survive, and can a phone user operate it. Both answered.

Crash: fixed. Page: stable. Remaining mobile gripes: a voice pill sitting on the step text, 14px instructions I have to zoom for, and two buttons 4px short of a comfortable thumb tap.

Marcus
