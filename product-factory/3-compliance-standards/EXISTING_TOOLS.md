# Existing Aligned Tools

> Reference links to existing tools in the system

## Standards Documents

| Document | Location | Status |
|----------|----------|--------|
| `PRODUCT_STANDARDS.md` | Root | ✅ Exists |
| `MONETISATION_RULES.md` | Root | ✅ Exists |
| `BUSINESS_MODEL.md` | Root | ✅ Exists |
| `THIN_MVP_RUBRIC.md` | Root | ✅ Exists |

## Portfolio Gate (Automated CI)

| Component | Location | Status |
|-----------|----------|--------|
| `portfolio-gate` package | `packages/portfolio-gate/` | ✅ Exists |
| smoke-auth (R1) | `packages/portfolio-gate/src/smoke/auth.ts` | ✅ Exists |
| smoke-routes (R13) | `packages/portfolio-gate/src/smoke/routes.ts` | ✅ Exists |
| audit-vendor-leak (R10) | `packages/portfolio-gate/src/audit/vendor-leak.ts` | ✅ Exists |
| audit-rls (R4) | `packages/portfolio-gate/src/audit/rls.ts` | ✅ Exists |

## GStack Skills (Stage 3)

| Skill | Location | Purpose |
|-------|----------|---------|
| `/naive-tester` | `.claude/skills/naive-tester/` | User-perspective assessor |
| `/voice-auditor` | `.claude/skills/voice-auditor/` | Voice compliance |
| `/gtm-auditor` | `.claude/skills/gtm-auditor/` | Distribution compliance |
| `/cso` | `.claude/skills/cso/` | Security compliance |
| `/review` | `.claude/skills/review/` | Code quality |
| `/design-review` | `.claude/skills/design-review/` | Visual compliance |
| `/devex-review` | `.claude/skills/devex-review/` | DX compliance |
| `/benchmark` | `.claude/skills/benchmark/` | Performance compliance |
| `/qa` | `.claude/skills/qa/` | Continuous inspection |

## Scripts

| Script | Location | Status |
|--------|----------|--------|
| `compliance-loop.mjs` | `scripts/compliance-loop.mjs` | ✅ Exists |

## Status
✅ Strong audit suite exists
⚠️ portfolio-gate v0.1 (partial automation) — needs upgrade to fully automated (Step 3)
