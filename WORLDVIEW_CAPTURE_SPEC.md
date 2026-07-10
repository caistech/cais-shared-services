# Worldview Capture Spec — the "they so get us" engine (encode-once method)

> **What this is.** The reusable method for capturing an artist's (or any creator's / brand's)
> WORLDVIEW deeply enough that generated work makes them say *"wow — they so get us."* It is the
> product-agnostic spine under the music idea, and it generalises to any voice-capture surface
> (brand canon, an author's voice, a founder's thesis, a distributor's positioning).
>
> **The one-line thesis:** *Song/content generation is commoditised. **Worldview extraction is the
> moat.*** Anyone can copy a creator's surface (genre, imagery, palette). The "they get us" reaction
> comes only from a work that reflects **how they see the world** — and the deepest layer of that
> lives in the creator's own voice, not in anything you can scrape.
>
> **Validated live (2026-07-10)** on *Shunned at a Funeral* (real one-operator AI-assisted band,
> ~114K monthly listeners). Fable extracted the 7-layer worldview from their own words and wrote a
> song that hit their **posture**, not just their palette — and independently proved the moat by
> listing the 6 things scraping *cannot* reveal (§4). This spec encodes that method.
>
> **Last updated:** 2026-07-10.

---

## 0. The bar is the reaction, not the resemblance

The design target is a measurable reaction: the creator hears the work and says **"how did you
*know*?"** — not "nice, that's in my style." That reaction IS the validation signal (same shape as
the THIN_MVP "I want that" test). A work that only resembles the surface gets "…nice try." Engineer
for the reaction; the surface is table stakes.

- **"Impressively close"** = you nailed the surface + inferred the worldview from public material.
- **"How did you know"** = you captured the layers that only the creator's own voice reveals (§4).
The gap between those two phrases is the entire product, and it is defensible.

---

## 1. The 7-layer worldview stack (surface → soul)

A creator operates on a stack. Copiers hit the top; resonance lives at the bottom. **The "they get
us" line starts at Layer 3.** Extract every layer; go deep on 3–7.

| # | Layer | What it captures | Note |
|---|-------|------------------|------|
| 1 | **Sonic / formal surface** | genre, instrumentation, format, production | copyable by anyone — the least of them |
| 2 | **Motif vocabulary** | recurring images, diction, signature devices | a good imitator gets here |
| 3 | **Worldview** | what's broken in the world · who/what is the enemy · what is the hope | ⟵ **resonance starts here** |
| 4 | **The wound** | the ONE emotional truth they circle on every work | what makes them *feel seen* |
| 5 | **Moral center** | what they honor · what they despise · their ethics | what makes them *trust you* |
| 6 | **The listener pact** | who they speak TO · what they want that person to feel/become | what makes them *loyal* |
| 7 | **Negative space** | what they would NEVER say/do — the tells of an insider | proves you're *inside*, not imitating |

**Diagnostic:** a work hitting 3–6 earns "you get us." A work hitting only 1–2 is karaoke. Layer 7
is the fingerprint — the deliberate *refusal* (the line they'd never write) is what proves the work
came from inside their world.

**The jackpot move:** when the work embodies the creator's own *posture* (their Layer-5 ethic
enacted in form, not just stated) — e.g. a message-over-spotlight artist handed a song that sings
its own self-erasure — the creator hears their relationship-to-being-seen sung back. That is the
deepest "they get us" available.

---

## 2. The pipeline (where cheap ends and the moat begins)

```
  [1] SCRAPE their WORDS         → not just their work. Worldview is confessed in interviews,
      (public, cheap)              liner notes, socials, manifestos, stage banter, About pages.
        ↓
  [2] EXTRACT the 7 layers       → frontier model (Fable) mints the "Artist Worldview DNA"
      (frontier model, once)       artifact (§3). Cite which stated words ground each deep layer —
        ↓                          extraction, not projection.
  [3] INTERVIEW to fill the gap  → the MOAT. A voice agent asks the creator the §4 questions that
      (voice agent — DEFENSIBLE)   public words can't answer. Turns "close" into "how did you know."
        ↓
  [4] SYNTHESISE the full DNA    → frontier model merges scraped + interviewed into the complete
      (frontier model)             worldview. This is the durable, reusable asset.
        ↓
  [5] GENERATE                   → cheap model produces work AGAINST layers 3–7 (not 1–2), with a
      (cheap model, forever)       deliberate Layer-7 refusal baked in.
        ↓
  [6] TEST the reaction          → does the creator / a superfan say "you get us"? That's the Gate.
```

**Model tiering (the Encode-Once play):** steps 2 & 4 are frontier-model *judgment* (paid once, per
creator). Step 5 is cheap-model *volume* (variations, batches, forever). Step 3 is the defensible
moat — anyone can scrape, but the creator's own voice can't be scraped.

---

## 3. The output artifact — "Artist Worldview DNA" (encode-once schema)

The reusable object steps 2/4 produce and step 5 consumes:

```json
{
  "creator": "<name/slug>",
  "thesis": "<the one wound/truth they circle — one sentence>",
  "worldview": { "whats_broken": "", "the_enemy": "", "the_hope": "" },
  "wound": "<the recurring emotional truth, with the evidence that reveals it>",
  "moral_center": { "honors": [], "despises": [], "ethic_in_one_line": "" },
  "listener_pact": { "sings_to": "", "wants_them_to_feel": "", "wants_them_to_become": "" },
  "motifs": ["<recurring image/device>", "..."],
  "tonal_modes": [{ "name": "", "when_used": "", "feel": "" }],
  "diction_rules": { "always": [], "never": [] },
  "negative_space": ["<what they'd never say/do — the insider tells>"],
  "posture_move": "<their Layer-5 ethic that can be ENACTED in form — the jackpot>",
  "provenance": { "from_scrape": [], "from_interview": [], "still_unknown": [] }
}
```

`provenance.still_unknown` is load-bearing: it names what even the interview didn't settle, so a
generation is never falsely confident at Layer 4 (a wrong guess at the wound is worse than no guess).

---

## 4. The interview gap — what ONLY the creator's voice reveals (the moat, itemised)

Scraping gets you to a Layer 3–7 draft. These are the things it *cannot* give — they are the
step-3 voice-interview seed questions, and they are why the pipeline needs the creator, not a scraper:

1. **The wound's biographical referent.** Is the central emblem literal autobiography, witnessed, or
   pure symbol? (A wrong guess at Layer 4 lands as *presumptuous*, not resonant.)
2. **Which tonal mode is *home*.** Every multi-mode creator lives in one and visits the others —
   which one changes what "resolution" means to them.
3. **The origin of their conviction.** Convert vs. native; earned vs. inherited — sets the emotional
   *temperature* of every value they hold.
4. **Internal canon rules.** For any worldbuilder, the private continuity/geography/characters a
   generation could violate. Creators feel a canon violation the way theologians feel heresy.
5. **The shadow side of their stated virtue.** Is "X over spotlight" a virtue — or a scar (a fear, a
   past burn)? Determines whether echoing it reads as *their creed* or *their wound*.
6. **The *wrong compliment*.** The surface praise that proves the praiser missed the point. Never
   published; the single fastest calibration signal a capture pipeline can get.

---

## 5. Generalises beyond music

The same stack + pipeline captures any voice: a **brand's** positioning canon (feed every downstream
email/page/post), an **author's** voice, a **founder's** thesis, a **distributor's** house style.
Wherever "make it sound like *us*, not like a competent stranger" is the requirement, this is the
method — and the interview step is always the moat.

---

**One line:** *extract the 7-layer worldview from a creator's own words, fill the un-scrapable gap
with their own voice, encode it once as Artist DNA, and let a cheap model generate against it —
engineered for "how did you know," not "nice, that's my style."*
