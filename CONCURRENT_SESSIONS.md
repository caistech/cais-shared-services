# CONCURRENT SESSIONS — working alongside other agents in the same portfolio (canonical)

> **What this is.** The rules for a coding session that is **not the only one running**. Several
> Claude Code sessions routinely work across this portfolio at the same time — different repos, and
> sometimes *the same working tree* — with **no channel between them**. They coordinate only through
> git artefacts, which means every one of them can see the others' work and none of them can be told
> anything by the others.
>
> **Why it exists.** Written 2026-08-15 after a session in the orchestrator repo concluded that a
> session in the Kira repo was dead, and prepared to commit its uncommitted work. It was alive and
> had been committing steadily for forty minutes. The evidence used could not have distinguished the
> two cases even in principle — see §2. Nothing was lost, because a background watch fired first.
>
> **Severity: auth-pattern.** Writing into another session's repo on a wrong liveness call is a
> **bug, not a discourtesy** — it destroys work that has no other copy.
>
> **Home & loading.** Lives in `cais-shared-services` so every session in every repo reads the same
> copy. **Last updated:** 2026-08-15.

---

## 0. The rules

| # | Rule | Why |
|---|---|---|
| **C1** | **Never commit, checkout, stash, reset or push in a repo this session does not own.** Reading is always fine. | Another agent may be mid-commit. Whoever writes first decides what survives. |
| **C2** | **Establish liveness from git refs and the dirty count, never from file timestamps.** | `git commit` does not touch mtimes. §2. |
| **C3** | **A cross-repo contract is not shipped until BOTH halves are.** Check the other side before reporting a feature works. | §3. |
| **C4** | **Ask which session owns a thing.** The operator can see their windows; a session can only see artefacts. | §4. |
| **C5** | **If you must act in another repo, split by workstream and commit only what you have read in full.** Never one blob. | §5. |

---

## 1. The topology

Observed 2026-08-15, and normal rather than exceptional:

- Sessions live in `orchestrator`, `Kira`, `cais-shared-services` and the cockpit
  (`corporate-ai-solutions`) **simultaneously**.
- **Two agents shared one working tree** (`Kira`, branch `test-billing`). Both were editing, and both
  wrote into `docs/BUILD_REGISTER.md` — section O from one, section Q from the other, in the same
  uncommitted file.
- One session's uncommitted tree held **three unrelated workstreams at once**: a valuation model
  change, a Google-connect feature, and a new Practice Intelligence capability.

Consequence: "the working tree is dirty" tells you almost nothing about *who* or *what*. The unit of
work is the workstream, not the repo.

---

## 2. The liveness trap (C2) — the reason this document exists

**Watch what committing moves. Do not watch what editing moves.**

```bash
# The signals. Any one of these moving means the session is alive.
git rev-parse HEAD                    # a local commit — usually the FIRST thing to move
git rev-parse origin/<their-branch>   # a push
git status --porcelain=v1 | wc -l     # the dirty count falling
```

**What failed.** A session checked file mtimes across every dirty path — tracked and untracked —
and found nothing written for 44 minutes. It reported the other session as gone.

**Why that evidence was worthless:** `git commit` **reads** the working tree; it does not write to
those files. A session that finishes editing and then spends forty minutes staging, composing commit
messages, running tests and writing its register produces **zero mtime changes**, and is byte-for-byte
indistinguishable from one that died. Mtime measures *editing*, not *activity*.

**Two design notes for the watch itself**, both earned the same day:

- **Widen the trigger beyond what the other session names.** It said to watch `origin/main` and the
  dirty count. The work was on `test-billing`, so the **local commit (HEAD)** fired first and
  `origin/main` never moved at all. Watch HEAD, their branch, main, and the dirty count.
- **Report the quiet case too.** A watch that only speaks on movement is indistinguishable from a
  watch that has died. End with an explicit *"no movement after N minutes"*.

Use `Bash(run_in_background)` with an `until`-style loop that exits on the condition — one
notification, no polling. Poll at ~60s; a `git fetch` is a network call.

---

## 3. Cross-repo contracts (C3)

Half-landed contracts are the normal failure here, because each session sees its own half go green.

**The worked example.** The orchestrator shipped per-tenant Gmail scopes: the connect ticket carries
`gmail: 'none' | 'draft' | 'read'`, absent meaning `none`. Committed, pushed, CI green. But the half
that **mints** the ticket lives in Kira, and it was uncommitted. Until it landed, Kira never sent the
field, every ticket read `none`, and Gmail drafts silently never worked — on a repo whose own tests
all passed.

And a third state exists beyond "both halves landed": Kira's half *did* land as a type and a
component, while **nothing imported the component and the one real call site never passed the
field**. Committed, tested, green, and still inert. So:

> Shipping a contract means the type, the caller, **and something that renders the choice**. Grep for
> the importers before reporting a feature done.

---

## 4. Identifying a session (C4)

A session cannot see another session's window, only its artefacts. Identify by what it is producing —
"the one whose recent output mentions the valuation guide" — and say plainly that you cannot do better
than that. Do not infer from the fact that a message arrived: on 2026-08-15 the session that pasted
the status note was itself one of the two agents in the shared tree, and was committing the *other*
one's work alongside its own.

---

## 5. If you must act in another repo (C5)

Only on an explicit instruction, and only after C2 says it is genuinely idle. Then:

1. **Read every file you are about to commit, in full.** Not the diffstat.
2. **Split by workstream**, never one blob — they carry different risk and want different reviewers.
3. **Leave shared narrative files alone.** A register or decisions log that two sessions have both
   written into cannot be safely attributed by a third.
4. **Re-check liveness immediately before writing.** The gap between deciding and doing is exactly
   where the other session wakes up.

---

## 6. What this unifies

- **`TESTING_STANDARD.md`** — "state the assertion, not the conclusion" applies to liveness claims
  too: *"no file written for 44 minutes"* is the assertion; *"the session is gone"* is a conclusion
  the assertion does not support.
- **`DELEGATION_STANDARD.md`** governs the owner↔assistant agreement inside the product. This governs
  agent↔agent coordination during development. They do not overlap.
