# Build #4 — hybrid pool-discovery + auto two-stream: cockpit session brief

> Paste the block below into a fresh Claude Code session opened in the **Corporate-AI-Solutions**
> cockpit repo (`C:\Users\denni\PycharmProjects\Corporate-AI-Solutions`). This is build #4 of the
> methodology harness (`HARNESS_BUILD_WORKLIST.md`). Builds #1 (scoring engine), #2 (derive
> `mvp_ready`) and the Stage-3 relay (Option A) are shipped; **#4 runs before #3** (the §5 demand
> scorer) per the locked resequencing — #4 is upstream and self-contained. Decision context:
> `HARNESS_BUILD_WORKLIST.md` + `feature-manifests/pool-discovery.json` (already committed). Locked 2026-05-27.

---

You are working in the **Corporate-AI-Solutions** cockpit repo (`src/app`, `src/lib/methodology`,
`src/components/methodology`). Build the **hybrid pool-discovery** flow: at ingestion, capture the
candidate **distributor pool** + **end-user pool** as hypotheses, evidence-check them (real +
reachable?), let an LLM reject weak pools and propose better-fit ones, then hand the agreed pools
off as an LLM-derived ICP + questions that **auto-create BOTH InvestorPilot streams** — replacing
today's operator-typed ICP. **Read every file named below in full before editing.**

## What's already in place (do NOT rebuild)
- **Card fields** — `idea_card.distributor` (⚑ gate-critical, "Distributor pool — who would onsell")
  and `idea_card.end_user_pool` ("End-user pool — the research pool") already exist
  (`src/components/methodology/IdeaCardEditor.tsx` `FIELDS`, committed `0703598`). `idea_card` is
  JSONB; the card PATCH already accepts any string key — **no schema/migration for the pools.**
- **The downstream target is built** — `POST /api/methodology/cards/[slug]/validate/route.ts`
  already takes `{ campaign_type, icp_description, questions[] }`, enforces the Gate-1 readiness
  HARD gate (`loadCardScore`), creates the IP campaign (`POST {IP}/api/methodology/campaigns`),
  creates the Connexions panel, kicks off activate, and is **idempotent on `(card_id, campaign_type)`**.
  Build #4 **feeds** this route (call it twice — `target-user` + `distributor-candidate`); it does
  **not** replace it.
- **The LLM pattern is established** — `src/lib/methodology/classify.ts` calls Anthropic via a
  **direct fetch** to `https://api.anthropic.com/v1/messages` (no SDK, by design). **Follow that
  pattern** for every LLM call in this build. Do NOT add `@anthropic-ai/sdk` or `@caistech/ai-client`
  (the manifest's "ai-client" line predates discovering the in-repo convention — ai-client only
  provides client *config*, and the repo deliberately avoids the SDK; matching `classify.ts` avoids
  needless deps + a fork concern). The §@caistech-first rule still binds **Brave** → consume the hub.
- **Gate ledger** — `node ~/PycharmProjects/cais-shared-services/scripts/gate-check.mjs record <slug> office-hours pass --artifact <ref>`
  records the (long-stubbed) `office-hours` slot in `pipeline_gates`.

---

## Phase 0 — Unblock (do first, surface results before coding)

1. **Run preflight** and paste output verbatim:
   `node ~/PycharmProjects/cais-shared-services/scripts/feature-preflight.mjs --feature pool-discovery`
2. **Install the one genuinely-new hub package** (Brave; `.npmrc` is already `@caistech`-configured):
   `npm install @caistech/brave-search --legacy-peer-deps`
   - Needs `GITHUB_PACKAGES_TOKEN` (read:packages) in the shell env. If install 401s, that token is
     the gap — set it (`bash ~/PycharmProjects/cais-shared-services/scripts/set-caistech-token.sh <gh-token>`).
   - Confirm the fork-check stays clean — do **not** vendor a local `braveWebSearch`.
3. **Keys** — server-only, never `NEXT_PUBLIC_*`:
   - `ANTHROPIC_API_KEY` — **likely already set** (`classify.ts` uses it on the live sync path). Verify
     in `.env.local` + Vercel; only act if missing.
   - `BRAVE_API_KEY` — **new. Harvest from InvestorPilot** (its local `.env.local` has it —
     `C:\Users\denni\PycharmProjects\investorpilot\.env.local`). Add to the cockpit `.env.local`
     **and** push to the cockpit Vercel as **sensitive, production+preview only** (never `development`,
     per the Vercel sensitive-env rule). Don't mint a new Brave key if the portfolio one works.
   - Smoke-test Brave before wiring: a one-off `braveWebSearch('singing teachers australia')` returns results.

If `BRAVE_API_KEY` / `GITHUB_PACKAGES_TOKEN` aren't available to you, **stop and surface exactly
which is missing** (blocker-surface protocol) — don't write keyed code against absent secrets.

---

## Phase 1 — Office-hours ingestion gate (the "dialogue half")

**Decision locked: option (b)** — port the `/office-hours` six forcing questions **into the cockpit
ingestion flow** (not the CLI skill). The output is the two captured pool hypotheses on the card.

1. **Where it runs:** drive it through the existing voice clarifier
   (`src/components/methodology/CockpitClarifier.tsx` + `src/lib/methodology/clarifier-context.ts`) —
   it's already the cockpit's nuance-dialogue surface and is context-aware of the card. Extend its
   context so that, for a card still missing `idea_card.distributor` / `idea_card.end_user_pool`, it
   runs the six forcing questions (demand reality · status quo · desperate specificity · narrowest
   wedge · observation · future-fit) and lands on the two pools. (A text fallback path is fine where
   voice isn't available — degrade, don't block.)
2. **Capture** the agreed pools onto the card via the existing card PATCH
   (`PATCH /api/methodology/cards/[slug]`, `idea_card.distributor` + `idea_card.end_user_pool`).
3. **Make it a gate, not a suggestion:** a `product` card cannot advance past ideation with both pool
   fields blank/hand-wavy (reuse the `gate-critical.ts` substantive-fill check — `distributor` is
   already ⚑; treat `end_user_pool` as required for `product` cards too). Record the PASS:
   `gate-check.mjs record <slug> office-hours pass --artifact <design-doc-or-card-url>`.

---

## Phase 2 — Evidence step (the "is this pool real?" half)

A new server module — `src/lib/methodology/pool-discovery.ts` — plus a route
`POST /api/methodology/cards/[slug]/pools/assess`. Server-only.

1. **Gather evidence (Brave):** for each pool hypothesis (distributor + end-user), run
   `braveWebSearch` (from `@caistech/brave-search`) with queries derived from the pool description —
   does a population of these operators/users demonstrably exist, and is it reachable (directories,
   associations, marketplaces, job boards, communities)?
2. **Assess (LLM, classify.ts pattern):** feed the pool hypothesis + the gathered results to Anthropic
   (direct fetch, `claude-sonnet` per `classify.ts`'s `MODEL`). The LLM returns, per pool:
   `verdict: 'real-reachable' | 'weak' | 'reject'`, a one-line rationale, and — when weak/reject — a
   **proposed better-fit pool** with its rationale. This is a **back-and-forth, not one-shot:** the
   operator can accept a proposal (which replaces the card's pool field and re-runs the assess) or
   push back. Keep each round's verdict + rationale on the card (e.g. `idea_card.pool_evidence`) so
   the reasoning is auditable.
3. **Output of this phase:** two pool fields the LLM marks `real-reachable`, with evidence attached.

---

## Phase 3 — ICP handoff → auto-create BOTH streams

Replaces the operator hand-typing `icp_description` + `questions` into validate.

1. **Derive (LLM):** from the two agreed pools, derive for **each** stream an `icp_description` and a
   `questions[]` set (the distributor stream tests "will someone onsell this?"; the end-user stream
   tests "does the end user want it?" — mirror the §5 framing already in `clarifier-context.ts`).
   Keep `icp_description` rich — **do not pre-truncate**; IP's old 180-char raw-query truncation is
   the thing this build removes (IP derives its own search query downstream).
2. **Auto-create both streams:** call the existing
   `POST /api/methodology/cards/[slug]/validate` **twice** (`target-user`, then
   `distributor-candidate`) with the derived ICPs/questions. It already enforces Gate-1, creates the
   IP campaign + Connexions panel, and kicks off discovery — so this step is just the **feed**.
   Surface the derived ICP/questions to the operator for a one-click confirm-or-edit before firing
   (consequence-clarity: this initiates real outreach discovery).
3. Leave the validate route's Gate-1 HARD-gate guard intact — if the MVP isn't proven ready, validate
   returns 412 and the streams don't fire. That's correct; don't bypass it.

---

## Guardrails
- Surgical edits; read each target file fully first. Reuse `classify.ts` (LLM), `braveWebSearch`
  (evidence), `gate-critical.ts` (fill check), the validate route (stream creation) — compose, don't
  rebuild.
- This repo has auth → if you save a memory, run the auth smoke-test per the global rule.
- Every new route is server-only; keys never reach the client. New Vercel env vars: sensitive,
  production+preview only.
- Update `feature-manifests/pool-discovery.json` if a new prerequisite surfaces; re-run preflight.
- Per-page/standards: any new operator surface gets an explanatory header; the confirm-before-fire
  action states its consequence.

## Verify (the proof)
1. Take a `product` card with blank pools → the ingestion clarifier runs the six questions → both
   pool fields land on the card → `pipeline_gates` shows an `office-hours` PASS.
2. Run the assess step → Brave evidence gathered, LLM verdicts + at least one "propose better pool"
   round recorded on the card.
3. Confirm the derived ICPs → validate fires twice → CAS `methodology_campaigns` has both
   `target-user` + `distributor-candidate` rows, IP shows both campaigns, Connexions shows both panels.
4. Report: the diff, the env you set (names only), preflight output, and the round-trip evidence.

## Why a cockpit session (not the cais-shared-services hub session)
The build lands entirely in the cockpit repo + its Supabase/Vercel, needs `npm install` against the
@caistech registry, `BRAVE_API_KEY`, and a dev/test loop (the magic-link QA harness per
`reference_cas_cockpit_live_testing`). This brief makes it turnkey: run Phase 0, then 1→2→3, then the
4-step verify.
