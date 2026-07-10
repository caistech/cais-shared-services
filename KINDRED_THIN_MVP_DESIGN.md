# KINDRED — thin-MVP design doc + build spec

> **Working name:** KINDRED (a co-writer who *gets* you). Alt: GHOSTWRITER (the invisible co-writer
> who writes in your voice and disappears — the SAAF "I am not the light" posture as a brand).
> Provisional; not gated on it.
>
> **What it is:** capture an artist's WORLDVIEW so deeply that generated songs make them say *"how did
> you KNOW that about us"* — then hand them songs they'd actually release. Built on the
> `WORLDVIEW_CAPTURE_SPEC.md` method in this repo.
>
> **Source:** `/office-hours` session 2026-07-10 (Startup mode, pre-product). Method spec:
> `WORLDVIEW_CAPTURE_SPEC.md`. Model-tiering rationale: `LINKEDIN_FABLE5_ENCODE_ONCE_POST.md` /
> encode-once. **Status: DONE — approved to build.**

---

## 1. The bet (why we're building before we have demand evidence)

Standard demand-first sequencing is overridden here on purpose, and correctly, per BUSINESS_MODEL §4
build-to-validate: the cheapest demonstrable artifact is genuinely cheap (AI does the work, token
burn negligible), the build itself sharpens the offer, and the upside is asymmetric (one hit flips
the ROI). So we build the full *experience* and put it in front of real artists.

**The one law that makes this a test and not self-flattery — the hit is BEHAVIORAL, defined before
we build.** "That's cool" is worthless. The hit is this chain:

> artist brings **their own act** → the capture makes them say **"how did you know that about us"** →
> they finish a generated song into something they'd **release under their name** → and they do **the
> tell: release it · come back for a second · refer another artist unprompted.**

Decided in advance: **the ghost = a NO**, no matter how hard they gushed. **1 of 3 test artists doing
the tell = the hit.**

---

## 2. Premises (confirmed in office-hours)

1. Worldview extraction is the moat; song generation is commoditised. **Agreed.**
2. The un-scrapable layer (the §4 interview gap) is what turns "impressively close" into "how did you
   know" — so the **voice interview is the core feature, not a nicety.** **Agreed.**
3. Lane A (be the label / own catalogues) is a trap *for Dennis specifically* — a catalogue lottery
   that eats scarce operator hours and isn't the recurring-revenue factory. **Test Lane B shape
   (artists as the validation audience); who ultimately pays is a Gate-2 question.** **Agreed.**
4. The reaction IS the validation signal (THIN_MVP "I want that", here "you get us"). **Agreed.**

## 3. Approach chosen (vs the alternatives we killed)

- **A — Interview-first, build-later (evidence before build).** Killed: the build is cheap and
  sharpens the offer; talking about it convinces no artist. Build-to-validate wins.
- **B — Be the label (Lane A): release our own AI-assisted tracks, chase streams.** Killed: wrong
  lane for Dennis (see premise 3).
- **C — ✅ Build the full-experience thin slice, run the capture→generate loop on 3 real artists,
  measure the behavioral hit.** Chosen. Cheap, asymmetric, honest, kills-or-proves in a week.

---

## 4. Scope — THIN_MVP_RUBRIC applied (experience MAX, scale-infra ZERO)

**IN (the whole experience — cutting any of these returns a false NO-GO):**
- Landing page that *sells* the concept (a real artist decides in 30s this is worth 20 minutes).
- The **worldview voice interview** (the moat, the "how did you know" moment) — proactive, adaptive,
  references what we already scraped about them.
- The **DNA reveal** — their worldview shown back to them ("here's what we heard"), which is itself a
  "you get us" jolt before they even hear a song.
- **2–3 complete songs in their voice** — full lyrics + structure + logline, at demo quality (the
  Fable bar from the SAAF proof, not competent-stranger output).
- Responsive, explanatory headers, a clear "start here" — the portfolio experience DNA.

**OUT until Gate 2 (scale infra — adding it now is the P4 over-build flag):**
- Multi-tenant, artist self-serve accounts, billing/metering, dashboards, white-label, a
  sharing/library backend, team admin. **Founder-operated, one artist at a time, hardcoded.**

**The one live scope decision — audio:**
- **Floor (ship this):** DNA + full lyrics + the interview. For an *artist* audience this can hit
  "you get us" on its own, because lyrics are the songwriter's native medium and the DNA reveal does
  heavy lifting.
- **Ceiling (recommended if trivial):** a produced demo via a music-gen API (Suno/Udio-class) so the
  song can be *heard* in their style — makes the hit undeniable. Wire it only if it stays a cheap
  API call; do **not** build an audio pipeline. **Recommendation: ship the floor to artist #1, add
  the demo if the lyric-only reveal underwhelms.**

---

## 5. Screens (UX flow)

**Artist-facing (the experience):**
1. **Landing / "Start your session"** — sells the promise ("a co-writer that learns your world, then
   writes like it's from inside your band"), one CTA. Explanatory header. Responsive.
2. **The interview** — a voice call with KINDRED (the co-writer persona). Reached by a link the
   operator sends. Proactive greeting that *already knows them* ("I've been listening to your stuff —
   can I check I've got you right?"). ~15–20 min, capped with a spoken wrap-up warning.
3. **The reveal** — after synthesis: (a) **"Here's your world"** — the Artist DNA shown back
   (thesis, the wound, the two modes, what you'd never say); (b) **the songs** — 2–3 tracks, lyrics
   (+ optional audio), each with its logline. This is the "how did you know" screen.
4. **"What now?"** — the behavioral capture: *Take a song and finish it · Want another · Not for us.*
   This is the instrumented hit signal (release/return/refer vs ghost).

**Operator console (Dennis, hardcoded / behind a simple gate):**
1. **Add artist** — name + paste their words (song lyrics, interviews, socials, About text, links).
2. **Extract DNA** — trigger Fable step 2; review the draft 7-layer DNA + the `still_unknown` gaps.
3. **Launch interview** — generates the artist's session link; the agent is primed with the DNA +
   the gap questions.
4. **Synthesise + generate** — Fable merges interview into full DNA; cheap model writes the songs
   against layers 3–7 with a deliberate Layer-7 refusal.
5. **Track response** — log the behavioral outcome per artist (ghost / finished / released / referred).

---

## 6. The interview flow (the moat) — wired to `@caistech/elevenlabs-convai`

This is the defensible step. It runs the §4 gap questions the scrape can't answer, adaptively.

- **Stack:** `@caistech/elevenlabs-convai` (agent provisioning, webhook routes, the React
  `VoiceWidget` from `/react`) — never a parallel voice client. BYOK on the artist/operator
  ElevenLabs key. Persona/opening/signature per the VOICE AI standard. `DEFAULT_AGENT_LLM`
  (gpt-4.1-mini) drives the live call.
- **Primed with the scraped DNA (pull, not push):** per `VOICE_MEMORY_STANDARD`, the agent PULLS the
  artist's DNA at connect and references specifics ("your last EP kept circling exile — is that
  autobiographical or a lens?"). The per-session override carries only the *just-happened trigger*,
  never the values. Referencing what we already know IS a "you get us" moment inside the interview.
- **The gap-question arc (the 6 items only their voice reveals — WORLDVIEW_CAPTURE_SPEC §4):**
  1. the **wound's referent** — literal / witnessed / symbol?
  2. which **tonal mode is home**?
  3. the **origin of their conviction** (earned vs inherited)?
  4. **internal canon rules** (for worldbuilders)?
  5. the **shadow side** of their stated virtue (virtue or scar)?
  6. the **wrong compliment** that proves someone missed the point.
- **Memory loop (full, per VOICE_MEMORY_STANDARD):** recall (pull DNA) → converse → post-call
  webhook distils the interview into `DNA.from_interview` + updates `still_unknown` → persisted to
  the product's own Supabase (RLS, delete-cascade, TTL). HMAC-verified webhook. Identity
  server-derived at connect (`conversation_id`). Degrade-don't-fake on recall failure.
- **Length cap + spoken wrap-up warning** (browser timer from `onConnect` → tool-return nudge +
  visual banner), per the standard. `persistSession` still fires on hard cut.

---

## 7. The capture pipeline (the WORLDVIEW_CAPTURE_SPEC method, as a product)

```
 [1] SCRAPE words   operator pastes lyrics/interviews/socials/About  → cheap
 [2] EXTRACT DNA    Fable (claude-fable-5) → 7-layer Artist DNA        → frontier, once/artist
 [3] INTERVIEW      @caistech/elevenlabs-convai runs the gap questions → the MOAT
 [4] SYNTHESISE     Fable merges scrape + interview → full DNA          → frontier
 [5] GENERATE       cheap model writes 2-3 songs vs layers 3-7          → cheap, forever
 [6] REVEAL + TEST  DNA + songs shown back; behavioral response logged  → the Gate
```

- **Frontier steps (2, 4):** `claude-fable-5` via `@caistech/ai-client` / Anthropic SDK — the taste
  engine, paid once per artist (encode-once).
- **Cheap step (5):** Sonnet/Haiku via `@caistech/openrouter-client` (auto-meters usage) — volume.
- **DNA schema:** exactly `WORLDVIEW_CAPTURE_SPEC §3` (thesis, worldview, wound, moral_center,
  listener_pact, motifs, tonal_modes, diction_rules, negative_space, posture_move, provenance).
  `provenance.still_unknown` prevents false confidence at Layer 4.

---

## 8. Tech + standards

- **App:** Next.js App Router on Vercel. `@caistech/*` first (voice, ai-client, openrouter-client,
  usage-meter, corporate-components). Metadata customised (no "Create Next App"); favicon set.
- **Data:** Supabase — `artists`, `artist_dna`, `interviews`, `songs`, `responses`. RLS on every
  table even single-operator (SUPABASE rule). Migrations via CLI, idempotent. Store DISTILLED DNA,
  never raw PII beyond what's needed (DATA_STANDARD I4/S4). The DNA is interpretive memory (Mnemo-
  shaped), the artist's stated facts are structured — right store per piece.
- **Thin-MVP standards that still apply (PRODUCT_STANDARDS §0 gate):** responsive (375 + 1440),
  explanatory headers, voice agent reachable (it's the core), landing sells, real `<title>`. Auth /
  team-admin / full Settings **deferred** (single-operator internal-tool trigger — record the
  deferral in the manifest, not a permanent skip).
- **IP / content:** a `/terms` + acknowledgment gate (Singify precedent) — own-performance vs
  AI-assisted material, and the artist's ownership of what they finish. Human-authorship is the
  copyright spine (the SAAF legal model); the artist finishing the song secures *their* authorship.

## 9. Risks (name them, don't bury them)

- **The ghost-response trap** — measuring applause. Mitigated by the §1 behavioral hit, decided up front.
- **AI-authorship copyright** — purely-AI lyrics may not be ownable (US/AU need a human author). The
  product is framed as *co-writing*: the artist finishes and owns; KINDRED drafts. This is the moat
  AND the legal defense — don't erode it by shipping "one-click finished songs."
- **Platform / audience scrutiny of AI music** — disclosure norms are moving; the human-authorship
  spine is the defense. Lean into "your voice, your worldview, you finish it," not "AI made this."
- **Lyric-only underwhelm** — if artist #1's reveal doesn't jolt on lyrics alone, add the music-gen
  demo (§4 ceiling) before judging the concept a failure.
- **Reachability** — the plan stalls if the 3 artists can't be reached. This is the real bottleneck,
  not the build (see assignment).

---

## 10. The assignment (the session's output — do this)

1. **Name 3 real, reachable artists** — small acts with a clear worldview and an inbox you can
   actually reach. Edge is good; reachability is the hard constraint. (This is the gating step — the
   build is easy, the "yes" is what's scarce.)
2. **Build the full-experience thin slice** from §5–8 (floor scope; audio only if lyric-only
   underwhelms).
3. **Run the capture → interview → generate loop** on all 3.
4. **Score the behavioral chain (§1).** 1 of 3 doing the tell (release / return / refer) = the hit →
   Gate 2 (who pays: a label, a distribution platform, a co-write community above the artists).
   0 of 3 = a clean, cheap NO in a week.

---

**One line:** *build the full worldview-capture experience — scrape → Fable-DNA → the voice
interview that fills the un-scrapable gap → songs in their voice — put it in front of 3 reachable
artists, and let one of them releasing/returning/referring be the whole verdict.*
