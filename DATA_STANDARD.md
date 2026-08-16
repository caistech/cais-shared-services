# DATA STANDARD — how the portfolio ingests, stores & retrieves data (canonical)

> **What this is.** The single canonical ruleset for **where every piece of data lives, how it
> gets there, and how it comes back** across the portfolio. It answers, once, the question that
> otherwise gets re-litigated per feature: *"a table, a document store, or memory?"* — and the
> ingestion/storage/retrieval rules that follow from that choice.
>
> **Why it exists.** We run one canonical property/planning source, an owned document-RAG, and a
> managed semantic-memory partner (Mnemo). Put data in the wrong one and you either leak
> "approximately right" into REGULATED answers, or you hand-build memory a table can't hold, or you
> fork the canonical feed. This standard makes the right choice mechanical.
>
> **Severity: auth-pattern.** A violation (an authoritative fact served semantically, a forked
> feed, raw PII in external memory, a hardcoded coverage gate) is a **bug, not a style nit.**
>
> **Home & loading.** Lives in `cais-shared-services` so it's portable + teammate/cloud-readable;
> **auto-imported into the global `CLAUDE.md`** so every agent in every repo starts knowing it.
> It is the **parent** the scattered rails hang off (see §7).
>
> **Last updated:** 2026-07-10.

---

## 0. The decider (read this first; it is the whole standard in one question)

> **"What is the cost of being *approximately* right?"**

That single question sorts every piece of data into one of **three stores**:

| Cost of being ~right | Store | The answer is… | Examples |
|---|---|---|---|
| **Wrong = liability** — no wiggle room | **STRUCTURED (canonical tables / SQL)** | one exact, auditable value | zoning code, permitted uses, min-lot, height, setbacks, BAL, wind, deal-model numbers, lot geometry |
| **Wrong is dangerous, but you *cite the source* so it's checkable** | **OWNED RAG (embeddings + pgvector)** | a passage of authoritative *text*, with provenance | planning-scheme prose, the SA Design Code, legislation — "the cited planning pathway" |
| **~Right is fine, often ideal** | **MNEMO (managed semantic memory)** | related prior experience/analysis, no single right answer | resolved answers, prior fixes, interview responses, conversation context, "what we learned last time" |

Everything below is the operating detail of this table. **When unsure, the higher-accuracy store
wins: STRUCTURED > RAG > MNEMO. Never downgrade an authoritative fact to a fuzzier store.**

---

## 1. The three stores — when / how / why

**A — STRUCTURED (canonical tables).** The source of truth for exact, authoritative, auditable
facts. In our infra (Supabase), RLS-on, provenanced. For AU property/planning this is
**property-services** (`derive`/`assess`/etc.). *Use when the fact has one canonical value and being
close-but-wrong is unacceptable.* This is where all REGULATED-tier facts live.

**B — OWNED RAG (embeddings + pgvector).** Semantic retrieval over a **fixed authoritative corpus of
text** that is too large/prose-shaped for columns but must be returned **with a citation**. The
reference implementation is the property-services `planning_chunks` KB (Voyage + `match_planning_chunks`
+ the seed/edge ingest pipeline). *Use when the answer lives in an instrument you must quote, not
compute.* **In our infra** — the corpus + embeddings are the moat.

**C — MNEMO (managed semantic memory).** The partner product (`api.mnemohq.com`) for **experiential,
accumulating, interpretive** recall — "what did this scope say/resolve/learn before." Thin API
(`add`/`search`), per-scope isolation, fail-soft. *Use for analysis, conversation, prior resolutions
— never for authoritative facts or citable instruments.* (Free to us under the SayFix+Mnemo
partnership; deploy widely on memory surfaces — see §6.)

---

## 2. The ruleset

### Choosing the store — the D-rules (the decision)
- **D1 — No wiggle room → STRUCTURED.** An exact, canonical, auditable fact lives in a table.
  **All REGULATED-tier facts live here and ONLY here.** A REGULATED fact served from RAG or Mnemo
  is a critical defect.
- **D2 — Authoritative prose you must cite → OWNED RAG.** Not a table (can't structure it), not
  Mnemo (can't provenance it).
- **D3 — Interpretive / accumulating / conversational → MNEMO.** Never a table (no schema for
  evolving free-form memory), never faked into RAG.
- **D4 — Ties break UP.** Unsure between two stores → pick the higher-accuracy one
  (STRUCTURED > RAG > MNEMO). Never route an authoritative value through a fuzzier store to save work.

### Ingestion — the I-rules
- **I1 — One canonical source per domain; no forks.** All AU property/planning data enters via
  **property-services**; no vendored SDK, no local `*-derive`, no second copy. Enforced by
  `check-canonical-property-feed.mjs` (opt out only with a reviewed `// @canonical-feed-ok:`).
- **I2 — One ingest toolchain per store; don't hand-roll.** Reuse the shared pipeline
  (`@caistech/document-ingest` for approval/plan extraction; the `planning-kb` seed/edge for the
  RAG corpus; Mnemo's `add`). A second bespoke ingester is drift.
- **I3 — Every ingested item carries provenance.** Source URL/instrument, `version_date`,
  jurisdiction/scope, attribution. A RAG chunk without a `document_id` + source is a bug.
- **I4 — Mnemo ingests DISTILLED results, never raw artifacts or PII.** Store the *conclusion*
  ("HN subdivisions ≥1000m² clear the 950 band"), not the transcript/PDF/PII. Inherits the
  `VOICE_MEMORY_STANDARD` "works off results, not raw artifacts" rule.
- **I5 — Ingestion is idempotent + resumable.** Skip already-ingested; resume partial. Large docs
  over the edge cap (6 MB) seed via the resumable local script, not the scheduled refresh.

### Storage — the S-rules
- **S1 — Own the substrate for authoritative data + document RAG.** Structured facts and the RAG
  corpus/embeddings live in **our** Supabase (the moat). Managed externals (Mnemo) hold **only
  distilled experiential memory**, never the canonical facts or the citable corpus.
- **S2 — Isolation is mandatory.** RLS on every table; RAG scoped by jurisdiction/state; Mnemo
  scoped by a **stable id** (a row UUID, never a mutable `owner/repo` string that collides across
  tenants). One scope's data can never surface for another.
- **S3 — Freshness + provenance.** Carry `version_date`; set TTL where data goes stale; mark
  snapshots stale rather than silently recompute. No orphan chunks/memories.
- **S4 — REGULATED / PII discipline.** Exact facts stay in auditable tables. Anything that leaves
  our infra (Mnemo) is **distilled + consent-covered**; raw PII never leaves. REGULATED-tier
  products (F2K-Checkpoint, NDIS-SDA, R&D-Tax, disaster-support) get the strictest read of S1/S4.

### Retrieval — the R-rules
- **R1 — Match the store to the stakes (the decider).** Retrieving an authoritative fact
  semantically is a defect, not a convenience.
- **R2 — Compose; right source per piece.** One answer pulls facts from tables, citable text from
  RAG, and prior analysis from Mnemo — the LLM *synthesises*. It is never "one store per query."
- **R3 — Consumers draw from the canonical cohort; never hardcode coverage or values.** Trust the
  state/scope-aware source. Hardcoding (`state === "WA"`) or re-deriving a value locally is the
  anti-pattern — if the canonical source has it, the consumer gets it.
- **R4 — Degrade, don't fake.** If a store has nothing for the query, say so honestly ("not yet
  covered") — never fabricate a fact, cite an inapplicable instrument, or return a stale default.
- **R5 — RAG claims are cited.** Every finding grounded in the document corpus carries its source
  instrument; an un-provenanced "finding" is a bug.

---

## 3. Anti-patterns (the failure modes this standard exists to stop)
- **"Just put it all in one vector store / in Mnemo."** Routes authoritative facts through a fuzzy
  layer → "approximately right" leaks into REGULATED answers. (Violates D1/R1.)
- **Table-ing free-form memory.** No schema survives evolving conversational/analytical memory.
  (Violates D3.)
- **Forking the canonical feed** — a vendored SDK, a local `*-derive`, a second property source.
  (Violates I1.)
- **Hardcoding coverage** — a consumer deciding "the KB is WA-only" instead of asking the
  state-aware source. (The real 2026-07 Checkpoint bug; violates R3.)
- **Faking depth** — showing findings from an inapplicable jurisdiction rather than an honest
  "not available." (Violates R4.)
- **Raw PII into external memory.** (Violates I4/S4.)

---

## 4. Worked example — 22 Milton Avenue, Port Lincoln (the canonical reference)

One New-Project screen, all three stores, each doing its job:

- **"Zone HN · permitted uses · min-lot 700 · height 9m/2 storeys"** → **STRUCTURED** (property-services
  `derive` provisions). Exact, REGULATED, auditable. *(D1.)*
- **"The cited planning pathway — what the Planning & Design Code says about hills-zone subdivision"**
  → **OWNED RAG** (`planning_chunks`, the SA Code we ingested). Authoritative prose, cited, in our
  infra. Not a table, not Mnemo. *(D2/R5.)*
- **"What we learned on the last three Port Lincoln subdivisions / this operator's prior deals"** →
  **MNEMO** (once wired). Interpretive, accumulating, ~right is ideal. *(D3.)*

The three splits are exactly the trap the standard prevents: the first must never be RAG'd, the
second must never be a table or Mnemo, the third must never be a table.

---

## 5. Enforcement
- **Guardable (mechanical):** I1 (canonical feed → `check-canonical-property-feed.mjs`, run by
  preflight). I3 (a chunk-without-source check). R3 (a lint for hardcoded state/coverage gates on
  the planning surfaces). Add these to `feature-preflight.mjs` over time.
- **Review-only (judgment):** D1–D4 store choice, I4/S4 PII distillation, R2 composition, R4
  degrade-don't-fake — checked at design review + the naive-tester/PR passes.
- **The `/naive-tester` + PR review** close with a **Data Standard check** (which store did each
  new data surface use, and is it the right one?).

---

## 6. Mnemo deployment posture (partner product — deploy on memory surfaces)
Under the SayFix+Mnemo partnership Mnemo is **free to us and a shared-revenue product we co-build**,
so on the **experiential-memory surfaces** the bias is *aggressive* deployment (it also dogfoods the
product at portfolio scale — every wired repo is a live proof-point). Ranked targets vs today:
1. **Bug-knowledge protocol** (biggest daily win) — replace the flat `bug-knowledge.json` grep with
   semantic cross-product recall of prior fixes. First deployment beyond SayFix.
2. **Voice-agent memory** (`VOICE_MEMORY_STANDARD`) — Mnemo as the managed backend, collapsing the
   per-product hand-built recall→distil→persist loop into one.
3. **Validation/ideation memory** (Connexions interviews, the methodology cockpit) — a new capability.

Bounded only by the store rules: never Mnemo an authoritative fact (D1) or a citable instrument
(D2), and only distilled, non-PII memory leaves our infra (I4/S4).

### ⚠️ 6.2 THERE IS A HARD WRITE QUOTA, AND AS AT 2026-08-16 IT IS FULL

Measured, not inferred — a direct `POST /v1/memories` returns:

```
403  {"message":"Quota exceeded for memory_writes: 1000+1/1000. Upgrade plan."}
```

**Not an expired key and not a rate limit.** The token authenticates fine and **reads still work** —
`bug-memory.mjs recall` returns real prior fixes. It is `memory_writes` specifically that is
exhausted, so the recall half of §6.1 is intact and the *record* half has been failing.

**Every client fails soft** (`@caistech/mnemo` swallows errors by contract, and rightly — memory is
an enhancement and an outage must never break the call path, R4). The consequence is that **writes
have been silently going nowhere for an unknown period**, and the Bug Knowledge Protocol's "record in
all three" has quietly been recording in two. Nothing announced it. `bug-knowledge.json` is
unaffected and remains the durable source of truth, which is exactly why §6.1 keeps it.

**Where the 1000 went — Kira, measured 2026-08-16.** Kira writes one Mnemo memory per successful
`save_memory` (`lib/kira/uid-tools.ts`), so `kira_memory` rows are a near-exact proxy:

| | writes | share of the cap |
|---|---|---|
| Kira total (since its key was set) | 441 | **~44%** |
| — of which **synthetic / test accounts** | 260 | **~26%** |
| — of which real accounts | 181 | ~18% |

⚠️ **The single biggest consumer of the entire quota is the RED TEAM: 199 writes, ~20% of the cap.**
A full run writes ~14–15 memories, so **each red-team run costs ~1.5% of the lifetime quota** — and
that suite is the one meant to be run repeatedly, because a single green run proves nothing and only
a *rate* does. The most expensive writer is the one whose value depends on repetition.

**What follows for any product wiring Mnemo:**

1. **Budget the writes.** At ~15 per adversarial run, a suite you intend to run to a rate will
   dominate a shared quota within weeks. Point test/synthetic identities at a **separate scope and
   ideally a separate key**, so a testing sweep cannot exhaust production recall.
2. **Fail soft, but say why.** `bug-memory.mjs` printed only *"not remembered (Mnemo unavailable)"*.
   Missing key, expired key, rate limit and exhausted quota have four different fixes, and it took a
   raw `curl` to tell them apart. The response is in hand — surface the status. Same lesson as
   `portfolio-gate`: a check that quietly does nothing is indistinguishable from one that passed.
3. **Read the deployment posture in §6.1 against this.** "Aggressive deployment" was written when the
   partnership implied no practical ceiling. A 1000-write plan cap is a default tier, not that
   arrangement — **raise it with Shah, whose product Mnemo is** (Gareth wrote its rebrand
   questionnaire *for* him; do not confuse the two).
4. **Unknown, and it changes the fix:** whether the cap is lifetime or a monthly window. `1000+1/1000`
   reads as a hard plan cap. Not confirmed.

---

## 7. What this unifies (the parent-doc role)
These existing rails are now **instances** of this standard, not separate one-offs:
- **Canonical property feed** (`check-canonical-property-feed.mjs`, PRODUCT_STANDARDS codicil) → I1/R3.
- **`VOICE_MEMORY_STANDARD.md`** → the Mnemo/experiential-memory rules (I4/S2/S4).
- **`@caistech`-first + `SHARED_SERVICES.md`** → I2 (one toolchain per store).
- **CLAUDE.md Bug Knowledge Protocol** → the §6.1 first Mnemo instance.
- **`THIN_MVP_RUBRIC` / `BUSINESS_MODEL`** → unaffected (product/economics, not data-lifecycle).

When any of those disagree with this doc on a data-lifecycle question, **this doc wins** — re-sync
the instance.
