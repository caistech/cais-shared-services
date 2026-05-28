# Validation Rules & Schema

This directory contains the product validation framework for Gate-1 readiness.

## Files

### `validation-schema.json`

The canonical schema that every product must fill out before Gate-1. It defines the shape of product validation: what must be declared, what must be measured, what constitutes a quality bar.

**Key sections:**
- **product** — slug, name, one-line pitch, promise statement
- **distributor** — archetype, hypothesis, pain_point_solved, go_to_market model
- **end_user** — persona, job, friction, success moment
- **friction_point** — what problem this solves
- **success_criteria** — 3–5 measurable outcomes (and when they must be shown)
- **promise_attributes** — non-negotiable quality bars for each core promise
- **commitment_surface** — deployment model, BYOK, output format, pilot path
- **gate_scores** — readiness audit results (hard gates, weighted gates, conditionals)

**Includes:** Complete SayFix worked example showing how to fill it.

## How It Works

### 1. Product Declaration → (upstream)

A product team, or the operator, fills out `validation-schema.json` for their product:

```json
{
  "meta": { "last_updated": "2026-05-26", "gate_readiness_status": "candidate" },
  "product": { "slug": "myproduct", "name": "MyProduct", "one_line_pitch": "..." },
  "distributor": { "archetype": "...", "hypothesis": "...", ... },
  "end_user": { "persona": "...", "job_to_be_done": "...", ... },
  ...
}
```

### 2. Readiness Audit → (downstream)

The `gate-readiness/criteria.json` checklist runs against the filled schema:

- **Hard gates** (P1–P4 + Layer 1–3 core criteria) — all must pass or Gate-1 is blocked
- **Weighted gates** (Layer 2 experience quality) — 80%+ score required
- **Conditional gates** (auth, voice, email) — only if that feature is present

Audit output:
```
gate1_ready: true/false
hard_gates_passed: N / total M
weighted_score_percent: X%
open_items: [ { code, issue, fix, estimated_effort } ]
```

### 3. Documentation

`GATE_READINESS_CRITERIA.md` explains the philosophy:
- Why Gate-1 readiness is measured (not felt)
- The thin-MVP lens (full experience, zero scale-infra)
- The audit methodology
- How promise attributes (`#9`) replace gut calls with logged, measurable checks

---

## Using the Schema

### Editing Pattern

1. **For a new product:**
   - Copy the SayFix example from `validation-schema.json`
   - Replace product details
   - Fill distributor hypothesis + pain point
   - Define 3–5 promise attributes with quality bars (not vague; measurable)
   - List success criteria (3–5 outcomes per phase)
   - Define commitment surface (how does it ship?)

2. **Validation:**
   - Ensure no required fields are empty
   - Check enums (e.g., `go_to_market` must be one of: white-label, co-branded, powered-by, standalone, internal)
   - Quality bars must be specific: "real backing audible IN-EAR with latency under 60ms" ✓ not "high quality audio" ✗

3. **Readiness audit:**
   - Run `gate-readiness/` checks against the filled schema
   - Document pass/fail + evidence for each criterion
   - Open items are prioritized by estimated effort (quick < medium < large)

### Common Fields Explained

**one_line_pitch** (max 140 chars)
> Record your speech, hear exactly what you sound like, get coached to fix it.

Answers: what does the user GET that they couldn't before?

---

**quality_bar** (promise attributes)
> real backing audible IN-EAR with latency under 60ms — not noticeable lag or speaker bleed

NOT: "high quality audio". NOT: "sounds good". MUST be measurable + specific so /naive-tester can verify it.

---

**pain_point_solved** (distributor)
> Coaches spend 30% of their time listening to recordings and giving generic feedback.

Concrete pain the distributor's workflow has, that this product removes.

---

**go_to_market** (distributor)
- **white-label**: Distributor's brand only; no "powered by" visible
- **co-branded**: Both brands visible (e.g., "Connexions by [Distributor]")
- **powered-by**: Our brand visible (e.g., "powered by Connexions")
- **standalone**: Direct to consumer (no distributor)
- **internal**: No public distribution (e.g., F2K-internal tools)

---

**gate_readiness_status** (meta)
- **pending**: Not yet audited
- **candidate**: Audited, awaiting final decision
- **ready**: Gate-1 approved (all hard gates pass, weighted ≥80%)
- **blocked**: Hard gate failed (requires fix before recheck)
- **deferred**: No Gate-1 outreach this cycle (strategic hold)

---

## Cross-References

- **Upstream:** `gate-readiness/promise-attributes.json` — existing 20 products (SayFix here is canonical example)
- **Downstream:** `gate-readiness/criteria.json` — the 45 criteria that audit this schema
- **Documentation:** `GATE_READINESS_CRITERIA.md` — the full audit philosophy
- **Build standards:** `PRODUCT_STANDARDS.md` — the DNA checklist (`PS §1–9`)
- **Thin MVP:** `THIN_MVP_RUBRIC.md` — what "full experience, zero scale-infra" means

---

## Examples in the Schema

The schema includes one complete, realistic example: **SayFix**.

- A public speaking feedback coach (product)
- For speaking coaches & training firms (distributor)
- For speech students & professionals (end-user)
- Removes generic, slow feedback (friction)
- Real-time annotations + specific coaching + measurable improvement (promise attributes)
- White-label SaaS (deployment)
- Gate-1 ready: 87% weighted, 6/6 hard gates pass (gate_scores)

Use this as a template for your product.

---

## Questions?

- **What goes in success_criteria?** → Outcomes the product must deliver. Measured at Gate-1 or Gate-2 (or both).
- **Why are quality bars so specific?** → Vague bars fail naive-tester verification. "Dramatic" polish is measurable (untrained ear says "wow"); "subtle" is not.
- **What if a conditional feature is not present?** → Mark `feature_present: false` and status `N/A` on conditional gates.
- **How often do we re-validate?** → Once at pre-Gate-1, then only if the promise/product shape changes materially.

