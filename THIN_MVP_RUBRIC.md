# THIN MVP RUBRIC — the "I want that" test

> Canonical rule for deciding **what goes in a thin validation MVP** and **how to stage
> a new product's build**. Companion to `BUSINESS_MODEL.md` (§4 build-to-validate, §7
> lane-1 product shape). Auth-pattern severity: getting the slice wrong returns a **false
> NO-GO** and kills a good product, or over-builds before validation and burns the operator
> hours the factory runs on. Imported into the global `CLAUDE.md`.
>
> **Last updated:** 2026-05-24.

---

## 0. The bar is the reaction, not the size

A thin MVP's literal job in the pipeline (`BUSINESS_MODEL.md` §4, **Gate 1**): the link is
embedded in the kick-off outreach to the validation audience — the distributor stream and
the end-user stream. So the bar was never *"does it run."* It is:

> A **distributor** watches a 2-minute demo and thinks *"I'd give this to my clients."*
> An **end user** thinks *"I want to make one of these right now."*

That reaction **is the validation signal.** A slice that can't produce it returns a false
NO-GO — you'd kill a good product because you showed a dead version of it. That is the
expensive failure. Over-building is the *other* failure (it burns operator hours pre-GO).
This rubric sits between them.

## 1. Two independent axes (the core idea)

The single most common mistake is collapsing two different axes into one — letting
*"thin / cheap"* slide into *"minimal / fewer features."* They are orthogonal:

| Axis | What it is | Where the thin MVP sits |
|---|---|---|
| **Experience** | what a viewer *feels* — the product's promise | **MAX — the whole promise** |
| **Scale / ops infrastructure** | only matters once there are *many real users or money* | **ZERO** |

- **Too thin** = cutting **experience**. → false NO-GO. The expensive failure.
- **Too much** = adding **scale infrastructure** before the GO — multi-tenant, auth/ToS,
  billing/metering, dashboards, white-label, sharing/storage infra, search backends, etc.
- **Just right** = **the full experience, single-user / founder-hardcoded / faked** wherever
  the infrastructure would only matter at scale. Not minimalist — the complete product
  minus only the plumbing that does nothing for a viewer in a demo.

This reconciles with build-to-validate: the *"cheapest demonstrable artifact"* means cheap
on the **infrastructure** axis (no platform, no domain, single-tenant) — **never** cheap on
the experience axis.

## 2. The one discriminator question

For any feature, ask:

> **"Does its absence change what a viewer feels in a 3-minute demo?"**
> Yes → **in**. No → **out**.

## 3. Three refinements that catch the common errors

1. **The quality bar lives inside the attributes that are in.** An attribute that is
   *present but weak* fails the test as surely as a missing one. (Singify's polish "worked"
   but sounded *subtle* — a subtle transformation produces no "I want that.") "Just right"
   includes the quality bar on each in-scope attribute, not just a checklist of boxes.
2. **The floor is what a prototype already proved.** Never ship a slice *below* what a quick
   build already demonstrated. If a day's prototype did the full loop, the slice inherits
   that loop — it does not re-derive a smaller version. Regressing the experience to "ship
   something" is the same false economy as cutting it in the first place.
3. **Portfolio DNA is experience, not infrastructure — it is always IN.** The baseline
   product elements every project ships by CLAUDE.md / cais rule — a **persistent nav
   chrome + Settings page**, the **chrome-level voice agent** (the in-context guide/clarifier,
   per the VOICE AI rule), a **landing page that sells the concept**, **responsive** layout,
   **explanatory headers**, and the **auth-page pattern** where there's auth — are what a
   viewer *feels*, so they belong in even the thinnest slice. "Zero scale-infrastructure"
   means no multi-tenant / billing / dashboards / auth-backend; it does **not** mean a dull,
   navigation-less, voice-less, un-sold shell. A singing app that looks like a tax form has
   cut experience, not infrastructure. Stripping DNA "to save a few minutes of dev time" is
   the same false economy as cutting a headline feature (locked after the Singify slice
   shipped dull on 2026-05-25).

## 4. How to apply it

### A. Judging an existing repo's slice ("is this a real thin MVP?")
Walk every attribute through the discriminator (§2). Flag each **experience** cut as
*too thin* (fix before showing); flag each **scale-infrastructure** inclusion as *too much*
(defer to post-GO). Check the §3 refinements: are in-scope attributes at demo-quality, and
is the slice at least at the prototype floor?

### B. Planning build stages for a NEW repo
- **Stage 0 — name the promise.** State the product as its verbs + adjective (what it *is*).
  Every Stage-1 attribute must be load-bearing for that sentence.
- **Stage 1 — the thin MVP (pre-GO).** Full **experience**, **zero** scale infrastructure:
  single-user, founder-hardcoded, faked-where-only-scale-cares, Vercel-default URL, no
  domain. This is the artifact whose link is embedded in validation outreach (Gate 1).
- **Gate 2 — the validated GO** (distributor + end-user demand). **Only then** build the
  Tier-1 scale layer (multi-tenant, auth, billing, dashboards, white-label) per
  `BUSINESS_MODEL.md` §7, and buy the domain (domain spend is Gate-2-gated).

## 5. Worked example — Singify (canonical reference)

**Promise:** *karaoke* (sing along to a real song, see yourself) + *polish* (hear yourself
transformed) + *coach — that knows your voice*.

| In the thin slice (experience) | Out until the GO (scale infra) |
|---|---|
| In-browser **video** recording | Multi-tenant / distributor→end-user tenancy |
| **Sing along** to a real backing in headphones | Auth / ToS / accounts |
| **Voice-agent coach** (not text tips) | Teacher dashboard, invites, white-label |
| **Vocal baseline** ("knows your voice") + auto-transpose | Stripe / per-seat metering |
| **Dramatic** polish (quality bar, not subtle) | Signed-URL sharing backend, search backends |

Drop any left-column item and the viewer sees a lesser, different product (too thin). Add
any right-column item pre-GO and you've spent operator hours on plumbing that changes
nothing a viewer feels (too much).

---

**Summary in one line:** *the thin MVP is the smallest build that makes the validation
audience feel the whole promise — full experience, zero scale-infrastructure.*
