# TODOS

Deferred work captured during reviews. Each item has enough context to be picked up cold.

---

## 1. `@caistech → @mmcbuild` hard-cut migration

- **What:** Complete the package scope rename across the portfolio as one clean hard-cut (no dual-publish overlap window), then deprecate the `@caistech` scope.
- **Why:** The voice-service PRs publish under `@caistech` only (decision 17C) to avoid version skew on the webhook-binding layer — the exact layer the OMQ→LingoPureAI transcript leak happened on. The rename still needs to happen; it's just decoupled from the voice work.
- **Pros:** One version history per package; no skew risk; consumers re-pin once.
- **Cons:** Coordinated change across ~17 consumers; needs a window where every consumer updates its `package.json` + `.npmrc` scope and redeploys.
- **Context:** Triggered by the in-flight rename flagged in global CLAUDE.md (VOICE AI STANDARD RULE) and Issue 17 of the 2026-05-24 voice-service eng review. Approach: publish final `@caistech` version → publish identical `@mmcbuild` version → PR each consumer to the new scope → deprecate `@caistech` on the registry. Do NOT run this concurrently with the voice-service PRs.
- **Depends on / blocked by:** Should land after the voice-service PR1 + PR2 are stable, so the rename moves a known-good package rather than a moving target.

---

## 2. GitHub Actions CI for validation test runner

- **What:** Set up GitHub Actions workflow to run gstack validation tests (naive-tester, voice-auditor, gtm-auditor, qa) on the deployed product from CI, triggered via webhook or scheduled run.
- **Why:** Current local webhook approach requires laptop + local repos. When operator is away from laptop, need CI to execute tests on deployed URLs.
- **Context:** The pipeline cockpit test runner UI currently shows which gstack skill to run + manual execution instructions. Next stage: automate triggering from CI. Workflow should accept MVP_URL as input, run appropriate gstack skill, post results back to the pipeline.
- **Depends on / blocked by:** Test runner UI + webhook local setup complete.

---

## 3. Per-session rate limiting on the anon voice webhook/connect path

- **What:** Add rate limiting (per-IP and/or per-session) to the anonymous voice connect + webhook routes, via `@caistech/platform-trust-middleware`.
- **Why:** Anonymous voice (mmcbuild `/estimate`) is unauthenticated public input. The ElevenLabs allowlist stops *other domains* using the agent ID but does nothing about call volume from your own legitimate origin (including bots). Anon calls bill the product owner's BYOK ElevenLabs key, so uncapped anon traffic = uncapped spend.
- **Pros:** Caps BYOK cost exposure; blunts bot/abuse volume; reuses an existing `@caistech` package rather than rolling new throttle code.
- **Cons:** Needs a per-session/IP key strategy that doesn't penalise legitimate repeat users; another middleware in the request path.
- **Context:** Deferred from voice-service PR1. Decision 16B (no anon persistence — anon rows purged at call end) lowered the *storage/privacy* urgency, but the *cost/abuse* exposure on the live call path remains. Wire `platform-trust-middleware` rate limiting around `createConvaiWebhookRoutes` anon paths and the agent-connect endpoint.
- **Depends on / blocked by:** Voice-service PR1 (the webhook routes must exist first). Not a launch blocker for authed-only consumers.
