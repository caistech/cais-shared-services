# Skill Routing — your AI agent's real toolbox + an "ask-first" map

> **The free template from the "SKILLS" post.** Two things fix the "60 installed, 5 used" problem:
> a **living inventory** of the skills you actually have, and an **ask-first convention** so your
> agent offers the right one at the right moment instead of forgetting it exists.
>
> **How to install it (30 seconds):**
> 1. Save this file into your project (e.g. `SKILL_ROUTING.md`, or in `.claude/`).
> 2. Paste the snippet below into your `CLAUDE.md` (or `AGENTS.md` / whatever instruction file
>    your agent auto-loads) so it loads every session:
>
>    ```
>    ## Skill routing
>    Read SKILL_ROUTING.md at the start of every session. At each stage-change in the work,
>    ASK "want me to run /X for this?" before invoking the skill that fits that stage — one
>    nudge per stage, not a running commentary. Safety skills apply WITHOUT asking. If I ask
>    for a skill that isn't listed there, tell me it's not installed and offer the closest one.
>    "Stop suggesting" turns the nudges off for the session.
>
>    @./SKILL_ROUTING.md
>    ```
> 3. **Edit the tables below to match YOUR installed skills.** This is a starter set — delete
>    rows for skills you don't have, add rows for the ones you do. An inventory only works if
>    it's *your* inventory.
>
> ---

## 0. The ask-first convention (how it behaves)

At a **stage-change in the work** — not mid-flow — the agent names the one or two skills built for
that stage and asks before invoking:

> *"This looks like a good point to run the diff review before committing — want me to?"*

- **Ask at the transition, act on a yes.** One nudge per stage-change, not a running commentary.
- **One or two skills max per prompt.** Highest-signal skill for the moment; don't list ten.
- **Safety skills are the exception — apply, don't ask.** Anything that catches destructive
  commands or scopes edits fires on its trigger without asking.
- **"Stop suggesting" turns it off** for the rest of the session; "suggest again" turns it back on.
- **Never offer a skill that isn't installed.** If asked for one not in this file, say so and offer
  the closest installed equivalent from §2.
- **This file is the source of truth.** If something says a skill exists but it's not in §2, it's
  not installed.

---

## 1. The coding loop — which skill at which stage (the primary map)

A build moves through stages; each stage has a skill built for it. Edit this to your toolbox.

| Stage in the work | Ask about… | Why |
|---|---|---|
| **New idea / "should we build X"** | your ideation/brainstorm skill | Pressure-test the problem before building. |
| **Vague intent → a spec** | your spec skill | Turn intent into a precise, executable spec. |
| **Plan written, before code** | your plan-review skill(s) | Validate architecture / scope / UX *before* the diff exists. |
| **About to run a risky command** | your safety skill *(auto)* | Warn on `rm -rf`, `DROP TABLE`, force-push, `git reset --hard`. |
| **Debugging a non-trivial bug** | your investigate skill *(auto)* | Root-cause, scoped to the module. |
| **Non-trivial edit just made** | your verify skill | Drive the affected flow end-to-end — observe behaviour, not just typecheck. |
| **Diff ready, before commit** | your code-review skill | Correctness bugs + reuse/simplification on the working diff. |
| **Diff ready, cleanup only** | your simplify skill | Reuse / simplification / efficiency — no bug hunt. |
| **Security-sensitive change** | your security-review skill | Review the branch for security issues. |
| **UI built, before "done"** | your design-review / QA skill | Visual/interaction QA + a human-persona walkthrough. |
| **A chart / dashboard / data viz** | your dataviz guidance | Read BEFORE writing any chart code — one coherent visual system. |
| **Publishing a shareable page/report** | your artifact/publish skill | Load design guidance first, then publish. |
| **Ready to merge / ship** | your ship skill | Tests → review → PR → release in one flow. |
| **After shipping** | your docs / retro skill | Release notes · fill doc gaps · retrospective. |
| **Pausing / context running out** | your checkpoint skill | Save the working state so the next session resumes cleanly. |
| **Deep research question** | your research skill | Multi-source, fact-checked, cited report. |

---

## 2. Full inventory — YOUR installed skills

List every skill you have, grouped by what it's for. `(auto)` = applies without asking (safety).
Everything else is **ask-first**. Below is a common starter set — **replace with your own.**

### Think / plan (before code)
| Skill | When |
|---|---|
| `/office-hours` *(gstack)* | New idea — pressure-test the problem before building. |
| `/spec` *(gstack)* | Vague intent → precise executable spec. |
| `/plan-eng-review` · `/plan-ceo-review` *(gstack)* | Validate architecture · scope before code. |

### Build / edit-time
| Skill | When |
|---|---|
| `/verify` *(native)* | After a non-trivial edit — drive the flow, observe behaviour. |
| `/run` *(native)* | Launch/drive the app to see a change working. |
| `/investigate` *(gstack, auto)* | Non-trivial bug — root-cause, auto-scopes to the module. |
| `/careful` · `/freeze` · `/guard` *(gstack, auto)* | Guard destructive commands · scope edits to one dir. |

### Review / QA (before done)
| Skill | When |
|---|---|
| `/code-review` *(native)* | Diff review: correctness + reuse/simplification (`--fix`/`--comment`). |
| `/simplify` *(native)* | Quality-only cleanup on the diff (no bug hunt). |
| `/security-review` *(native)* | Security review of the branch. |
| `/review` *(gstack)* | Paranoid pre-landing PR review. |
| `/design-review` · `/naive-tester` · `/qa` *(gstack)* | Visual QA · human-persona walkthrough · full browser QA. |

### Browser / research / output
| Skill | When |
|---|---|
| `/browse` *(gstack)* | All web browsing. |
| `deep-research` *(native)* | Multi-source, fact-checked, cited research report. |
| `dataviz` *(native)* | BEFORE any chart/graph/dashboard code — coherent visual system. |
| `Artifact` + `artifact-design` *(native)* | Publish a shareable web page/report (design guidance first). |

### Ship / deploy / post-ship
| Skill | When |
|---|---|
| `/ship` · `/land-and-deploy` *(gstack)* | Merge-ready PR + release · land and deploy. |
| `/document-release` · `/retro` *(gstack)* | Release notes · sprint retrospective. |
| `/checkpoint` · `/context-save` *(gstack)* | Save/resume working state across sessions. |

### Config / session
| Skill | When |
|---|---|
| `/update-config` *(native)* | Configure the harness (hooks, permissions, env vars). |
| `/loop` · `/schedule` *(native)* | Run a command on an interval · schedule a cron agent. |

> **Note:** *(native)* = ships with Claude Code. *(gstack)* = the free gstack skill pack
> (github.com/garrytan/gstack). Delete the packs you don't use; add your own MCP/custom skills.

---

## 3. Not installed — don't offer these (the phantom list)

The single highest-value section. List the skills you *keep asking for* that aren't actually
installed, so the agent stops promising them and offers the real equivalent instead. Examples:

| Half-remembered | Closest installed equivalent |
|---|---|
| `/confidence` | — (state confidence inline; no skill) |
| `/persona` / `/interview` | `/naive-tester` (persona walkthrough) or `/office-hours` |
| `/mirror` | a second-model / code-review pass |

Keep it current: the moment one becomes real, move its row up to §2.

---

**One line:** *your agent's real toolbox in one auto-loaded file + a nudge at each stage-change +
an honest list of what's missing — so it offers the right skill at the right moment instead of
forgetting it, or promising one that doesn't exist.*
