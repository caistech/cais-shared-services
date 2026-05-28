# Existing Aligned Tools

> Reference links to existing tools in the system

## Scripts

| Script | Location | Status |
|--------|----------|--------|
| `submit-validation-results.mjs` | `scripts/submit-validation-results.mjs` | ✅ Exists |
| `gate-check.mjs` | `scripts/gate-check.mjs` | ✅ Exists |

## Concepts (Need Implementation)

| Component | Purpose | Status |
|-----------|---------|--------|
| `readiness_results` | Trade certificate data | ⚠️ Needs schema |
| `product_validation_status` | Certificate tracking | ⚠️ Needs schema |
| **Certificate of Occupancy** | Formal "ready for production" artifact | ❌ TO BE BUILT |

## Gate Readiness

| Component | Location | Status |
|-----------|----------|--------|
| `gate-readiness/criteria.json` | `gate-readiness/criteria.json` | ✅ Exists |
| `gate-readiness/applicability.json` | `gate-readiness/applicability.json` | ✅ Exists |
| `gate-readiness/readiness_seed.sql` | `gate-readiness/readiness_seed.sql` | ✅ Exists |
| `GATE_READINESS_CRITERIA.md` | Root | ✅ Exists |

## Status
✅ Data infrastructure exists
❌ Certificate of Occupancy (with auto-reset) needs to be built (Step 3)
