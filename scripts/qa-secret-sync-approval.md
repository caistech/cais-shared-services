# QA-secret sync — approval checklist

> Tick `[x]` every repo you approve for QA-secret propagation (the 4 `QA_TEST_*` secrets).
> Leave `[ ]` to skip. Hand this back and I parse the ticked lines into `sync-qa-secrets.mjs`.
> Recommendation key: ✅ sync · ❓ your call · 🗑️ kill-candidate (decide first) · 🚫 excluded (not listed).
> Live list captured 2026-06-13 — 56 repos under dennissolver. `pipeline` already done (test run).
>
> **⚠️ 2026-06-13 — MIGRATED to caistech (now inherit ORG secrets — SKIP in any future bridge run):**
> cais-smoketest, preflight, cais-starter (pilots) + Phase 2 batch: singify-platform, LingoPureAI,
> UniversalLingo, TourLingo, ConferenceLingo, RehearsalsAI, universal-interviews, connexions,
> raiseready-core, raiseready-template, LaunchReady, Kira, f2k-projects, deal-findrs, investor-pilot,
> partner-pilot, OutreachReady, tenderwatch, easy-claude-code, community-question-responder,
> PartReady, prelabzAI, F2K-OffshoreModular, pipeline, executorai. (Their repo-level QA secrets are
> now redundant — optional cleanup: delete repo-level copies so they run purely on org secrets.)
> Phase 3 infra ALSO migrated 2026-06-13 (skip in bridge): platform-trust, storefront-mcp, sayfix,
> corporate-ai-solutions. STILL bridge-dependent until moved: property-services (held for careful pass)
> + REGULATED (Phase 4): f2k-checkpoint, F2K-Fund-Tokenisation, NDISSDAAutomate, R-and-D-Tax, disaster-support.

## Infrastructure & hub
- [ x] corporate-ai-solutions — ✅ methodology cockpit + cost dashboard (PUBLIC)
- [ x] platform-trust — ✅ trust middleware
- [x ] property-services — ✅ property-engine substrate
- [x ] storefront-mcp — ✅ → @caistech/webmcp-kit
- [~] preflight — ✅ MIGRATED to caistech 2026-06-13 (pilot #2; inherits org secrets — skip in bridge)
- [ x] sayfix — ❓ GBTA-controlled — confirm ownership YES OWNED
- [~] cais-smoketest — ✅ MIGRATED to caistech 2026-06-13 (inherits org secrets — skip in bridge)
- [~] cais-starter — ✅ MIGRATED to caistech 2026-06-13 (Phase 1; inherits org secrets — skip in bridge)

## REGULATED / contracted
- [X ] f2k-checkpoint — ✅
- [X ] F2K-Fund-Tokenisation — ✅
- [X ] NDISSDAAutomate — ✅
- [X ] R-and-D-Tax-Eligibility-Work-Recording — ✅
- [X ] disaster-support — ✅

## Voice / coaching engine (Engine 1)
- [X ] singify-platform — ✅ lane-1 flagship
- [X ] LingoPureAI — ✅
- [X ] UniversalLingo — ✅
- [X ] TourLingo — ✅
- [X ] ConferenceLingo — ✅
- [X ] RehearsalsAI — ✅
- [ X] universal-interviews — ✅
- [X ] connexions — ✅ (also pipeline stage-3)
- [ X] raiseready-core — ✅
- [ X] raiseready-template — ✅
- [X ] raiseready-impact — ❓ confirm still live STILL LIVE
- [x ] LaunchReady — ✅
- [ x] Kira — ❓ passion/override lane
- [ ] mova — ❓ confirm still live
- [ ] StoryVerse — ❓ passion/experimental

## Property engine (Engine 2)
- [x ] deal-findrs — ✅ (PUBLIC)
- [ x] f2k-projects — ✅ (PUBLIC)

## Outreach / contact-discovery (Engine 3)
- [ x] investor-pilot — ✅ (PUBLIC, also pipeline machinery) NO LONGER PART OF PIPLINE, RELEVAMT COMPONENBTS COPIED INTO PIELINE AS NATIVE
- [x ] partner-pilot — ✅
- [ ] OutreachReady — ✅
- [ x] tenderwatch — ✅

## BYOK / marketing tier
- [ x] easy-claude-code — ✅
- [ x] community-question-responder — ✅ (CQR, PUBLIC)

## Kill candidates — decide before syncing
- [ ] SmartBoard — 🗑️
- [ ] HairStylistAI — 🗑️
- [ ] omq-outreach — 🗑️
- [x ] F2K-OffshoreModular — 🗑️

## Uncertain / experimental — your call
- [ x] executorai — ❓ reference auth-migration repo
- [ ] LessonsLearned — ❓ paused — kill or keep? BROUGHT INTO F2K CHECKPOINT AS NATIVE
- [X ] PartReady — ❓
- [ X] prelabzAI — ❓
- [ ] agentic-os — ❓
- [ ] proposal-filter-ai — ❓
- [ ] factory2key-agentic-qc — ❓
- [ ] landscape-genius-ai — ❓
- [ ] Longtail-AI-Venture-Studio — ❓
- [ ] disabilityconnect — ❓

## 🚫 Excluded by default (NOT listed above — say if you want them in)
- mmcbuild — ARCHIVED, client (CAS→MMC org)
- mmcbuild-webapp — ARCHIVED, client
- mmc-market — client
- gbta-openclaw — GBTA client
- AIFTIS-Demo — demo/client — confirm

---
Approved count: ____ / 49 syncable
