# Validation Execution Trigger (2026-05-28)

**Decision:** Validation testing (Parts A–D) is a **readiness gate, not a time gate**. If a product passes validation tests, it is **immediately ready for external validation workflows** (InvestorPilot outreach, dual-stream demand validation, etc.). No 7-day waiting period required.

---

## The Gate

A product is ready to execute external validation workflows when:

1. ✅ All 4 Parts (A/B/C/D) show **passed** status on the product card
   - OR ⚠️ All 4 Parts show **passed or non-blocking warning** (specific findings documented)
2. ✅ Readiness score ≥ 90% (per updated scoring formula: hard gates 40% + weighted 40% + tests 20%)
3. ✅ No **blocking findings** (e.g., Settings page missing, test user middleware broken, profiles table RLS enforced)
4. ✅ Tester has approved and admin has signed off

**If all criteria pass → Execute validation workflows immediately. Do not wait.**

---

## What "External Validation Workflows" Means

Once a product is approved via validation tests:

1. **InvestorPilot Outreach Pipeline** kicks off:
   - Distribute product to validation audience (distributors, end-users, market researchers)
   - Collect dual-stream demand signals (supply-side: distributor interest; demand-side: end-user willingness)
   - Run Gate 1 validation per BUSINESS_MODEL.md §4

2. **Product Enters Gate 1 → Gate 2 → Gate 3+** workflow
   - Gate 1 (current): Idea → Feasibility → Dual-stream validation → GO/NO-GO → MVP
   - Gate 2: Validation by real audience + distributor commitment
   - Gate 3+: Execute, scale, monetize

---

## Product Card Status Interpretation (Updated)

| Score | Status | Action |
|---|---|---|
| ≥ 90% + all tests ✅ | ✅ **Ready to Execute** | **LAUNCH validation workflows immediately** |
| ≥ 90% + tests ⚠️ (non-blocking) | ✅ **Ready to Execute** | **LAUNCH validation workflows immediately** (track findings as tickets) |
| 70–89% | ⏳ **Nearly Ready** | Fix gaps, re-test, then launch |
| < 70% | ❌ **Blocked** | Requires significant work before external testing |
| Not run | ⏸️ **Not Tested** | Cannot launch until tests pass |

---

## Workflow (No 7-Day Wait)

```
Day 1:
  Tester runs validation tests on Product A
  ↓
  Submits results via API
  ↓
  Dashboard shows: ✅ Part A/B/C/D + Readiness 92%
  ↓
  Admin reviews card, approves
  ↓
  [IMMEDIATELY] Execute InvestorPilot validation workflows
  ↓
  Product A enters real market validation

Day 2–3:
  Tester runs validation tests on Products B, C, D, E
  ↓
  All submit results
  ↓
  Dashboard shows: All 5 products ✅ Ready to Execute
  ↓
  [IMMEDIATELY] Execute validation workflows for all 5 simultaneously
```

**No waiting between passing tests and launching external validation.**

---

## Implementation Impact

### What Changes

1. **Remove** the 7-day production monitoring gate (PHASE_2_PRODUCTION_MONITORING.md becomes optional/post-launch)
2. **Keep** validation test results on product cards (visibility of readiness)
3. **Add** "Execute Validation Workflow" button to product card (appears when readiness ≥ 90%)
4. **Trigger** InvestorPilot workflows on button click (or via API)

### What Stays the Same

- VALIDATION_TEST_PLAN_BOTH_PORTALS.md (still the test checklist)
- VALIDATION_TEST_RESULTS_UI_DESIGN.md (still the dashboard display)
- Product validation_status database (still stores test results)
- Readiness scoring (still weights tests at 20%)

---

## Product Card Button States

### When Status < 90% (Blocked)
```
[Fix Issues] [View Report]
(No execute button — cannot launch yet)
```

### When Status ≥ 90% & Tests ✅ (Ready)
```
[Execute Validation Workflow] [View Report] [Manage Issues]
↑
Ready for external testing RIGHT NOW
```

### When Status ≥ 90% & Tests ⚠️ (Ready with warnings)
```
[Execute Validation Workflow] [View Report] [Manage Issues]
↑
Ready for external testing (non-blocking findings tracked as tickets)
```

---

## "Execute Validation Workflow" Button

### What It Does
1. Sets `outreach_readiness` = true on product_validation_status
2. Sets `can_run_outreach` = true
3. Triggers InvestorPilot pipeline (distributor discovery, demand validation setup)
4. Logs execution timestamp + admin email
5. Redirects to methodology cockpit or outreach dashboard

### What It Requires
- [ ] Product readiness ≥ 90%
- [ ] At least one tester has approved the validation results
- [ ] No **blocking** findings (warnings are OK)

---

## Success Looks Like

**2026-05-28 EOD:**
- Validation tests designed and documented ✅
- Migration created ✅
- API endpoint ready ✅
- Product card UI updated ✅

**2026-05-29–05-31 (3 days):**
- Tester executes Parts A–D on all 5 products ✅
- Results submitted via API ✅
- All 5 show ✅ Ready to Execute on dashboard ✅

**2026-06-01 (first business day after validation):**
- Admin clicks [Execute Validation Workflow] on each product ✅
- InvestorPilot pipelines spin up for all 5 simultaneously ✅
- External validation begins (distributors + end-users contacted) ✅

**No artificial delays. No 7-day waiting period. Ready → Execute.**

---

## Deleted/Modified Files

- **PHASE_2_PRODUCTION_MONITORING.md** → Optional (post-launch monitoring, not blocking)
- **Product card "status badge"** → Now says "Ready to Execute" when ≥ 90%, not "Ready for 7-day monitoring"

---

## Why This Matters

1. **Faster feedback loops:** Get real market data within 1 week of passing tests, not week 2
2. **Reduces waste:** No holding products on a waiting list while tests sit idle
3. **Matches methodology:** Gate 1 is "Dual-stream validation" — real users/distributors, not internal testing
4. **Keeps momentum:** Tests pass → immediately validate with market → make Gate 2 decision

The 7-day gate was a safety check for Phase 2 stability (the **pipeline itself**). Once that's proven, products don't need a 7-day internal observation period — they need external validation with real distributors and end-users.

