# Project State — cais-shared-services

> Save-game per portfolio convention (.context/PROJECT_STATE.md). Updated 2026-09-22.

## Last session (2026-09-22) — @caistech/elevenlabs-convai 0.17.1: mic-level indicator, a
## month-old broken build reverted, organisation_id wired through (opt-in)

**Published: `@caistech/elevenlabs-convai@0.17.1`** (0.17.0 was live under 5 minutes before a
bug in it was caught and fixed — nothing adopted it; see CHANGELOG.md for the full account).

**Done:**
- **Mic-level indicator** (the original ask — LingoPure reviewer finding: a 20-35 min voice call
  had no signal between turns that the system was hearing the caller). `VoiceWidget` now reads
  the vendor SDK's existing `onVadScore`/`getInputVolume()` (never wired before) into a built-in
  pulsing dot, gated by a new pure `shouldShowInputLevel`. New props: `onInputVolume`,
  `showInputLevel`; `VoiceControls.getInputVolume()`. Confirmed the true interim-transcript event
  (`tentative_user_transcript`) is still absent from `@elevenlabs/client`'s public API at both the
  pinned 1.8.1 and latest 1.25.0 — a real vendor gap, not fixable without forking their transport.
- **Reverted a month-old, never-published, regressive rewrite of `webhook-handlers.ts`**
  (commit `8dc55d7`, 2026-08-22): it stubbed `elevenlabs-signature` HMAC verification to a
  present-check only and silently dropped the cross-session-memory continuity lookup
  (`get_conversation_context`/`has_history`/`time_gap_category`, the v0.11.0 feature). It broke
  the build (missing `./request-utils` import) the same day and never built since, so it never
  shipped — every live consumer has been running the older, correct 0.16.0 behaviour the whole
  time. Reverted to that.
- **Re-applied + completed real P0.4 `organisation_id` multi-tenant memory scoping** from a
  later, also-never-built commit (`25c38f8`) that sat on top of the broken rewrite. Fixed its own
  bug (`activeMemoryKeys` built a query and never awaited it). Its enforcement had no consumer
  that could satisfy it (nothing wrote `organisation_id` anywhere) — wired the plumbing through
  properly (`ConvaiRouteContext`/`ConvaiToolIdentity` gain optional `organisationId`, threaded
  into `handleStartConversation`'s insert + `handleSaveMemory`) but made the guard **opt-in**:
  degrades to `organisation_id: null` (today's behaviour) rather than hard-rejecting every
  existing consumer's memory-save on a routine bump.
- 147 tests passing (12 new/updated, mutation-verified), clean `tsc` build.
- **Consumers bumped to `^0.17.1`:** Kira, LingoPureAI (`npm install` run, lockfiles confirmed
  resolving 0.17.1). No ElevenLabs agent reprovisioning needed — everything changed is
  route/handler/widget behaviour, not agent config or tool schema.

**Not yet bumped (SHARED_SERVICES.md consumer list):** SayFix, Morgan, ExecutorAI, BucketLyst,
DealFindrs, F2K, Singify, Connexions, Prelabz, cx-3500 — still on `^0.16.0`. Low urgency (0.16.0
behaviour is what they're already running; 0.17.1 is backward-compatible), but they won't get the
mic-level indicator until bumped.

## Previous session (2026-08-23) — zero-cost judging for the validation agents

**Done (verified with `node --check`):**
- `scripts/agents/lib.mjs`: `loadShots(dir)` export (reads `.png`s, filenames become labels);
  `visionVerdicts()` now branches to a local judge when `LOCAL_VISION_MODEL` is set
  (`LOCAL_VISION_API` defaults to Ollama `http://localhost:11434/api/generate`; parses both
  `{response}` and `{choices[].message.content}` shapes). `ANTHROPIC_API_KEY` optional in that mode.
- `scripts/agents/naive-tester.mjs`: `--shots <dir>` (offline re-verdict, no browser/login),
  `--mock` (records hardcoded pass/na verdicts, no vision call), validation relaxed accordingly.
- New `scripts/agents/README.md` documents entry points, env, deps, consumers, cost modes.

**Deliberately unchanged:** the other five agents consuming `lib.mjs` (additive change only;
they inherit local-judge support for free). No consumer reconciliation needed — verified additive.

**Not a bug fix:** no bug-knowledge.json / Mnemo / SayFix entry recorded (enhancement, not a defect).

## Session (2026-09-22) — closed the gap: 0.17.1 committed to main + 9 consumers bumped

**Found on status check:** `@caistech/elevenlabs-convai@0.17.1` was already live on the npm
registry, but the source had never been committed to `cais-shared-services` main — HEAD was still
sitting on the 0.16.0-era commit. Committed (`305db33`) and pushed to `origin/main`.

**Bumped all 9 locally-checked-out consumers to `^0.17.1`** (SayFix, F2K-Checkpoint, F2K-Projects,
singify-platform, Connexions, DealFindrs, BucketLyst, PrelabzAI, executorai) — version bump +
install + typecheck verify + commit per repo, **none pushed yet** (local commits only). Morgan and
cx-3500 were not found checked out on this machine — not bumped.

**Caught mid-flight:** BucketLyst's first `npm install` actually failed (ERESOLVE peer conflict on
typescript, which npm misreported as `undefined`) but the `| tail -30` piping swallowed the real
exit code, so the background-task notification read "completed" over a broken install
(package.json said 0.17.1, lockfile+node_modules still resolved 0.11.2). Caught by verifying
`node_modules/@caistech/elevenlabs-convai/package.json`'s actual `version` field rather than
trusting the notification; retried clean, confirmed 0.17.1 resolved, then committed. Re-verified
the other repos' resolved versions the same way before committing them, since they'd used the same
masking pattern.

**PrelabzAI has pre-existing `tsc` errors** in `lib/ai/prompts.ts` (missing config fields) —
confirmed via `git stash` unrelated to the convai bump, present before and after.

**Branch note — 4 of 9 repos are NOT on `main`:**
- DealFindrs, singify-platform → currently checked out on `_clean_residency` (a pre-existing local
  branch from an earlier data-residency-disclosure pass; singify's has a real commit ahead of
  origin, `864c78d fix(privacy): disclose where recordings are stored`)
- BucketLyst, Connexions → currently checked out on `chore/gate-machine-routes` (pre-existing,
  ~2 months stale, likely a fleet-wide portfolio-gate rollout branch)

None of these were created by this session — the convai bump commit just landed on whatever
branch was already checked out. Flagged to the user; not yet reconciled onto `main`.

## Next
- **Push the 9 consumer commits** (or reconcile the 4 off-main branches onto `main` first — ask
  the user which).
- Optional: point CI at `--shots` capture-once/re-verdict flow to cut runner minutes.
- If `LOCAL_VISION_MODEL` gets set globally, all six agents silently switch judges — decide
  whether that's wanted per-agent before doing it in shared env.
