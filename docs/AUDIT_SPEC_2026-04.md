# Shared-Services Repo Consolidation Audit — 2026-04

**Author of spec:** Claude (carry-forward from session c00546d7…, 2026-04-17/18)
**Intended executor:** Next Claude Code session (started in `C:\Users\denni\PycharmProjects\cais-shared-services`)
**Type:** Research-only. No code edits. No commits. Output = markdown deliverable.

---

## 1. The question being answered

> **"Do I have exactly ONE repo that holds all current and future shared services — or do I have multiple overlapping ones that should be consolidated?"**

Dennis has surfaced the following candidates that might all be doing "shared services":

1. **`C:\Users\denni\PycharmProjects\cais-shared-services`** — the declared canonical (`caistech/cais-shared-services`)
2. **`C:\Users\denni\PycharmProjects\packages\`** — local-only non-git sibling dir containing `corporate-ai-common/` and `translation/`
3. **`C:\Users\denni\PycharmProjects\platform-trust`** — role unclear
4. **`C:\Users\denni\PycharmProjects\property-services`** — GitHub describes it as "Shared property intelligence platform — Supabase edge functions + SDK for F2K, DealFindrs, MMC Build"
5. **Potentially others** — any directory with names like `-shared`, `-common`, `-sdk`, `-lib`, `-core`, `-services`, `packages`, `apps`

The audit's job: **inventory these, classify each, and produce a concrete consolidation plan.**

Not in scope: finding new duplicates across the other ~35 repos. That's a separate later audit.

---

## 2. Classification framework

For each candidate, classify it as one of:

| Class | Meaning | Example | Belongs where |
|---|---|---|---|
| **A. Shared library (npm package)** | Import-time code reused by multiple repos | `@caistech/elevenlabs-convai` | `cais-shared-services/packages/*` |
| **B. Client SDK for a deployed service** | Lib that wraps calls to a service you run | A TS client for property-services edge functions | `cais-shared-services/packages/*` (the SDK); service stays separate |
| **C. Deployed service (own runtime)** | Has its own deploy target (Supabase edge functions, standalone Next.js app, API server, background worker) | `property-services` edge functions | Separate repo — NOT in cais-shared-services |
| **D. Staging / historical** | Older copy being migrated from or abandoned | `packages/corporate-ai-common/` probably | Delete once nothing points to it |
| **E. Single-consumer code mislabelled as "shared"** | Has "shared"/"common" in its name but only one repo imports it | e.g. a helper lib used by exactly one app | Fold back into that one repo |
| **F. Uncertain / needs inspection** | Can't tell without reading | — | Report as uncertain, don't guess |

**Key rule**: class A/B belong inside `cais-shared-services` as packages. Class C stays separate (deployed things aren't npm packages). Class D/E should be removed or absorbed.

---

## 3. Required output

**Path:** `C:\Users\denni\PycharmProjects\cais-shared-services\docs\AUDIT_RESULTS_2026-04.md`

**Target length:** 1,200–2,500 words. Fewer is fine if evidence is clear.

### 3.1 One-line verdict (first line of the doc)
Example: *"You currently have 3 shared-libraries fragmentation points: cais-shared-services (canonical), packages/corporate-ai-common (should delete after migrating 2 remaining files), and property-services/sdk (should split — move SDK to @caistech, keep edge functions separate)."*

### 3.2 Inventory table (required)
Every candidate from the list in Section 4 below, as rows:

| Path | Git state | Class (A–F) | Purpose (1 line) | Consumed by (list of repos) | Recommendation |
|---|---|---|---|---|---|

Populate EVERY row. "Unknown" is only acceptable if the candidate genuinely requires user input; flag it in Section 3.5.

### 3.3 Consolidation plan per candidate
For anything classed A, B, D, or E, provide:
- Current location
- Target location (e.g. `cais-shared-services/packages/<name>/src/`)
- What moves (file list or dir)
- What stays behind (e.g. deployed service in original repo)
- Dependencies it creates (imports, env vars)
- Order of operations (do this before that)
- Rough effort: XS (<30 min) / S (30 min–2 h) / M (half day) / L (1+ day)

For class C, state the boundary: "this repo deploys X; its lib code at `path/` is a viable `@caistech/...` SDK package."

### 3.4 Overlap map (required)
A section showing any code that exists in ≥2 candidate locations (especially between `cais-shared-services/packages/*` and `packages/corporate-ai-common/packages/*`). Even ~60% similarity counts.

Evidence: file paths + diff stat or sample line counts.

### 3.5 Unknowns / decisions needed from Dennis
Short list. One line each. These become the blocking questions before execution.

### 3.6 Proposed final state
A tree showing what the shared-services landscape should look like in 2 weeks:

```
caistech/cais-shared-services/
├── packages/
│   ├── elevenlabs-convai/          # already live
│   ├── elevenlabs-voice/           # planned
│   ├── <new ones from this audit>
│   └── ...

dennissolver/property-services/      # deployed edge functions — stays separate
├── functions/                       # Supabase edge functions, own deploy
└── sdk/ → MOVE TO @caistech/property-services-sdk

DELETE:
- C:\Users\denni\PycharmProjects\packages\corporate-ai-common\   (superseded)
- <anything else obsolete>
```

---

## 4. Candidates — baseline list (audit must cover all, plus discover more)

Start with these. Use the method in Section 5 to find any others.

### 4.1 Confirmed candidates (known from this session's history)

| # | Path | Known facts | What to confirm |
|---|---|---|---|
| a | `C:\Users\denni\PycharmProjects\cais-shared-services` | Canonical. 7 declared packages: elevenlabs-convai (published 0.1.3), elevenlabs-voice, openrouter-client, language-config, stt-noise-filter, agents, security. Top-level `lib/`, `components/`, `integrations/`, `migrations/`, `styles/` still hold un-extracted content. | What's canonical vs still-pending migration inside its own tree |
| b | `C:\Users\denni\PycharmProjects\packages\corporate-ai-common` | Local-only (not a git repo). Was the template source for cais-shared-services. Has been partially migrated (elevenlabs-convai etc.). | Which of its files/dirs still have no equivalent in cais-shared-services |
| c | `C:\Users\denni\PycharmProjects\packages\translation` | Local-only sibling of corporate-ai-common | Purpose? Consumers? Should it become `@caistech/translation`? |
| d | `C:\Users\denni\PycharmProjects\platform-trust` | Referenced in `CLAUDE.md` as a REGULATED project. "Platform Trust middleware" commits also seen in Kira + Connexions | Is this the *service*, and the middleware in Kira/Connexions is the *client*? Or are Kira/Connexions copy-pasting this repo's code? |
| e | `C:\Users\denni\PycharmProjects\property-services` | GitHub description: "Shared property intelligence platform — Supabase edge functions + SDK for F2K, DealFindrs, MMC Build" | What's the SDK portion (should migrate) vs the edge functions (should stay)? |

### 4.2 Discoverable candidates — search for more

Scan `C:\Users\denni\PycharmProjects\*` for directories whose names match any of these patterns:
- `*-shared`, `*-common`, `shared-*`, `common-*`
- `*-sdk`, `*-client`, `*-lib`
- `*-core`, `*-kit`, `*-tools`, `*-utils`
- `*-services`, `services-*`
- `packages`, `apps`, `libs`
- Anything containing `ai-common`, `ai-kit`, `ai-tools`, `ai-sdk`

Then inspect each hit that matches a candidate profile. Known suspects to investigate regardless:
- `agentic-os`, `Agentic-OS-old`, `apps`, `coordination`, `llm-council`, `nudge-core`, `property-analysis-sdk`, `easy-claude-code`, `storefront-mcp`

For each discovered candidate, apply the Section 2 classification.

---

## 5. Method

### 5.1 Inspection checklist per candidate

For each candidate, gather:
1. **Is it a git repo?** `git -C <path> rev-parse --git-dir` → yes/no.
2. **GitHub description** (if git): `gh repo view <owner>/<name> --json description,isPrivate`.
3. **Top-level structure**: `ls` of root, names of top-level dirs and files.
4. **Presence of a `package.json`?** If yes, read `name`, `private`, `main`, `files`.
5. **Any `packages/` subdirectory** (i.e., is this itself a monorepo of shared packages)?
6. **What kind of artifact does it produce?** Library code (TS/JS source, exportable), deployed thing (Next.js app, Supabase functions, worker), mixed?
7. **Consumer search** — grep other repos for imports or refs to this candidate. Examples:
   - For `property-services`: grep all repos for `property-services`, `@caistech/property`, imports from anything suggestive
   - For `platform-trust`: grep for `platform-trust`, `platformTrust`, HTTP calls to platform-trust URLs
   - For `packages/corporate-ai-common/*`: grep for path references or bare imports like `@cais/*`, `corporate-ai-common`
8. **Last meaningful commit** — is this actively maintained or abandoned?

### 5.2 Overlap detection between candidates

For candidates with similar-named subdirs (e.g., `corporate-ai-common/elevenlabs-convai/` vs `cais-shared-services/packages/elevenlabs-convai/src/`):
- `diff -rq` to find unique-to-each-side files
- For same-named files, `diff --stat` to see divergence scale
- Record: "X files identical, Y files changed, Z files only in side A"

### 5.3 Parallelization

Dispatch `Explore` agents for the slower parts:
- One `Explore` agent per candidate path, charged with answering the Section 5.1 checklist for that candidate
- One `Explore` agent for the pattern-based discovery (Section 4.2)
- One `Explore` agent for cross-repo consumer searches (Section 5.1 step 7)

Run them in parallel (single message, multiple Agent tool calls). Gather reports, then write the deliverable on the main thread.

### 5.4 What NOT to do

- **Don't open every file.** Use `ls`, `glob`, `grep` at scale.
- **Don't try to migrate anything.** Audit-only.
- **Don't make assumptions about intent.** If two repos have similar-named folders but you can't tell if they were ever meant to be the same thing, say so in §3.5.
- **Don't skip the local-only `packages/` directory** just because it's not a git repo — it's a critical node in the fragmentation picture.

---

## 6. Evaluation

Output is good if Dennis can read it in <10 minutes and walk away with:
- A clear count: "You have N shared-service repos, of which X should consolidate."
- A tightly ordered action list: merge/migrate/keep-separate/delete per candidate.
- Zero unresolved ambiguity about class A vs C (the "should it be a package vs a deployed service?" question must be answered for every candidate).

Output is bad if:
- It re-derives what's already in §2 of the sequencing memory (`project_cais_shared_services_sequence.md`) without adding new info.
- It hedges on the verdict.
- It investigates code duplication inside consumer repos (that's the broader audit, not this one).
- It proposes `cais-shared-services` should absorb things that are clearly deployed services (class C).

---

## 7. Known prior knowledge — don't re-derive

- `cais-shared-services` was set up in 2026-04-17 from `corporate-ai-common` as the template.
- Top-level legacy dirs (`elevenlabs-convai/`, `agents/`, `security/`) were DELETED from cais-shared-services in commit `872cf36`; remaining top-level dirs there (`lib/`, `components/`, `integrations/`, `migrations/`, `styles/`) are pending extraction into packages.
- `@caistech/elevenlabs-convai@0.1.3` is published and installed by F2K (committed 2026-04-17).
- Kira + Connexions also shared this code and have the bug fix applied but not yet migrated to import the package (documented in memory).
- The sequencing memory lists these as planned future packages: `@caistech/compliance-guardrails`, `@caistech/corporate-components`, `@caistech/abn-lookup`, `@caistech/openrouter-client`, `@caistech/ghl-client`. The audit should reconcile these planned extractions against what `property-services`, `platform-trust`, `packages/*`, and other candidates actually contain — some may already exist there.

---

## 8. Session priming (paste at start of next session)

```
Doing a shared-services repo consolidation audit. Read
C:/Users/denni/PycharmProjects/cais-shared-services/docs/AUDIT_SPEC_2026-04.md
in full before anything else.

The core question: do I have ONE shared-services repo, or several
parallel/overlapping ones that need to be reconciled?

Candidates to inventory (minimum):
  - cais-shared-services
  - packages/corporate-ai-common, packages/translation
  - platform-trust
  - property-services
  - plus any others matching the discovery patterns

Output: docs/AUDIT_RESULTS_2026-04.md per the spec.
No code edits. No commits.

Confirm you've read the spec and list your parallel Explore
agent fan-out plan before dispatching.
```

---

## 9. Non-goals

- Finding code duplication inside consumer repos (F2K, Kira, Connexions, InvestorPilot, etc.) — that's the broader audit, not this one.
- Deciding what the NEXT `@caistech/*` extraction should be — the sequencing memory already covers that.
- Publishing or consuming anything.
- Fixing what you find. Report only.
