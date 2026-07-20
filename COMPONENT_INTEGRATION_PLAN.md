# Component Integration Plan — MMCBuild licensed components → portfolio project flow

> **What this is.** The scope for lifting four proven components out of **mmcbuild-application**
> (under a component licence from MMCBuild) into the `@caistech` shared substrate, and layering
> them into the portfolio's project flow at the points where a real development project first
> needs what each produces. Companion to the (separately-scoped) feasibility→delivery variance
> layer — both terminate in F2K-Checkpoint's delivery/compliance stage.
>
> **Status:** SCOPED, pending `/plan-eng-review` (next session) on the two architecture calls in §6.
> **IP:** gated on the MMCBuild **component-licence deal** (Dennis handling). Nothing here ships
> until that licence covers the novel IP (`plan-3d`, `plan-vision`, the NCC compliance engine).
> **Last updated:** 2026-07-17.

---

## 0. TL;DR

MMCBuild is really an **NCC-compliance portal** with two genuinely reusable, differentiated assets
built on a paying-client engagement: a **plan-vision → 3D pipeline** and an **NCC-compliance
engine**. With a component licence in place, both — plus two small utilities — become `@caistech`
packages and layer into the existing product flow:

- **`plan-3d`** renders 3× (feasibility envelope in DealFindrs → configured proposal in F2K-Projects
  → extracted drawing in Checkpoint), all off one `SpatialLayout` contract.
- **`plan-vision`** turns architectural PDF sets into `SpatialLayout` at Checkpoint's design-intake.
- **`compliance-reconcile`** (deterministic, liftable today) + the full **`compliance-engine`**
  check plans against `PropertyProfile` + NCC, feeding Checkpoint's existing planning-review board
  and 197-task conditions.

Quick-win layer ≈ 1 week; full drawing+compliance stack ≈ 4–5 weeks focused build, dependency-ordered.

---

## 1. The licence framing

MMCBuild is a **paying client**; the app was migrated into MMC's own org/Supabase (two GitHub orgs
exist: `mmcbuildai` and `mmcbuild-ai` — collapse to one canonical remote separately). The clearly-CAS
substrate the app *consumes* (`@caistech/property-services-sdk`, the hand-copied `platform-trust`,
`processing-progress`, `password-input`, `site-intel` which is a thin SDK caller) is CAS's regardless.
The **novel IP** — `plan-3d`, `plan-vision`, the NCC engine — is the subject of the **component
licence**. This plan assumes that licence lets CAS lift these into the shared registry and reuse them
across the portfolio (and offer/license them onward, e.g. into a Structora-style deal).

---

## 2. The project-flow spine — where each component lands

Walked as a real project moves from raw lot to delivered build. Each component lands where the
project **first produces** its input.

| Stage | Product (existing) | Component layered in | Role at this point |
|---|---|---|---|
| **1. Site → buildable envelope** | property-services (substrate) | *(feeds)* authoritative `PropertyProfile` | Anchor — canonical envelope / overlays / BAL / wind / servicing every later check reconciles against. No new component. |
| **2. Feasibility / deal view** | **DealFindrs** | **`plan-3d` (PlanViewer3D)** | Render buildable **massing/yield envelope on the lot** so the yield the deal-model priced is *seen*. Makes the constraints-&-yield buildup tangible. |
| **3. Proposal / configurator** | **F2K-Projects** | **`plan-3d` (PlanViewer3D)** | Render the **configured lot package/home** — the "I want that" demand-validation surface. |
| **4. Design / DA drawing intake** | **F2K-Checkpoint** (complements `preflight`) | **`pdf-vision-prep` → `plan-vision` → `plan-3d`** | Upload architectural PDF set → extract `SpatialLayout` → 3D preview + persist. Entry point turning *drawings* into *geometry* the compliance engine checks. |
| **5. Compliance check** | **F2K-Checkpoint** (its whole premise) | **`compliance-reconcile` (deterministic) → `compliance-engine` (full NCC)** | `SpatialLayout` + `PropertyProfile` → breach + NCC findings → feed the **existing planning-review board** (planner approves/edits) + **generate/pre-complete conditions** in the 197-task workflow. |
| **6. Delivery / execution** | **F2K-Checkpoint** | *(optional)* `build-sequence` / `system-explorer` 3D · **+ variance layer** | Visualise build sequence/systems; and the feasibility→delivery variance loop (separate scope) lives here. |

**The logic:** 3D appears three times (envelope → proposal → drawing), each fed by a different
`SpatialLayout` producer but the *same* viewer. Compliance appears once, at the point drawings
exist, plugging into machinery Checkpoint already has. Nothing is bolted on sideways.

---

## 3. The components (source references in mmcbuild-application)

### A. Plan-vision extractor (the R&D moat)
- `src/lib/build/spatial/extractor.ts` (~643 lines) — the core "vision → spatial" engine (author-flagged: *"This is the core R&D component"*).
- `src/lib/build/spatial/full-house-extractor.ts` (~956), `page-classifier.ts`, `sheet-decomposer.ts`, `floor-page-select.ts`, `vision-call.ts`, `pdf-to-image.ts`.
- Multi-page: classify pages → fan out floor/elevation/section/schedule extractors → merge → backfill walls from room polygons.
- Also a non-vision path: `src/lib/plans/dxf-extractor.ts` (~522) — CAD DXF geometry.

### B. Plan-3D (the cleanest asset)
- `src/lib/build/spatial/types.ts` — the **`SpatialLayout`** interchange schema (`walls[]`, `rooms[]`, `openings[]`, `bounds`, `storeys`, `roof`, `storey_details[]`, `materials`, `confidence`). **The real reusable asset — a library-agnostic building-geometry contract.**
- `src/lib/build/spatial/geometry.ts` (~1083, **pure**, header *"pure geometry — no AI needed"*) — `buildFloorPlan3D(layout, opts)` + `buildSuggestionHighlight()`. Uses `clipper-lib`.
- `src/components/build/plan-viewer-3d.tsx` — `PlanViewer3D({ layout, suggestions?, className?, label? })`. Self-contained: OrbitControls, storey toggle, label toggle, mobile GPU budget. three.js ^0.183 via `@react-three/fiber@9` + `@react-three/drei@10`.
- Siblings on same core: `system-explorer-view.tsx` + `system-renderer.ts` (4 MMC systems), `plan-comparison-3d.tsx`, `build-explorer-3d.tsx`, `build-sequence.tsx`. Exporters: `dae-exporter.ts` (COLLADA), `dxf-exporter.ts`, `ifc-exporter.ts` (Revit).
- **Coupling to sever:** `plan-comparison-3d` imports `overlayStyleForDecision` from `src/lib/build/decision-overlay.ts` (small, app-specific); colours reference `brand-*` Tailwind tokens.

### C. NCC-compliance engine (highest business value)
- Orchestration: `src/lib/inngest/functions/run-compliance-check.ts` (~962). Per-category (14 NCC categories in `src/lib/ai/types.ts`: fire_safety, structural, energy_efficiency, accessibility, waterproofing, ventilation, glazing, termite, bushfire, weatherproofing, health_amenity, safe_movement, ancillary, livable_housing).
- Retrieval (RAG): `src/lib/comply/enhanced-retriever.ts`, `query-expansion.ts`, `retriever.ts` (Postgres RPC `match_documents_hybrid`), `reranker.ts`.
- Analysis: `analyseCompliance()` in `src/lib/ai/claude.ts` → `ComplianceSectionResult = { category, findings[] }`. `ComplianceFinding` (shape at `ai/types.ts:47`): `ncc_section, category, title, description, recommendation, severity ("compliant"|"advisory"|"non_compliant"|"critical"), confidence, ncc_citation, page_references[], responsible_discipline, remediation_action`.
- Cross-validation: `src/lib/ai/validation/cross-validator.ts` + `reconciler.ts` (tier-1 = fire_safety/structural/bushfire).
- Confidence calibration from prior human feedback: `src/lib/ai/feedback/confidence-calibrator.ts`, `prompt-enricher.ts`.
- Optional agentic path (`ENABLE_AGENTIC_COMPLIANCE`): `src/lib/ai/agent/compliance-agent.ts` + tools (`lookup-ncc-clause.ts`, `get-related-findings.ts`, `flag-dependency.ts`, `retrieve-additional-context.ts`).
- **Deterministic sub-piece — liftable today, zero refactor:** `src/lib/comply/property-reconciliation.ts` (`reconcileAuthoritative()`, pure, no I/O) — plan-vs-`PropertyProfile` breach detection (height/storeys/setback/BAL/overlay/terrain/lot), emits findings at `validation_tier: 0`.
- KB ingestion: `src/lib/knowledge/ingestion.ts` — NCC volumes as PDF → chunk → OpenAI embeddings into `document_embeddings` pgvector (SYSTEM org id), `source_type: "ncc_volume"`.

### D. Utilities already author-flagged for `@caistech`
- `src/lib/plans/pdf-vision-prep.ts:17` — *"strong @caistech extraction candidate — every document-vision product hits the same ceiling"* (Anthropic 32MB PDF ceiling via CloudConvert optimise).
- `src/components/shared/processing-progress.tsx:16`, `src/components/ui/password-input.tsx:17`, `src/lib/services/platform-trust-middleware/` — already local mirrors of intended/existing `@caistech` packages (hygiene, not new IP).

### Complementary analysis (context, not new extractions)
- `src/lib/build/property-constraints.ts` — `PropertyProfile` → prompt block (consumes SDK).
- `src/lib/build/suggestion-compliance.ts` — deterministic MMC×NCC advisory (e.g. combustible cladding at BAL-40).
- `src/lib/site-intel/index.ts` — thin SDK `.derive()` caller; **already the right boundary, nothing to extract**.
- Cost engine (`src/lib/ai/agent/cost-estimation-agent.ts`, `quote/mmc-buildup.ts`) — MMC-domain-specific; **not** part of this plan (and not reusable for the variance layer — that's a separate cost-actuals join).

---

## 4. Packaging plan (licensed-extraction → `@caistech`)

| Package | Contents | Detangle work | Effort (focused build-days) |
|---|---|---|---|
| **`@caistech/pdf-vision-prep`** | PDF-for-vision prep (32MB ceiling) | Already pure + author-flagged | **~0.5** |
| **`@caistech/plan-3d`** | `SpatialLayout` schema + `geometry.ts` + `PlanViewer3D` | Sever `decision-overlay` import + brand-token colours | **~1.5–2** |
| **`@caistech/plan-vision`** | Drawing-set → `SpatialLayout` (extractor + full-house + page-classifier + prep) | Inject LLM port (`@caistech/ai-client`); lift KB reads off MMC Supabase | **~3–4** |
| **`@caistech/compliance-reconcile`** | Deterministic `property-reconciliation.ts` | Liftable **today**, zero refactor | **~1** |
| **`@caistech/compliance-engine`** | Full 14-category RAG → analyse → cross-validate → calibrate framework | Behind storage + LLM ports; decouple from Inngest / RLS / in-house `callModel` router | **~6–8** |

All become entries in `SHARED_SERVICES.md` on extraction (maintenance rule). Consumers import
compiled `dist/`, never source.

---

## 5. Integration work at each insertion point (on top of packaging)

- **DealFindrs 3D (stage 2)** — `plan-3d` drop-in; work is an **envelope→`SpatialLayout` adapter** (PropertyProfile → massing geometry; no drawing yet). **~2 days.**
- **F2K-Projects 3D (stage 3)** — package-config → `SpatialLayout` mapping. **~2 days.**
- **Checkpoint drawing intake (stage 4)** — wire prep→extract→render→persist into the project's design stage. **~2–3 days.**
- **Checkpoint compliance (stage 5)** — deterministic reconcile into the planning-review board + conditions first (**~2 days**); then full NCC engine → findings → board/conditions (**~3–4 days**), needs the NCC KB corpus available (see §6).
- **Checkpoint delivery 3D (stage 6, optional)** — `build-sequence` / `system-explorer`. Defer.

---

## 6. Two architecture calls to make (cheap now, expensive later) — the `/plan-eng-review` agenda

1. **NCC KB placement (DATA_STANDARD D2/I1).** NCC volumes are authoritative cited prose →
   **owned RAG**. property-services already owns the planning KB. The NCC corpus should live
   **there (or a shared compliance substrate), consumed by `compliance-engine`, consumed by
   Checkpoint — NOT forked into Checkpoint.** Decide before the first NCC integration or you re-fork
   a KB (the exact anti-pattern the canonical-feed guard exists to stop). Fits the data standard
   cleanly: reconcile = deterministic vs structured `PropertyProfile` (D1); NCC findings = cited
   RAG over the owned NCC corpus (D2); human-feedback calibration = experiential/Mnemo territory (D3).
2. **One `SpatialLayout`, three producers.** Lock the schema in `@caistech/plan-3d` as the single
   interchange contract so the envelope adapter (DealFindrs), the configurator mapping (F2K-Projects),
   and the vision extractor (`plan-vision`) all emit the same shape → one viewer serves all three
   stages. Getting this wrong = three divergent geometry formats and three viewers.

Secondary review items: the `compliance-engine` storage+LLM **port interface** design (so it isn't
welded to Supabase/Inngest like the source); whether the agentic path ships v1 or defers; and the
`plan-vision` KB dependency (does extraction need the KB, or only compliance?).

---

## 7. Recommended ordering (quick wins → moat)

1. **`pdf-vision-prep` + `plan-3d` + `compliance-reconcile`** (~3–3.5 days) — liftable-today packages; unlock 3D everywhere + tier-0 compliance in Checkpoint's existing board.
2. **DealFindrs + F2K-Projects 3D integration** (~4 days) — visible "I want that" wins on the two demand-facing surfaces.
3. **`plan-vision` package + Checkpoint drawing intake** (~5–7 days) — the drawings→geometry capability.
4. **`compliance-engine` + Checkpoint NCC integration** (~9–12 days) — the crown jewel + the Structora/Amedeo moat line; heaviest detangle. Do **after** the §6.1 KB-placement call.

**Envelope:** quick-win layer ≈ 1 week; full stack ≈ 4–5 weeks focused, dependency-ordered.

---

## 8. Composition with the variance layer & the Amedeo thread

- **Variance layer** (separate scope): feasibility→delivery cost variance (DealFindrs deal-model
  snapshot ↔ Checkpoint committed+actual spend), surfaced via the existing Watchdog/Jura pipeline;
  optional change-order register + lessons loop-back. Both this plan and the variance layer
  terminate in Checkpoint's delivery/compliance stage — they compose, not conflict.
- **Amedeo / Structora:** the NCC engine + plan-vision→3D are **moat lines**, not gaps — Structora's
  "Compliance Layer" and "text-to-BIM" are exactly these, and yours are deeper + AU-grounded.
  Add them to the talking-points (pending the MMC licence, since you can't offer/license into a deal
  something a client may own until the licence is cut).

---

## 9. Open items before build
- [ ] MMCBuild component-licence deal executed (covers `plan-3d`, `plan-vision`, NCC engine).
- [ ] `/plan-eng-review` on §6 (NCC KB placement + `SpatialLayout` contract + port interfaces) — **next session (b)**.
- [ ] Confirm `@caistech/ai-client` is the LLM port for `plan-vision` + `compliance-engine`.
- [ ] Decide NCC KB home (property-services vs new compliance substrate).
- [ ] Collapse the two MMC GitHub orgs to one canonical remote (hygiene, independent of this plan).
