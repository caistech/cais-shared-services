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

---

## 4. Portfolio sweep — `@supabase/ssr` middleware logout-on-refresh fix

- **What:** Apply the one-line middleware fix (stop recreating `response` in the cookie `set()/remove()` callbacks) across every repo that carries the verbatim-ported `@supabase/ssr` middleware. Fixed in **pipeline** (commit `88e6948`); the rest still carry the bug.
- **Why:** The `set()/remove()` callbacks reassign `response = NextResponse.next(...)` on every call, dropping all-but-the-last refresh cookie. Supabase chunks the auth token (`sb-<ref>-auth-token.0/.1` + refresh), so on a token refresh only the last cookie reaches the browser → partial/corrupt session → **authed user bounced to login on refresh.** Ported verbatim from Corporate-AI-Solutions, so it's portfolio-wide.
- **The fix:** create `response` ONCE; in `set()/remove()` write to that same response (`response.cookies.set` + `request.cookies.set`) and do NOT recreate it. (On `@supabase/ssr` ≥0.5 prefer the `getAll/setAll` pattern.) Reference diff: pipeline `src/middleware.ts` @ `88e6948`.
- **Sweep list (2026-06-18 grep of `response = NextResponse.next` in `**/middleware.ts`):**
  - **High-confidence (count 3 — fix):** Corporate-AI-Solutions (source), DealFindrs, F2K-Fund-Tokenisation/admin-console, LongtailAIVentureStudio, F2K-OffshoreModular, OutreachReady, Tenderwatch
  - **Probable (count 2):** cais-starter, executorai, F2K-Projects, HairStylistAI, UniversalLingo/host, SayFix
  - **Verify (count 1 — may use `getAll` / be fine):** F2K-Checkpoint, Connexions, LeadSpark, RaiseReadyTemplate, community-question-responder, preflight, universal-interviews, F2K-Fund-Tokenisation/investor-portal
- **Priority:** Do **`cais-starter` first** (the scaffold template — every future product inherits the pattern), then active revenue/case-study repos (DealFindrs, SayFix, Tenderwatch, OutreachReady, executorai), then the rest. Verify each: type-check + a real authed refresh holds the session. Per-repo it needs the edit + build + deploy.
- **Context / detail:** Full root-cause + detection + fix logged in `bug-knowledge.json` (`id: supabase-ssr-middleware-recreates-response-logout-on-refresh`).
- **Depends on / blocked by:** Nothing — independent per repo. Each user may need ONE more sign-in after the fix deploys (their current cookie is already in the partial state).
