# Confidential Dataroom Agent — reusable pattern & product idea

> **What this is.** A portable description of the **AI-native confidential dataroom** built first
> for the LingoPure investor raise (reference implementation: the `LingoPureAI` investor portal,
> `/investor/*`). It turns a pile of confidential documents into an **invite-only portal where a
> reader asks cited questions, generates reports, and is guided by a voice agent** — with
> **server-enforced, two-tier (NDA-gated) confidentiality, per-user watermarking and a full audit
> trail.** Captured here so it can be (a) **integrated as a feature into other portfolio / 3rd-party
> platforms**, or (b) **productised as a standalone multi-tenant SaaS**.
>
> **Status:** reference impl built + live + naive-tester-passed (2026-06-26). This doc is the
> pattern, not the code; file paths point at the reference repo.
>
> **Last updated:** 2026-06-26.

---

## 0. TL;DR

- **Problem it solves:** confidential document sets (investor datarooms, M&A/DD, board/IC packs,
  legal/contract rooms) are slow to read and clumsy to share as raw Drive folders. Reading is slow;
  **asking is fast**.
- **The experience:** an invite-only portal where a reader (a) **asks any question** and gets a
  **source-cited** answer drawn only from the room, (b) **talks it through with a voice clarifier**
  that shapes the question then hands it to the written analyst, (c) **opens any source document at
  the cited page** (watermarked, logged), and (d) **generates a written report** (memo / DD summary /
  financials brief / risk register) as a watermarked PDF.
- **The moat-grade bit:** **two-tier confidentiality enforced server-side.** Tier A (main) is open
  to any invited reader; Tier B (deep dive) is gated behind an **online NDA accepted in-portal**
  (recorded with name + timestamp). The operator decides *eligibility*; the NDA always gates the
  *actual access* — the operator can never bypass the NDA. Every question, document open and report
  is audited.
- **The security stance that makes voice safe:** the **voice agent only clarifies — it never fetches
  or reads documents.** Every data action runs in the **authenticated browser against the
  tier-gated endpoints**, which re-check access regardless of channel. Voice never egresses
  confidential content.
- **Productisation:** sells to **operators who run confidential datarooms** (VCs/accelerators, corp
  dev / M&A advisors, IR teams, law firms) — clip per active reader/seat (BUSINESS_MODEL lane 1), or
  drop it into an existing platform as a feature.

---

## 1. When to use it

Any time a **confidential document corpus** must be made **explorable by outsiders under controlled
access**:

- **Investor datarooms** (the reference use case) — fundraising, where speed of due diligence is a
  competitive edge for the company raising.
- **M&A / due-diligence rooms** — buy/sell-side, where counterparties need guided, audited access.
- **Board / IC portals** — internal strategy + economics behind a tighter gate.
- **Legal / contract rooms, compliance evidence rooms, vendor-assessment packs** — anywhere
  "here's a folder of PDFs" is the status quo and a queryable, audited, watermarked room is better.

Two delivery modes (decide per opportunity):

1. **Integrate** — bolt the pattern into an existing portfolio/3rd-party platform as a feature
   (e.g. an investor-room module inside a fundraising/CRM/IR tool). Reuse the building blocks (§5).
2. **Standalone product** — a multi-tenant SaaS where a distributor spins up rooms for their
   counterparties (§7).

---

## 2. The experience (user-facing capabilities)

The reader gets, instead of ~N loose files:

- **Ask (cited Q&A).** Plain-language questions → a specific answer that **quotes the documents and
  the exact page** it used. **Degrade-don't-fake:** if the answer isn't in the room, it says so
  rather than guessing. Every Q&A is audited.
- **Voice clarifier (the "Morgan" pattern).** A proactive voice agent that helps the reader turn a
  vague interest into a sharp question, then **hands it to the written analyst** for the cited
  answer. Avatar-on-top, transcript, session memory. **Conscious choice up front:** "Text only (I
  know what I need)" vs "Talk it through." *The clarifier never answers from documents itself* (§4).
- **Clickable citations.** Each source chip on an answer **deep-links to the cited document at the
  cited page** (`#page=N`), opened as a watermarked, access-logged copy.
- **Document finder + viewer.** Browse/search the tier-filtered file list; open any entitled file —
  server-mediated, **per-user watermarked**, audited.
- **Report generator.** On demand or from the voice conversation: a narrative report (investment
  memo, DD summary, financials brief, traction summary, team & cap table, tech/defensibility, risk
  register, custom) → **watermarked PDF**, each section citing its sources, gaps marked not invented.
- **Operator console.** Invite/revoke readers, set deep-dive eligibility, watch the access log.
- **(Optional) "Explore the platform" bridge** — a link from the room to a live product
  prototype/demo, so a reader can *feel* the product, with an honest "prototype, not the live
  service" caveat + builder credit.

---

## 3. The confidentiality & security spine (the non-negotiables)

This is what makes it a *confidential* dataroom rather than a chatbot over some PDFs. Treat every
line as load-bearing:

1. **Two tiers, server-enforced.** Tier A (main) and Tier B (NDA-gated deep dive). Tier is derived
   from the reader's **server-side** entitlement, **never** from the client/request.
2. **Entitlement ≠ access.** Split **`deep_dive_invited`** (operator entitlement) from **effective
   access** (e.g. `max_tier`, which only flips to deep-dive when the reader accepts the **online
   NDA**). The operator can grant eligibility but **can never bypass the NDA**; accepting the NDA is
   what unlocks access, recorded with name + timestamp. (Removing eligibility pulls access back.)
3. **Retrieval is tier-filtered inside a `SECURITY DEFINER` RPC** whose `EXECUTE` is **revoked from
   `anon`/`authenticated`** — only the service-role server calls it, so a client can never
   self-elevate or call it directly.
4. **Documents are server-mediated.** A download route re-checks the doc's tier against the reader's
   server-side tier (never trusts the id), **watermarks per-reader**, audits the open, and streams.
   PDFs served **inline** so citation deep-links land on the page.
5. **Voice never egresses confidential data.** The voice agent is a **clarifier with no RAG/document
   tools**, because the voice tool channel can't reliably enforce the tier (LLM-filled, spoofable).
   Any "voice-triggered" document/report action runs as **browser-orchestrated calls to the
   authed, tier-gated endpoints** — identity from the session, tier enforced server-side. (Morgan
   *herself* invoking tools mid-call via ElevenLabs client-tools is a deferred enhancement; the
   browser-orchestrated path is the reliable, equally-safe equivalent.)
6. **Everything is audited.** ask / answer / doc_view / report_generate / nda_accept / invite /
   status_change / deep_dive_change / voice_session — keyed to the reader.
7. **RLS on every table; service-role key never client-side; originals in a private bucket.**
8. **No model-training on the corpus.** API providers (Anthropic/OpenAI) don't train on API data by
   default; lock with **ZDR + DPAs** (account-level) and prefer ZDR-eligible models. BYOK is an
   option to move per-reader cost + data boundary to the operator. (See `DATA_PROCESSING` posture.)
9. **A tier-leak test is release-blocking.** Prove main-tier never reaches deep-dive content via ask
   **or** documents (positive + negative controls) before shipping.

---

## 4. Architecture & building blocks

| Layer | What it does | Reference impl (LingoPureAI) |
|---|---|---|
| **Ingestion + index** | Extract text (pdf/docx/xlsx) + **vision-caption image-only docs**; chunk; embed; tier-tag each chunk. Idempotent (content hash), reports failures, never silent-drops. | `scripts/ingest-dataroom.mjs`; migration `dataroom_documents` + `dataroom_chunks` (pgvector + HNSW) |
| **Tier-gated retrieval** | `SECURITY DEFINER` match RPC, tier filter inside, `EXECUTE` revoked from anon/authenticated (service-role only). | `match_dataroom_chunks` RPC |
| **Cited Q&A** | Auth → server-side tiers → tier-filtered retrieve → LLM answer w/ citations, degrade-don't-fake → audit. | `POST /api/investor/ask`, `src/lib/investor/{retrieval,answer,ask-prompt}.ts` |
| **Reports** | Zod `ReportSpec` (typed report catalogue) → per-section retrieve+synthesise → watermarked PDF → store + audit. | `report-spec.ts`, `build-report.ts`, `report-pdf.ts`, `POST /api/investor/reports/{voice,run,[id]/download}` |
| **Documents** | Tier-filtered list + server-mediated download (tier re-check, per-reader watermark, inline, audit). | `GET /api/investor/documents`, `.../documents/[id]/download`, `watermark-pdf.ts` |
| **Voice clarifier** | Canonical `@caistech/elevenlabs-convai` `VoiceWidget` (avatar/transcript/memory) + browser-orchestrated handoff to the authed RAG; server-trusted conversation→reader binding for memory. | `investor-voice-morgan.tsx`, `ask-mode.tsx`, `voice-morgan.ts`, `voice/bind` route, webhook branch, `provision-investor-morgan.mjs` |
| **Citations** | Clickable source chips → deep-link to the cited page via the download route. | `src/components/investor/citations.tsx` |
| **NDA gate** | Online click-through NDA; accept records ledger + flips effective access; admin can't bypass. | `nda/`, `POST /api/investor/nda/accept`, `nda-text.ts` |
| **Operator console** | Dual-auth (§8.5), ADMIN_EMAILS-gated; invite (auto-email magic link), deep-dive eligibility, revoke/reactivate, access log. | `/investor/admin/*` |
| **Auth** | token_hash callback (cross-device safe), magic-link invites, §9.5 QA accounts, persistent chrome + Settings. | `auth/callback`, `investor/login`, `invite.ts` |

---

## 5. `@caistech` substrate reused vs product-specific

**Reused (consume, don't fork):**
- `@caistech/elevenlabs-convai` (+ `/react VoiceWidget`) — the voice clarifier + memory loop
  (follow `VOICE_MEMORY_STANDARD.md`).
- `@caistech/corporate-components` (`AuthForm`) — the canonical auth surface (when its dist is
  healthy; reference impl currently uses the repo's proven auth pattern + token_hash callback).
- `@caistech/email-compliance` — for any commercial outreach about the room (Spam Act).
- `@caistech/usage-meter` — meter the LLM spend per room/tenant.
- Auth/token canon, the §8.5 dual-auth + §9.5 QA-account standards, the watermark/PDF approach.

**Product-specific (the candidate `@caistech` extraction if it recurs):** the
ingestion→pgvector→tier-gated-RPC→cited-Q&A→report-PDF spine + the **two-tier/NDA confidentiality
model**. If a 2nd product needs a confidential dataroom, **extract this into a
`@caistech/dataroom` engine** (core RAG + tenancy + tier/NDA + audit) with a thin per-product config
layer — the lane-1 two-tier shape (BUSINESS_MODEL §7).

---

## 6. Productisation — lane fit

Per `BUSINESS_MODEL.md`:

- **Distributor archetypes (who pays):** VC funds & accelerators (portfolio raises), corporate
  development / M&A advisors & boutiques, IR teams, law firms running deal/contract rooms, data-room
  incumbents wanting an AI layer. "Anyone with confidential docs" is **not** an answer — name the
  operator with an existing book.
- **End users (don't bill):** the investors / counterparties / reviewers who *read* the room.
- **The clip:** charge the distributor per active reader/seat or per room; they price their
  counterparties (or absorb it as deal-cost). Low clip, recurring.
- **Why now:** AI search + agent-readiness make "ask the room" an expected affordance; raising
  founders compete on DD speed; "confidential, audited, AI-native dataroom" has no obvious owner.
- **Lane:** lane-1-shaped (paid, multi-tenant) **if validated** via the pipeline (distributor +
  end-user signal). Until then it's a **feature** to integrate (lane-3 contract builds / inside an
  existing portfolio product) and a **showcase** of build capability.
- **Build-to-validate / thin version (THIN_MVP_RUBRIC):** the *experience* (ask → cited answer +
  one report type + the NDA gate + watermark) carries the whole promise; multi-tenant tenancy,
  billing and white-label are the scale layer that waits for the GO. The single-tenant investor
  portal IS the thin MVP.

---

## 7. Reference implementation

`LingoPureAI` repo, investor portal (`src/app/investor/*`, `src/lib/investor/*`,
`src/app/api/investor/*`, `supabase/migrations/0020–0022`). Full build notes:
`LingoPureAI/docs/INVESTOR_AGENT_BUILD_SPEC.md` (§11 = the voice + actions + explore additions).
Provisioned for one raise; built to the portfolio standards (responsive, dual-auth, voice, auth,
audit) from the start.

---

## 8. Open enhancements (not blockers)

- Extract the `@caistech/dataroom` engine on the 2nd confidential-room product (the trigger).
- Morgan invoking document/report actions herself via ElevenLabs **client tools** (deferred — the
  hub provisioner filters client tools + live-API wire-shape uncertainty; browser-orchestrated is
  the reliable equivalent today).
- "What changed since my last visit" digest; standing data-gap panel; per-answer confidence/coverage
  signal; export an audited Q&A trail — all surfaced by the reference impl's naive-tester (the VC
  persona's asks).
- Multi-tenant tenancy + per-distributor billing/white-label (the lane-1 Tier-1 layer) — post-GO.
