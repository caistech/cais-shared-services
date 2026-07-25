# Briefing — voice/memory package, before you start

**Written 2026-07-26 from the BucketLyst session.** Read this before touching
`@caistech/elevenlabs-convai` or `portfolio-gate`. It exists because the two jobs you're about to
do overlap directly with work that landed today, and one of them would have silently no-opped.

Your stated plan:
1. Fix the `agent_id NOT NULL` contradiction in the package's `migration.sql`.
2. Push `probeMemoryLoop` into `@caistech/portfolio-gate` so it runs in every repo depending on the
   package.

Both are right. Four things you need to know first.

---

## 0. Pull before you touch anything

`cais-shared-services/main` moved **five commits** on 2026-07-25/26:

| commit | what |
|---|---|
| `adffdfa` | 0.7.2 source (had been PUBLISHED but never committed) — **touches `src/testing.ts`** |
| `74587a6` | catalog: convai 0.7.2 + the `agent_id` defect recorded in `SHARED_SERVICES.md` |
| `a5a7f4b` | `scripts/agents/` lockfile |
| `1a13b54` | **0.7.3** — the continuity check, changelog backfill, stale-test fix |

`src/testing.ts` is the file your item 2 revolves around. Editing it without pulling conflicts.

---

## 1. The registry was lying, and it's fixed — but understand what happened

**`0.7.2` was published, then more source was committed under the same version number and never
republished.** Git's `0.7.2` and the registry's `0.7.2` were different code.

The divergence was the **continuity check** in `probeMemoryLoop`. It existed only in git.

**This is why it mattered for your item 2 specifically:** had you wired `probeMemoryLoop` into
portfolio-gate before this was caught, every consumer would have installed the registry's
four-check build. The rollout would have gone green portfolio-wide while the fifth check — the one
that catches the failure users actually report — silently never ran. A verification rollout that
verifies less than it appears to is worse than none.

**Now fixed: `0.7.3` is published and verified by unpacking the registry's own tarball** (not a
local build — that's the check that was missing the first time). Registry `latest` = `0.7.3`.

**A same-version divergence is worse than an unfixed bug**, because npm will never resolve it —
nobody reinstalls a version they already have. If you change package source, bump and publish, and
verify by unpacking what the registry serves.

---

## 2. The continuity check will make your rollout go red — decide before, not after

`probeMemoryLoop` gained a fifth check in 0.7.3: **does a NEW conversation see the previous one.**

This is the failure a user actually notices — they come back and the agent greets them as a
stranger while their memory rows sit in the database. **Every other check can pass while this is
broken**, because save→recall inside one session says nothing about the next connect.

- `expectContinuity` defaults **TRUE**
- `startRoute` defaults `'start_conversation'`
- It **fails loudly rather than skipping quietly** — deliberate, because a silently-skipped
  continuity check is exactly how this class of bug shipped

**Consequence for your item 2:** any repo that doesn't mount a start route will fail this check the
moment portfolio-gate starts running the probe. That's a decision to make up front — mount the
route, or pass `expectContinuity: false` for those repos — not a surprise to triage on rollout day.
Recommendation: default it on and treat the reds as a worklist, since a repo without a start route
almost certainly has no working cross-session memory anyway. But make it a decision.

---

## 3. Your item 1 — put the fix in §11 UPGRADES, not just the CREATE TABLE

`migration.sql` says of itself, at the top:

> *"It is idempotent and doubles as an upgrade script for existing installs (see the UPGRADES
> section at the end)."*

That section is **§11, line 432**.

`convai_memory.agent_id` is declared `NOT NULL` at **line 107**. Fixing line 107 alone **only helps
new installs.** Every existing install — Kira prod, BucketLyst prod, anything else already on this
schema — keeps failing every memory write against the constraint, and keeps swallowing it behind a
**200**. Green status, nothing stored. That is the shape of the bug; a fix that doesn't reach
existing databases doesn't fix it.

So both:

```sql
-- line ~107, for new installs
agent_id UUID REFERENCES convai_agents(id) ON DELETE CASCADE,   -- drop NOT NULL

-- §11 UPGRADES, for every existing install
ALTER TABLE convai_memory ALTER COLUMN agent_id DROP NOT NULL;
```

**Why nullable is correct, not a workaround:** `resolveToolIdentity` returns `{ userId, agentId? }`
and deliberately omits `agentId` so recall scopes to the **user** and survives the agent being
re-provisioned. ElevenLabs never passes an agent id to a tool webhook either. The column was
`NOT NULL` while the package's own documented behaviour made it optional — the package contradicted
itself.

BucketLyst already patched this locally in its migration `0014`, so the UPGRADES line will be a
no-op there. That's the point of it being idempotent.

**When you fix it, flip the note in `SHARED_SERVICES.md`** — the convai row currently reads
`⚠️ KNOWN DEFECT (unfixed as of 2026-07-26)`. Leaving a stale "unfixed" warning is its own defect.

---

## 4. On your fork diagnosis — agreed, with one correction

You're right that Kira's `scripts/test-memory-loop.mjs` (202 lines, written during the
four-failed-fixes saga, before 0.7.0 shipped the guard) is a fork of something the package now
owns, and that this is the same disease one layer up. Delete it in favour of `probeMemoryLoop`.
Note it predates the continuity check, so it cannot be catching that case today.

**One correction:** don't count BucketLyst's `scripts/probe-memory-loop.mjs` as a second fork. It's
a ~40-line runner that *imports* `probeMemoryLoop` from the package and reads config from env. Once
portfolio-gate does this automatically it becomes redundant and should collapse into that — but
it isn't a reimplementation.

---

## The wider point, since you're the one fixing it

Six failures in the BucketLyst session. Only two were package logic. Two were the package
contradicting itself, and two were consumer-side traps the package knew about but didn't guard
(middleware 307ing the webhook POST to `/login` → 405; `Permissions-Policy: microphone=()` denying
the mic to its own origin).

The unifying cause: **the package ships the parts and nothing that proves the assembled loop
works.** Four of the six live in the seam between package, consumer middleware, consumer response
headers, and consumer database — invisible to any unit test, because a unit test supplies the
conversation id the real agent never has, so it passes green while production is dead.

`probeMemoryLoop` shipped in 0.7.0 and ran in **zero repos**. The guard existed; nobody ran it.
That is the whole reason the bug reached production, and it's why your item 2 is the load-bearing
one — item 1 fixes today's bug, item 2 is what stops the next one.

Dennis's standing note on this, verbatim: *"we are forever tweaking this goddamn voice/memory
package. why can't we get it right? every time we need to tweak, every other repo needs the
rebuild."* The fan-out is the symptom. He doesn't object to bumping N repos; he objects to bumping
N repos and still not knowing whether it worked. Target: **a bump is verifiable in one command per
repo.**

---

## Current state, in one table

| | state |
|---|---|
| registry `latest` | **0.7.3**, verified by unpacking the served tarball |
| git `main` | `1a13b54`, matches the registry |
| tests | 62/62 |
| `agent_id NOT NULL` | **still unfixed in the package** — your item 1. Patched locally in BucketLyst `0014` only |
| `probeMemoryLoop` in CI | **zero repos.** BucketLyst has a manual `npm run probe:memory`. Your item 2 |
| BucketLyst prod memory loop | **PASS** on all four 0.7.2 checks (continuity not yet re-probed against 0.7.3) |
| npm auth gotcha | this repo's `.npmrc` maps `${GITHUB_PACKAGES_TOKEN}`, **not** `NODE_AUTH_TOKEN`. Wrong name → empty string → `401 unauthenticated`, which reads like a scope problem and isn't. Read the repo's `.npmrc`; the name differs between repos |
