# Shared-Services Repo Consolidation Audit — Results 2026-04

**Verdict:** You have ONE canonical repo (`cais-shared-services`), ONE stale sibling fork to DELETE after a trivial merge (`packages/corporate-ai-common` — a pre-rename snapshot whose content is 5/7 byte-identical and 2/7 trivially divergent), ONE orphan duplicate file to DELETE (`packages/translation/` is the same noiseFilter.ts already inside `@caistech/stt-noise-filter`), TWO deployed services with portable library code to EXTRACT (`property-services/sdk/` → `@caistech/property-services-sdk`; `platform-trust/packages/middleware/` → `@caistech/platform-trust-middleware`), and a SEPARATE `@gbta/*` scope (`nudge-core`, `property-analysis-sdk`, `coordination`, `gbta-openclaw`) that needs a scope-consolidation decision before it silently becomes a third parallel shared-services hub.

**Net count of fragmentation points: 5** — one is trivial cleanup, two are well-scoped extractions from class-C service repos, two are scope-policy decisions.

---

## 1. Inventory

| Path | Git state | Class | Purpose (1 line) | Consumed by | Recommendation |
|---|---|---|---|---|---|
| `cais-shared-services/` | git, remote `caistech/cais-shared-services` | — (canonical hub) | Monorepo for all `@caistech/*` packages | F2K-Fund-Tokenisation (1 live consumer of `elevenlabs-convai@0.1.3`); rest planned | Keep. Finish extracting the legacy top-level dirs (§3.6). |
| `cais-shared-services/packages/elevenlabs-convai` | in hub | **A** | ElevenLabs ConvAI client + webhooks | F2K-Fund-Tokenisation | Keep. Published 0.1.3. |
| `cais-shared-services/packages/elevenlabs-voice` | in hub | **A** (stub) | Voice TTS/STT wrappers | none yet | Keep. Fill in. |
| `cais-shared-services/packages/openrouter-client` | in hub | **A** | OpenRouter LLM wrapper with retry | none yet (planned) | Keep. Content already diverged from corp-ai-common — canonical is here. |
| `cais-shared-services/packages/language-config` | in hub | **A** (stub) | 80+ language defs + TTS provider map | none yet | Keep. |
| `cais-shared-services/packages/stt-noise-filter` | in hub | **A** | STT noise filtering (rule + LLM) | none yet | Keep. Absorbs `packages/translation/` (duplicate). |
| `cais-shared-services/packages/agents` | in hub | **A** | Secure agent gateway + provisioner | none yet | Keep. |
| `cais-shared-services/packages/security` | in hub | **A** | Audit log, PII, consent, vault, retention | none yet | Keep. |
| `cais-shared-services/{lib,components,integrations,migrations,styles}/` | in hub | **F → A (pending)** | Un-extracted legacy: ABN/ABR, Mapbox, corporate React components, GHL integration, org-multi-agent SQL, brand CSS | none yet | Extract into 3–4 new `@caistech/*` packages (§3.6). |
| `packages/corporate-ai-common/` | **local-only** git repo; no remote; root `package.json.name = "cais-shared-services"` (naming clash) | **D** (staging/historical) | The template source cais-shared-services was seeded from on 2026-04-17 | none (internal refs only) | **DELETE** after recovering 2 content deltas. |
| `packages/translation/` | **not** a git repo; no `package.json`; single 7,947-byte file `src/noiseFilter.ts` | **D** (orphan duplicate) | Identical copy of `stt-noise-filter/src/noiseFilter.ts` | 6 tsconfig.json path-alias references in UniversalLingo, TourLingo, TourLingo - Copy — zero real imports | **DELETE**. Point aliases to `@caistech/stt-noise-filter`. |
| `platform-trust/` | git, `dennissolver/platform-trust`, Vercel-deployed | **C** (deployed service) + contains **A** portables | Universal trust/security/metering Next.js app + 3 internal packages | 16+ portfolio repos via COPY-PASTED `lib/platform-trust.ts` (not npm) | **Keep repo**. Extract `packages/middleware/` → `@caistech/platform-trust-middleware` so the 16+ copy-paste clients can `npm install` instead. |
| `property-services/` | git, `dennissolver/property-services`, Vercel-deployed | **C** (edge functions) + **B** (SDK already split) | Supabase edge functions (assess/derive) + React SDK at `sdk/` | DealFindrs, MMCBuild, F2K-Checkpoint-Latest each have a **copy** at `src/lib/property-services/` (not npm) | **Keep repo for functions**. **Move** `sdk/` (currently `@gbta/property-services`) → `@caistech/property-services-sdk` in `cais-shared-services`. Publish. Replace the 3 hand-copies with a dep. |
| `nudge-core/` | git, local-only, `@gbta/nudge-core` (private) | **A or F** | Unknown — private local package with `src/` | unknown (0 grep hits in consumer scan) | **Decide scope.** Either move to `@caistech/nudge-core` in the hub, or consciously keep `@gbta/*` as a parallel scope with a written reason. |
| `property-analysis-sdk/` | not git, `@gbta/property-analysis` | **B** | Property-analysis SDK | unknown (0 grep hits) | **Decide scope.** Overlaps with `property-services/sdk`? Needs a 10-minute read to confirm it isn't yet another parallel SDK for the same data. See §5. |
| `coordination/` | git, local, `@gbta/coordination` (monorepo-shaped: `src/`, `sdk/`, `supabase/`) | **C + B** likely | Unknown — shape mimics property-services (service + SDK) | unknown | **Decide scope** + inspect. Same split pattern as property-services; same recommendation likely applies. |
| `gbta-openclaw/` | git, `dennissolver/gbta-openclaw` (private wrapper) | **A** | OpenClaw wrapper | unknown | **Decide scope.** If this is `@caistech/agents`' upstream, there may be overlap. |
| `raiseready-core/` | git, `dennissolver/raiseready-core` | **Not-a-candidate** (APP) | RaiseReady voice-coach module | — | No action. |
| `easy-claude-code/` | git, `dennissolver/easy-claude-code`, private | Likely **C** | Its own product (per CLAUDE.md risk tier) | — | No action in this audit. |
| `storefront-mcp/` | git, `dennissolver/storefront-mcp`, private | **C** (MCP server) | MCP server implementation | — | No action — MCP servers deploy separately. |
| `agentic-os`, `Agentic-OS-old`, `apps/`, `llm-council/` | various | **F** | No `package.json`; `llm-council` is Karpathy's external research repo; `apps/` is an empty scaffold | — | Ignore. Not shared-services. |

---

## 2. Consolidation plan per candidate

### 2.1 `packages/corporate-ai-common/` → DELETE (class D)

- **Current:** `C:\Users\denni\PycharmProjects\packages\corporate-ai-common`
- **Target:** deleted
- **Divergence analysis (actual, byte-level):** All 7 overlapping packages appear to differ by `diff -rq`, but after `--strip-trailing-cr` only **2 files** have real content divergence:
  - `elevenlabs-convai/src/agent-client.ts` — cais is 252 lines (has the 0099252 `updateAgent` fix + the de5ed8a `webhookUrl optional/platformSettings passthrough` fix + 82f5f9f rename). Corp-ai-common is 227 lines (pre-fix, pre-rename). **Canonical version is the cais side — nothing to recover.**
  - `openrouter-client/src/index.ts` — 127 lines on both sides; divergence is real, not whitespace. Need to read both to decide which is canonical (§3 Unknowns).
  - All other `.ts/.js` files (`security/*`, `agents/*`, `stt-noise-filter/noiseFilter.ts`, `elevenlabs-voice/index.ts`, `language-config/index.ts`, etc.) are byte-identical after line-ending normalisation.
  - All `package.json` files differ only for the `@cais/` → `@caistech/` scope rename + version bump — canonical is cais.
- **Also present only in corp-ai-common** (un-migrated top-level dirs): `components/`, `integrations/`, `lib/`, `security/` (top-level, NOT the `packages/security`), `styles/`, `migrations/`, `agents/` (top-level), `elevenlabs-convai/` (top-level). These are **the same files** as the still-un-extracted legacy dirs in cais-shared-services root — see §4 overlap map.
- **Order of operations:** (1) Diff `openrouter-client/src/index.ts` both sides; pick canonical; copy into cais if corp has meaningful improvements; (2) Confirm the 8 top-level legacy dirs in corp-ai-common don't contain newer content than cais's matching dirs (§4); (3) `rm -rf packages/corporate-ai-common`.
- **Effort:** **S** (30–90 min, mostly the openrouter-client decision and the legacy-dir comparison).

### 2.2 `packages/translation/` → DELETE (class D)

- **Current:** single file `packages/translation/src/noiseFilter.ts` (7,947 bytes).
- **Overlap evidence:** byte-identical to `cais-shared-services/packages/stt-noise-filter/src/noiseFilter.ts` after line-ending normalisation. There is no package.json, no tests, no README — not a real package.
- **Consumers:** 0 actual imports. 6 stale tsconfig.json path-alias entries in UniversalLingo (2), TourLingo (2), TourLingo - Copy (2) — each of form `"packages/translation/*": [...]`. No `.ts/.tsx` file actually resolves those aliases.
- **Order of operations:** (1) Strip the 6 tsconfig path-alias entries (or point them at `@caistech/stt-noise-filter`); (2) `rm -rf packages/translation`. The whole parent dir `packages/` (the local-only sibling) can be deleted after §2.1 too.
- **Effort:** **XS** (<30 min).

### 2.3 `property-services/sdk/` → EXTRACT to `@caistech/property-services-sdk` (class B extraction)

- **Current location:** `property-services/sdk/` — already a clean standalone package (`@gbta/property-services` v1.0.0, tsc build, 5 source files, 642 lines: types, client, `PropertyAssessment.tsx`, `usePropertyOnboarding.ts`, index).
- **Target location:** `cais-shared-services/packages/property-services-sdk/src/`, published as `@caistech/property-services-sdk`.
- **What moves:** all of `sdk/src/`, the `sdk/package.json` (with name rebranded and peer-deps preserved — React 18/19).
- **What stays behind:** `supabase/functions/{assess,derive,_shared}/` (1,018 lines of Deno edge-function code) stays in `property-services`, deployed via Supabase CLI. The landing/demo in `property-services/src/` stays or gets deleted separately.
- **Dependencies it creates:** React peer; needs `SUPABASE_URL` + `SUPABASE_ANON_KEY` env in consumer apps to reach the edge functions; no runtime dep on the service repo.
- **Order of operations:** (1) Copy `sdk/` into `cais-shared-services/packages/property-services-sdk/`; (2) Rename package `@gbta/property-services` → `@caistech/property-services-sdk`; (3) Build and publish; (4) In DealFindrs, MMCBuild, F2K-Checkpoint-Latest: replace their `src/lib/property-services/` hand-copies with `npm i @caistech/property-services-sdk`; (5) Delete `sdk/` from `property-services` repo OR leave an alias re-export for one release cycle.
- **Effort:** **M** (half-day — the three consumer-repo swaps need testing).

### 2.4 `platform-trust/packages/middleware/` → EXTRACT to `@caistech/platform-trust-middleware` (class A extraction from class C repo)

- **Current:** `platform-trust/packages/middleware` — exports `checkRateLimit`, `checkPermission`, `logAuditEvent`, `meterCall`, `withTrust`, `createTrustMiddleware`. No build step currently; `main: "index.ts"`.
- **Target:** `cais-shared-services/packages/platform-trust-middleware/` published as `@caistech/platform-trust-middleware`.
- **What moves:** `packages/middleware/*`. Optionally also `packages/security-gate/` and `packages/agent-trust-score/`.
- **What stays:** The Next.js app (`app/`, `supabase/`, `lib/inngest/`, `scripts/portfolio-trust-middleware.ts`) — that's the deployed service. The dashboard + API routes stay in `platform-trust`.
- **Critical context:** Today `scripts/portfolio-trust-middleware.ts` WRITES a hand-rolled `lib/platform-trust.ts` into 20 portfolio repos. That's the fragmentation — 16+ repos have a **copy** instead of an **import**. Extracting to `@caistech/` means every copy-paste target (Kira, Connexions, LaunchReady, F2K-Checkpoint-Latest, DealFindrs, MMCBuild, Tenderwatch, NDISSDAAutomate, HouseSitAgent, LeadSpark, SmartBoard, raiseready-core, RaiseReadyTemplate, universal-interviews, easy-claude-code, gbta-openclaw, agentic-os, storefront-mcp, and 2 others) can `npm install` instead.
- **Order of operations:** (1) Add a `tsc` build to the middleware package; (2) Copy to cais-shared-services; publish; (3) Rewrite `portfolio-trust-middleware.ts` to generate a thin import stub instead of a 5 KB template; (4) Migrate the 20 copy-paste targets one at a time (this is a long-tail job — tier it by REGULATED repos first).
- **Effort:** **L** (1+ day for the package; the consumer migration is multi-day but can proceed incrementally).

### 2.5 Legacy top-level dirs in cais-shared-services → EXTRACT (class F→A)

Still sitting un-extracted at `cais-shared-services` root:

| Dir | Content | Probable new package |
|---|---|---|
| `lib/` | ABN (`abn.ts`), ABR API client, Mapbox bindings, profile+social extractors (6 TS files, ~1,274 LOC with components) | `@caistech/abn-lookup` (already planned in sequencing memory), `@caistech/mapbox` |
| `components/` | `CorporateHeader`, `CorporateFooter`, `AbnLookupField`, `AddressAutocomplete` (8 TS/TSX) | `@caistech/corporate-components` (planned) |
| `integrations/` | GHL stub (2 JS) | `@caistech/ghl-client` (planned) |
| `migrations/` | org-multi-agent SQL (1 file) | Stays in hub as `sql/` or belongs inside `@caistech/agents`. |
| `styles/` | corporate-globals CSS + `tailwind-brand-colors.js` | Belongs inside `@caistech/corporate-components`. |

Effort across this set: **M** each for `abn-lookup`, `corporate-components`, `ghl-client`. Sequencing memory already covers ordering.

### 2.6 `@gbta/*` scope repos → DECIDE (not in scope for auto-plan)

`nudge-core`, `property-analysis-sdk`, `coordination`, `gbta-openclaw` all live under `@gbta/*`. They may be deliberate (Global BuildTech is a separate commercial entity) or accidental (pre-caistech-rename leftovers). See §3 Unknowns.

---

## 3. Unknowns / decisions needed from Dennis

1. **`@gbta/*` vs `@caistech/*`.** Is `@gbta/*` a deliberately separate product scope (different legal entity / different customer), or is it unintentional fragmentation? If the latter, `nudge-core`, `property-analysis-sdk`, `coordination`, `gbta-openclaw` should all migrate under `@caistech/*`. If the former, they stay but you need a written scope-boundary rule so future work doesn't drift.
2. **`property-analysis-sdk` vs `property-services/sdk`.** Both claim "property" SDK-ish territory. Are they the same product at two different ages, or two different products? A 10-minute read of each will decide — I didn't do it because the audit said don't over-read.
3. **`openrouter-client/src/index.ts` canonical pick.** Real content divergence between corp-ai-common (127 lines) and cais (127 lines). Same line count, different bytes. Before deleting corp-ai-common, decide which is canonical; if corp has meaningful improvements, merge them in.
4. **`platform-trust` middleware — keep portfolio copy-paste, or migrate to npm?** Today's pattern is intentional (template `getTemplate()` lets each consumer fork/customise). Extracting to `@caistech/` is architecturally cleaner but ends the fork-customise flow. Dennis call.
5. **`coordination` shape.** Has `src/`, `sdk/`, `supabase/` — same shape as `property-services`. Probably a deployed-service + SDK pair and should split the same way. Needs a 10-minute inspection to confirm before moving.
6. **Legacy top-level dirs inside corp-ai-common.** They appear to be the same content as cais's legacy top-level dirs. Before deleting corp-ai-common, spot-check (`diff -rq --strip-trailing-cr`) that nothing newer landed on the corp side after the 2026-04-17 seed.

---

## 4. Overlap map

All overlaps here are between `cais-shared-services` and the sibling `packages/` tree. No significant overlap was found with `platform-trust` or `property-services` (they're different functional domains).

### 4.1 `cais-shared-services/packages/*` ↔ `corporate-ai-common/packages/*`

All 7 packages exist in both trees at the same relative path. File-level truth:

| Package | File count each side | Content status |
|---|---|---|
| `elevenlabs-convai` | 10 ↔ 10 | **Real divergence.** `agent-client.ts` 252 vs 227 lines — cais has the 0099252 + de5ed8a fixes. `package.json` scope+version differ. `README.md`, `migration.sql`, `conversation-tools.ts`, `index.ts`, `types.ts`, `webhook-handlers.ts`, `webhook.ts`, `tsconfig.json` all differ too — mix of real edits + line endings; cais is ahead. |
| `elevenlabs-voice` | 2 ↔ 2 | Only `package.json` (scope rename) and stub `index.ts` differ; content identical modulo line endings. |
| `openrouter-client` | 2 ↔ 2 | **Real divergence** in `src/index.ts`. See Unknown #3. |
| `language-config` | 2 ↔ 2 | `package.json` only; source identical. |
| `stt-noise-filter` | 3 ↔ 3 | `package.json` only; `noiseFilter.ts` byte-identical. |
| `agents` | 5 ↔ 5 | `package.json` only; all `.js` byte-identical after line-ending normalisation. |
| `security` | 9 ↔ 9 | `package.json` only; all `.js` + `classification-patterns.json` byte-identical after line-ending normalisation. |

Conclusion: corp-ai-common is a **pre-rename frozen snapshot** of the hub. It has no content the hub doesn't already have, except possibly a superior `openrouter-client/src/index.ts` — one file to check.

### 4.2 `corporate-ai-common/{components,integrations,lib,security,styles,migrations,agents,elevenlabs-convai}/` (top-level, NOT inside `packages/`) ↔ `cais-shared-services/{lib,components,integrations,migrations,styles}/`

These correspond to the **un-extracted legacy content** at the root of cais-shared-services. Per the `Last 5 commits` check on cais and the mod-time inspection on corp-ai-common (most of these dirs: 2026-03-22; `lib/` 2026-04-06; `elevenlabs-convai/` 2026-04-17), the hub is at least as recent as corp-ai-common across these. Confirm before delete (Unknown #6).

Note: corp-ai-common ALSO has a **top-level** `security/` AND a `packages/security/`. They are two different things — one is the old pre-packages layout, one is the packaged version. Both converge to `@caistech/security` in the hub.

### 4.3 `packages/translation/src/noiseFilter.ts` ↔ `cais-shared-services/packages/stt-noise-filter/src/noiseFilter.ts`

Byte-identical after line-ending normalisation (7,947 bytes, same content). Pure duplication.

### 4.4 `property-services/sdk/` — zero hub overlap (clean extraction)

The SDK is self-contained (types, client, one React component, one hook). No overlap with any `@caistech/*` existing package. Consumer copies at `DealFindrs/MMCBuild/F2K-Checkpoint-Latest/src/lib/property-services/` are byte-for-byte forks waiting for a published package.

### 4.5 `platform-trust/packages/middleware/` — zero hub overlap (clean extraction)

Middleware is the only of its kind. No overlap with `@caistech/security`, which is Supabase audit/PII/consent infrastructure rather than an HTTP middleware layer.

---

## 5. Proposed final state (2 weeks)

```
caistech/cais-shared-services/          (ONE canonical monorepo)
├── packages/
│   ├── elevenlabs-convai/               # @caistech/elevenlabs-convai  (published)
│   ├── elevenlabs-voice/                # @caistech/elevenlabs-voice   (fill in)
│   ├── openrouter-client/               # @caistech/openrouter-client
│   ├── language-config/                 # @caistech/language-config
│   ├── stt-noise-filter/                # @caistech/stt-noise-filter   (absorbs packages/translation)
│   ├── agents/                          # @caistech/agents
│   ├── security/                        # @caistech/security
│   ├── abn-lookup/                      # NEW — from lib/abn.ts, abr-client.ts
│   ├── corporate-components/            # NEW — from components/ + styles/
│   ├── ghl-client/                      # NEW — from integrations/
│   ├── property-services-sdk/           # NEW — from property-services/sdk/
│   └── platform-trust-middleware/       # NEW — from platform-trust/packages/middleware/
└── (no more top-level lib/ components/ integrations/ styles/)

dennissolver/property-services/          (deployed edge functions — stays class C)
└── supabase/functions/{assess,derive,_shared}/
   (sdk/ removed — now lives in cais-shared-services)

dennissolver/platform-trust/             (deployed Next.js — stays class C)
├── app/ + supabase/ + lib/inngest/      (the running service)
└── scripts/portfolio-trust-middleware.ts rewritten to emit an import-stub, not a template.

DELETE:
- C:\Users\denni\PycharmProjects\packages\corporate-ai-common\   (after recovering openrouter-client content if needed)
- C:\Users\denni\PycharmProjects\packages\translation\
- (the whole C:\Users\denni\PycharmProjects\packages\ local-only dir, once both subdirs are gone)

DECIDE (scope consolidation, blocking):
- @gbta/nudge-core, @gbta/property-analysis, @gbta/coordination, gbta-openclaw
  → either migrate to @caistech/* or document the @gbta scope boundary.
```

---

## 6. Quick-reference action list (if you want one number to watch)

1. Fastest win (**XS**): delete `packages/translation/` + fix 6 stale tsconfig aliases.
2. Short (**S**): diff `openrouter-client/src/index.ts`; pick canonical; `rm -rf packages/corporate-ai-common`.
3. Medium (**M**): extract `property-services/sdk/` → `@caistech/property-services-sdk`; swap 3 consumer copies.
4. Medium (**M**) × 3: extract `abn-lookup`, `corporate-components`, `ghl-client` from hub root dirs.
5. Long (**L**): extract `platform-trust/packages/middleware/` → `@caistech/platform-trust-middleware` and begin the 20-repo migration.
6. Decision gate: `@gbta/*` scope — migrate or document.

After these, the answer to the core question — *"Do I have ONE shared-services repo?"* — becomes unambiguously **yes**.

---

## 7. Execution log (appended 2026-04-18)

### 7.1 Correction to §1 and §2.2 — tsconfig aliases are NOT stale

On execution, verified the 6 tsconfig `"packages/translation/*"` aliases in UniversalLingo/TourLingo/TourLingo-Copy are **relative** and resolve to each repo's **own internal** `packages/translation/` dir — NOT the orphan at `C:\Users\denni\PycharmProjects\packages\translation\`. Each internal dir is a live, actively-maintained translation package (15+ source files: cache, elevenlabs, google-tts, hybrid-stt, hybrid-tts, hooks, providers, pipeline, etc.) actively imported by 15 `.ts` files across API routes and next.config.js via the `@universallingo/translation` / `@tourlingo/translation` aliases.

**Consequence:** Item 1 (XS) has **zero cross-repo impact**. No tsconfig edits needed. UniversalLingo / TourLingo / TourLingo - Copy are not part of this consolidation.

**Root cause of the original misdiagnosis:** The consumer-grep agent found the path-string `packages/translation` in those tsconfig files and assumed the aliases pointed at the external `C:\Users\denni\PycharmProjects\packages\translation\`. Relative-path resolution wasn't checked until execution.

### 7.2 Resolution of Unknown #3 — openrouter-client canonical pick

Read both files in full. The only differences between `cais-shared-services/packages/openrouter-client/src/index.ts` (canonical) and `corporate-ai-common/packages/openrouter-client/src/index.ts` are on lines 2 and 6: the scope name in a doc comment (`@caistech/openrouter-client` vs `@cais/openrouter-client`). All 127 lines of actual code are byte-identical. **Cais is canonical. Nothing to recover.**

### 7.3 Item 1 executed — `packages/translation/` deleted

- `rm -rf C:\Users\denni\PycharmProjects\packages\translation` — successful.
- Not a git repo, zero consumers. Content (`noiseFilter.ts`) preserved in `cais-shared-services/packages/stt-noise-filter/src/noiseFilter.ts` (byte-identical).

### 7.4 Item 2 executed — `packages/corporate-ai-common/` deleted

Pre-delete verification: corp-ai-common had exactly ONE commit ("Initial commit — cais-shared-services monorepo") pointing at the same remote as the canonical (`https://github.com/dennissolver/cais-shared-services.git`). Never pushed. No unique history. All content equivalent to canonical modulo (a) line endings, (b) `@cais/` → `@caistech/` scope rename, (c) the 2 recent elevenlabs-convai fixes (already on cais side).

- `rm -rf C:\Users\denni\PycharmProjects\packages\corporate-ai-common` — successful.
- Parent `C:\Users\denni\PycharmProjects\packages\` attempted delete — Windows refused with "Device or resource busy" (PyCharm is likely holding a handle on the dir). The dir is now **empty** (only `.idea/` and `.venv/` had been left behind, both removed as part of the `rm -rf`). Dennis can remove the empty husk after closing PyCharm, or leave it — functionally equivalent.

### 7.5 Current state of Items 3–6

- **Item 3 (property-services/sdk extraction — M):** not started.
- **Item 4 (abn-lookup / corporate-components / ghl-client extraction — M × 3):** not started.
- **Item 5 (platform-trust-middleware extraction + 20-repo migration — L):** not started.
- **Item 6 (@gbta/\* scope decision):** Dennis confirmed GBTA = Global BuildTech Australia, no brand reason to keep the scope. Proceeding to retire.

### 7.6 Items 3, 4, 5 (local extraction) executed 2026-04-18

Local code moves completed. Publishing and cross-repo consumer swaps are deferred to a later session. Six commits on `main`:

| Commit | Subject |
|---|---|
| `2d5f9b2` | `docs: add consolidation audit results + execution log` (also swept the queued `git mv` renames for items 4a-c) |
| `f990548` | `feat(abn-lookup): new @caistech/abn-lookup package` |
| `c25cf4e` | `feat(corporate-components): new @caistech/corporate-components package` |
| `c271397` | `feat(ghl-client): new @caistech/ghl-client package` |
| `cbfd00b` | `feat(property-services-sdk): new @caistech/property-services-sdk package` |
| `619cd7e` | `feat(platform-trust-middleware): new @caistech/platform-trust-middleware package` |

Hub root legacy dirs eliminated in the process: `lib/abn.ts`, `lib/abr-client.ts` → `@caistech/abn-lookup`; all of `components/`, `styles/`, and `tailwind-brand-colors.js` → `@caistech/corporate-components`; all of `integrations/` → `@caistech/ghl-client`. Remaining at hub root: `lib/{mapbox-types.ts, mapbox.ts, profile-extractor.ts, social-extractor.ts}`, `migrations/org-multi-agent.sql` — these await a future extraction session (not scoped for today).

Known issue to note: the hub workspace has never had `npm install` run at root. Hub packages with React deps (`@caistech/property-services-sdk`, `@caistech/corporate-components`) fail `tsc --noEmit` today purely because `@types/react` isn't resolved. Non-React packages (`abn-lookup`, `nudge-core`) typecheck clean. Running `npm install` at root after next push will resolve.

### 7.7 Item 6 — @gbta scope retirement: findings and per-repo disposition

Inspected all four repos. Revised dispositions based on what was actually inside:

**a. `nudge-core`** (was `@gbta/nudge-core`@0.1.0)
- Clean single-package library — cron-handler, email-builder, frequency-cap, evaluator registry, types.
- **Folded into hub** as `@caistech/nudge-core` (commit `e207e43`). `resend` peerDep kept as optional.
- Next steps: decide whether to delete the source `nudge-core/` repo (zero external consumers per grep) — deferred.

**b. `property-analysis-sdk`** (was `@gbta/property-analysis`@1.0.0)
- **Duplicate of `property-services/sdk`.** Both claim in their `index.ts` header: *"Used by: F2K-Checkpoint, DealFindrs, MMC Build"*. Both export `ZoningInfo`, `SubdivisionAnalysis` types and React property components. Keywords overlap exactly (zoning, subdivision, LGA, mapbox).
- The two appear to be parallel lineages — property-analysis-sdk looks like the older/predecessor implementation that was superseded when property-services was split into service + SDK.
- Also includes hand-copied `src/lib/platform-trust.ts` and `src/lib/security-gate.ts` (the classic consumer copy-paste pattern), confirming it's a downstream artefact, not canonical.
- **Recommendation: deprecate, don't fold.** `@caistech/property-services-sdk` is the canonical future.
- **Decision needed from Dennis (blocker):** delete `property-analysis-sdk/` outright, or keep it archived for reference?

**c. `coordination`** (was `@gbta/coordination`@0.1.0)
- Mirror of the property-services pattern: `supabase/` (edge functions + migrations) + `src/lib/` + `sdk/src/` + `sdk/src/server/{actions, ai-pipeline, magic-links, evaluators/coord-01..06}` + `sdk/src/hooks/`.
- Same class-B+C split as property-services — the `sdk/` portion is portable; the rest deploys.
- **Fold recommended:** extract `sdk/` into hub as `@caistech/coordination-sdk`; leave the repo for the Supabase-deployed service. Effort: M. **Deferred** to a next session (too much for today given everything else that moved).

**d. `gbta-openclaw`**
- Package name is actually `easyopenclaw-wrapper`, NOT `@gbta/*` — no scope to rename. My audit §1 classified it as a library; on inspection it's actually a deployed product (has `apps/frontend/`, `infrastructure/`, `integrations/`, a PDF of a Pubguard report, Python CLI).
- **Removed from item-6 scope.** It's class C, deployed. Not a shared-services candidate.

### 7.8 Remaining work (for next session)

| Item | Subject | Effort | Blocker |
|---|---|---|---|
| 3b | Publish `@caistech/property-services-sdk` to GitHub Packages | XS | — |
| 3c | Swap consumer copies in DealFindrs, MMCBuild, F2K-Checkpoint-Latest | M | per-repo commits |
| 4d | Run `npm install` at hub root so workspace packages resolve React types | XS | — |
| 5b | Publish `@caistech/platform-trust-middleware` | XS | — |
| 5c | Rewrite `platform-trust/scripts/portfolio-trust-middleware.ts` to generate an import stub instead of a template | S | — |
| 5d | Migrate the 20 portfolio repos to the published package | L | per-repo; tier REGULATED first (mmcbuild, platform-trust, ndissda-automate, f2k-checkpoint, f2k-fund-tokenisation) |
| 6b | Deprecate or delete `property-analysis-sdk` | XS after decision | **Decision: delete or archive?** |
| 6c | Extract `coordination/sdk/` → `@caistech/coordination-sdk`; leave coordination repo for Supabase | M | — |
| Mapbox / profile / social extractors | Extract `lib/{mapbox*, profile-extractor, social-extractor}.ts` into a 4th hub package (proposed: `@caistech/mapbox` + `@caistech/extractors` OR bundle) | S | scope decision — single or two packages? |
| `migrations/org-multi-agent.sql` | Decide: stay at hub root, move into `@caistech/agents` package, or delete? | XS | decision only |
