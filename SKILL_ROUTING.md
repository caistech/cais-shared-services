# Skill Routing — the full skill/tool inventory + "ask-first" map (read at session start)

> **What this is.** The portfolio's **single catalogue of every installed skill/tool**, mapped to
> the *moment in the work* that should make the coding session reach for it — and the convention
> that the session **asks "do you want to use /X for this?"** at that moment instead of silently
> plowing ahead or (worse) forgetting the skill exists.
>
> **Why it exists.** ~60 skills are installed; in practice a handful get used and the rest are
> invisible. Half-remembered skills that were never installed (`/confidence`, `/mirror`,
> `/persona`…) get asked for; genuinely useful installed ones (`/verify`, `/simplify`, `/spec`,
> `deep-research`, `/voice-auditor`) never get reached for. This doc makes the *real* inventory the
> source of truth and turns "which skill fits here?" into a mechanical prompt at each stage-change.
>
> **Home & loading.** Lives in `cais-shared-services` so it's portable + teammate/cloud-readable;
> **auto-imported into the global `CLAUDE.md`** so every agent in every repo starts knowing it. It
> extends (does not replace) the CLAUDE.md "Intelligent Skill Application" + "Skill routing"
> sections — those cover the gstack core; this covers *everything installed*.
>
> **Maintenance rule.** When a new skill is installed or an existing one changes what it's for,
> update the row here in the same session — an un-catalogued skill is an invisible skill.
>
> **Last updated:** 2026-08-02 (+8 design skills; the design-system ownership decision — §2 "Design
> system").

---

## 0. The ask-first convention (how this behaves)

At a **stage-change in the work** — not mid-flow — the session names the one or two skills built
for that stage and asks before invoking:

> *"This looks like a good point to run `/code-review` before committing — want me to?"*

Rules of engagement:
- **Ask at the transition, act on a yes.** One nudge per stage-change, not a running commentary.
- **One or two skills max per prompt.** Name the highest-signal skill for the moment; don't list ten.
- **Safety skills are the exception — apply, don't ask.** `/careful`, `/freeze`, `/guard`,
  `/investigate` fire on their trigger without asking (they're in the CLAUDE.md Safety Rules).
- **"Stop suggesting" turns it off** for the rest of the session. "Suggest again" turns it back on.
- **Don't suggest a skill that isn't installed.** If asked for one that isn't here (`/confidence`,
  `/mirror`, `/persona`, `/interview`), say so and offer the closest installed equivalent from §2.
- **The catalogue is the truth.** If memory says a skill exists but it's not in §2/§3, it's not
  installed — check here before promising it.

---

## 1. The coding loop — which skill at which stage (the primary map)

A build moves through stages; each stage has a skill built for it. This is the spine — §2/§3 are
the full reference behind it.

| Stage in the work | The session should ask about… | Why |
|---|---|---|
| **New idea / feature / "should we build X"** | `/office-hours` | Think before building — YC-style problem/solution pressure-test. |
| **Turning vague intent into a spec** | `/spec` | Five-phase intent → precise executable spec. |
| **Plan written, before any code** | `/plan-eng-review` · `/plan-ceo-review` · `/plan-design-review` · `/plan-devex-review` | Validate architecture / scope / UX / DX *before* the diff exists. |
| **Full pre-code review pipeline** | `/autoplan` | Runs the four plan reviews sequentially with auto-decisions. |
| **About to touch a risky/irreversible command** | `/careful` *(auto)* | Warns on `rm -rf`, `DROP TABLE`, force-push, `git reset --hard`. |
| **Debugging a non-trivial bug** | `/investigate` *(auto-freezes)* | Root-cause investigation, scoped to the module. |
| **Want to lock edits to one dir while debugging** | `/freeze` / `/guard` / `/unfreeze` | Prevent stray edits outside the module under repair. |
| **Non-trivial edit just made** | `/verify` | Drive the affected flow end-to-end — observe behaviour, not just typecheck. |
| **Diff ready, before commit** | `/code-review` | Correctness bugs + reuse/simplification findings on the working diff. |
| **Diff ready, quality-only cleanup** | `/simplify` | Reuse / simplification / efficiency / altitude — no bug hunt. |
| **Pre-landing PR review (paranoid pass)** | `/review` | gstack pre-landing bug + logic review. |
| **Security-sensitive change** | `/security-review` · `/cso` | Security review of the branch; CSO mode for deeper posture. |
| **Starting or restyling a UI and no design system exists** | the **design-system chain** (§2) | Author it ONCE, then commit it. Do NOT reach for a generic design skill first — without a system every session re-derives the look, which is what makes a product read "inconsistent". |
| **UI built, before "done"** | `/design-review` · `/naive-tester` · `/qa` · `web-design-guidelines` | Visual/interaction QA · human-persona walkthrough · full browser QA · Web Interface Guidelines audit. |
| **Voice agent in the build** | `/voice-auditor` | MANDATORY before voice sign-off — placement + memory-loop check (both portals). |
| **Public web surface, distribution question** | `/gtm-auditor` | Does the output create the next user? D3 distribution evidence. |
| **DX / developer-facing surface** | `/devex-review` | Live developer-experience audit. |
| **A chart / dashboard / data viz** | `dataviz` | Read BEFORE writing any chart code — one coherent visual system. |
| **Publishing a shareable web page/report** | `Artifact` + `artifact-design` | Load `artifact-design` first to calibrate design investment. |
| **Ready to merge/ship** | `/ship` · `/land-and-deploy` | Detect base → tests → review → bump → PR; land + deploy. |
| **Post-deploy watch** | `/canary` · `/benchmark` · `/health` | Canary monitor · perf regression · code-quality dashboard. |
| **After shipping** | `/document-release` · `/document-generate` · `/retro` | Release notes · fill doc gaps · sprint retrospective. |
| **Pausing / context running out** | `/checkpoint` · `/context-save` (restore with `/context-restore`) | Save the working state as a "save game" that survives session loss. |
| **Second opinion from another model** | `/codex` | OpenAI Codex CLI wrapper — a cross-model check. |
| **Deep multi-source research question** | `deep-research` | Fan-out web search + adversarial verify + cited report. |

---

## 2. Full inventory — everything installed (the reference behind §1)

Grouped by what the skill is *for*. `(auto)` = applies without asking (safety). Everything else is
**ask-first**.

### Think / plan (before code)
| Skill | When |
|---|---|
| `/office-hours` | New idea/feature — pressure-test the problem before building. |
| `/spec` | Vague intent → precise executable spec (five phases). |
| `/plan-ceo-review` | Validate scope/strategy at product level. |
| `/plan-eng-review` | Validate architecture + approach. |
| `/plan-design-review` | Validate UX/design decisions. |
| `/plan-devex-review` | Validate developer-experience of the plan. |
| `/plan-tune` | Self-tune the plan-review question sensitivity. |
| `/autoplan` | Run the four plan reviews sequentially with auto-decisions. |
| `/design-consultation` | Propose a full design system (type/colour/layout/motion) mid-decision. **In the chain below this is step 2, not step 1.** |
| `/design-shotgun` | Generate multiple design variants + comparison board. |

### Design system — the authoring chain (8 skills installed 2026-08-02)

**⚠️ Read the decision before invoking any of these, or two skills will give two answers.** Both
`/design-consultation` and `design-system` match on the phrase *"design system"*.

**DECIDED 2026-08-02 — option "C sequenced into D".** Run the chain **in this order**; the artefact it
produces then becomes **ours**:

| # | Step | Skill | Why this one |
|---|---|---|---|
| 1 | **Author** a data-backed starting point | `ui-ux-pro-max` (`search.py --design-system --persist`) | Deterministic — same query, same answer. 84 styles · 192 palettes · 74 font pairings · 98 UX rules, with explicit anti-patterns. Cheap: no LLM in the loop. |
| 2 | **Interrogate** it against the real ICP | `/design-consultation` | Step 1 *selects* from known styles; it does not know your customer. **Not optional** — a smoke run for Kira returned AI-purple/pink and a landing pattern whose third section was "tailored testimonials", for an ICP of 60–70-year-old trade-business owners, recommending the exact thing that product had removed as an overclaim. |
| 3 | **Emit tokens + the validator** | `design-system` | Three-layer tokens (primitive→semantic→component) → `tokens.css`, plus **`validate-tokens.cjs`, which scans code for hardcoded values.** This is the load-bearing step: a `DESIGN.md` nobody validates is *prose with no mechanism*. |
| 4 | **Implement** | `ui-styling` | shadcn/ui + Tailwind; consumes component tokens → Tailwind config. ⚠️ Wants **Tailwind v4 + Vite**. A v3 repo is a breaking migration, not a setup step — decide it separately. |
| 5 | **Audit** | `/design-review` · `web-design-guidelines` | Designer's-eye (AI-slop, spacing, hierarchy) · Web Interface Guidelines + accessibility. |

**Then D — the end state that makes it stick:** the authored system is committed **here, in
`cais-shared-services`, as our own skill**, and every repo and agent mounts it. At that point the
skills above demote to *inputs*: the answer lives in the repo, not in a skill's judgement, so
"two skills, two answers" stops being possible. *Once it's in the repo you no longer need the
authoring tool.*

| Skill | When |
|---|---|
| `ui-ux-pro-max` | Step 1 above. Also a **lookup** — query the DB for palettes/font pairings/UX rules mid-build. ⚠️ Invoke by full path: `~/.claude/skills/ui-ux-pro-max/scripts/search.py` — the SKILL.md's `${CLAUDE_PLUGIN_ROOT}` path does **not** resolve for a direct install. Needs Python 3 (`python`, not `python3`, on this box). |
| `design-system` | Step 3 — tokens + `validate-tokens.cjs`. |
| `ui-styling` | Step 4 — shadcn/Tailwind. **Tailwind v4 only.** |
| `web-design-guidelines` | Step 5 — Vercel's Web Interface Guidelines audit ("review my UI", "check accessibility"). |
| `design` | Logo (55 styles), corporate identity programme, icons, social images. ⚠️ Calls **Gemini image models — needs an API key**, deliberately not configured. |
| `brand` | Brand voice, messaging frameworks, style guides, brand-consistency checks. |
| `design-system` → `slides` | Strategic HTML presentations with Chart.js, built on the tokens. |
| `banner-design` | Social/ad/hero/print banners. |

**Why these were installed at all:** the `ui-ux-pro-max-skill` repo is **seven skills, not one**, and
it nests them at `.claude/skills/<name>/SKILL.md` — three levels deep. A first attempt to "just use
these docs" silently did nothing, because Claude Code only discovers `~/.claude/skills/<name>/SKILL.md`,
exactly one level down. **Right folder, wrong depth, and it looks identical from the outside.**

### Build / edit-time
| Skill | When |
|---|---|
| `/verify` | After a non-trivial edit — drive the flow end-to-end, observe behaviour. |
| `/run` | Launch/drive this project's app to see a change working (or screenshot it). |
| `/investigate` *(auto)* | Non-trivial bug — root-cause, auto-freezes to the module. |
| `/freeze` · `/unfreeze` · `/guard` *(auto)* | Scope edits to one dir while debugging. |
| `/careful` *(auto)* | Guardrail before destructive/irreversible commands. |
| `/init` | Initialize a CLAUDE.md for a codebase that lacks one. |
| `/learn` | Record/manage project learnings. |
| `/design-html` | Finalise production-quality Pretext-native HTML/CSS. |

### Review / QA (before done)
| Skill | When |
|---|---|
| `/code-review` | Diff review: correctness + reuse/simplification (`--fix`/`--comment`/`ultra`). |
| `/simplify` | Quality-only cleanup on the diff (no bug hunt). |
| `/review` | Paranoid pre-landing PR bug + logic review. |
| `/security-review` · `/cso` | Security review of the branch · CSO posture mode. |
| `/design-review` | Designer's-eye visual/interaction QA (finds AI-slop, spacing, hierarchy). |
| `/naive-tester` | Human-persona walkthrough of a live product (friction, jargon, dead-ends). |
| `/voice-auditor` | Voice-agent placement + memory-loop audit (MANDATORY pre voice sign-off). |
| `/gtm-auditor` | Distribution-loop audit — does output create the next user? (D3 evidence). |
| `/devex-review` | Live developer-experience audit. |
| `/qa` · `/qa-only` | Full browser QA (+ fix) · report-only QA. |
| `/health` | Code-quality dashboard. |
| `/benchmark` · `/benchmark-models` | Perf-regression detection · cross-model skill benchmark. |

### Browser / web
| Skill | When |
|---|---|
| `/browse` | **All** web browsing (never use `mcp__claude-in-chrome__*` directly). |
| `/connect-chrome` · `/open-gstack-browser` · `/pair-agent` | Real/visible Chrome control · AI-controlled browser · pair a remote agent. |
| `/scrape` · `/skillify` | Pull data from a page · codify a successful scrape into a permanent skill. |
| `/setup-browser-cookies` | Import real-browser cookies into the headless session. |
| `deep-research` | Multi-source, fact-checked, cited research report. |

### Ship / deploy / post-ship
| Skill | When |
|---|---|
| `/ship` · `/land-and-deploy` | Merge-ready PR + release · land and deploy. |
| `/landing-report` · `/setup-deploy` | Queue dashboard · configure deploy settings. |
| `/canary` | Post-deploy canary monitoring. |
| `/document-release` · `/document-generate` | Release notes/docs · generate missing docs. |
| `/retro` | Weekly/sprint engineering retrospective. |

### State / session / config
| Skill | When |
|---|---|
| `/checkpoint` · `/context-save` · `/context-restore` | Save/resume working state across sessions. |
| `/loop` · `/schedule` | Run a prompt/command on an interval · schedule a cloud cron agent. |
| `/update-config` | Configure the harness via settings.json (hooks, permissions, env). |
| `/keybindings-help` · `/fewer-permission-prompts` | Customise shortcuts · trim permission prompts. |
| `/gstack-upgrade` · `/setup-gbrain` · `/sync-gbrain` | Upgrade gstack · set up / sync the code brain. |

### Output / media / reference
| Skill | When |
|---|---|
| `dataviz` | BEFORE any chart/graph/dashboard/plot code — coherent visual system. |
| `Artifact` + `artifact-design` | Publish a shareable web page/report (load `artifact-design` first). |
| `/make-pdf` | Turn a markdown file into a publication-quality PDF. |
| `/codex` | Second opinion from a different model. |
| `claude-api` | Reference before any Claude/Anthropic API / model-id / pricing work. |

### iOS (only in an iOS repo)
| Skill | When |
|---|---|
| `/ios-qa` · `/ios-design-review` · `/ios-fix` · `/ios-clean` · `/ios-sync` | Live-device QA · design audit · autonomous fixer · strip debug bridge · resync bridge. |

### Vercel (only when the task is genuinely Vercel-shaped)
The `vercel:*` skills (`vercel:deploy`, `vercel:env`, `vercel:nextjs`, `vercel:ai-sdk`,
`vercel:vercel-functions`, `vercel:shadcn`, `vercel:vercel-firewall`, …) are **on-demand**: reach
for the specific one only when the current task is that Vercel topic, per the session Vercel
guidance. Don't push Vercel migrations that don't help the task at hand.

---

## 3. Not installed — don't offer these (the "half-remembered" list)

These get asked for but are **not** callable skills in this environment. If one comes up, say it's
not installed and offer the closest equivalent:

| Half-remembered | Closest installed equivalent |
|---|---|
| `/confidence` | — (state confidence inline; no skill for it) |
| `/mirror` | `/codex` (second-model opinion) or `/code-review ultra` |
| `/interview` | `/naive-tester` (persona walkthrough) or `/office-hours` |
| `/persona` | `/naive-tester` (picks a persona for the walkthrough) |
| `/artifacts` | `Artifact` tool + `artifact-design` skill |

Keep this list current: the moment one of these becomes a real installed skill, move its row up to §2.

---

**One line:** *~70 skills are installed; this doc is their real inventory + the stage that should
trigger each, and the session asks "want me to run /X?" at that stage — safety skills apply
without asking, and anything not listed here isn't installed.*
