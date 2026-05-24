# Pricing Formula — how hosted tiers and distributor clips are priced (canonical)

> **What this is.** The spec `MONETISATION_RULES.md` R13 and R15 point at — the
> formula that turns a product's *cost ceiling* into its *price*, for both
> pricing models the portfolio uses. It exists so pricing is **policy, not a gut
> call per product** (the same discipline as the product-selection rubric in
> `BUSINESS_MODEL.md` §5).
>
> Companion to `MONETISATION_RULES.md` (R12 no uncovered cost exposure, R13
> single-tenant choice, R14 hard-cut cap, R15 distributor-first clip) and
> `BUSINESS_MODEL.md` (§2 lanes, §7 lane-1 shape). Auth-pattern severity: a
> hosted tier priced below its ceiling violates R12 and is a bug, not a tuning
> note.
>
> **Last updated:** 2026-05-25.
> **⚠ The coefficients in §6 (margin, buffer, support overhead) are proposed
> defaults pending Dennis's confirmation — every other number is fixed by an
> existing rule and cited inline.**

---

## 0. Two models — pick by product shape

| Model | Used by | Who pays | Priced by |
|---|---|---|---|
| **A — Plan-with-cap** | Direct-to-end-user / personal-interest-override products (BUSINESS_MODEL §2 lane-1 sold direct; the R15 override lane) | The end customer | A monthly plan price + a hard usage cap (this doc §2) |
| **B — Distributor clip** | Distributor products (the R15 default — we sell to operators who already have customers) | The **distributor**, in advance | A per-active-end-user clip, $10–20 (this doc §3) |

Both sit on the **same cost-ceiling engine** (§1) and the **same cap mechanic**
(R14). The difference is only *who is billed* and *what the unit of billing is*.
**BYOK products use neither** — every metered call lands on the user's own
vendor account (R10), so CAS has no cost to price (BUSINESS_MODEL lane 4).

---

## 1. The cost ceiling (shared by both models)

R12's rule is **price the ceiling + buffer, never the expected average** —
because usage volatility regularly exceeds the average and the overage lands on
CAS. So every formula below starts from the *worst-case covered cost*, not the
mean.

**Definitions** (per product; declared in the product's `PRODUCT_METERS`
constant per R14):

- **meter** — a metered resource (LLM tokens, voice minutes, generated docs,
  leads scraped, …). Each has a per-tier **cap** (the hard 100% ceiling) and a
  **unit vendor cost** (what CAS pays the vendor per unit).
- **`headroom`** — the small admin-set overshoot R14 allows for in-flight
  requests. **Default 5%** (R14). The plan covers `cap × (1 + headroom)`.
- **`infra_fixed`** — fixed monthly infra for the account: **$0 shared / ~$50
  dedicated** (R13; R13 cites a ~$45–65 baseline — use $50 as the planning
  midpoint).
- **`vendor_cost_at_ceiling`** = `Σ over meters [ cap × (1 + headroom) × unit_vendor_cost ]`.

```
cost_ceiling = vendor_cost_at_ceiling + infra_fixed + support_overhead
```

`cost_ceiling` is the number CAS must already have money in hand against before
the cycle starts (R12: prepaid / billed in advance). It is also, by R14, the
**revenue ceiling** — cap = cost ceiling = revenue ceiling are the same number.

---

## 2. Model A — plan-with-cap

```
plan_price = cost_ceiling × (1 + margin)
           = ( vendor_cost_at_ceiling + infra_fixed + support_overhead ) × (1 + margin)
```

- **Billed in advance**; the cycle does not start until payment clears (R12).
- At **80%** of any meter → non-blocking warn banner + email; at **100%** →
  the metered feature is **disabled** until top-up/upgrade (R14). Non-metered
  features (login, settings, viewing/exporting past data) stay available.
- **Top-up** = prepaid credit drawn down per call; **upgrade** = the higher
  tier's caps apply immediately, prorated (R14).
- For REGULATED-tier products `infra_fixed` is the dedicated figure (single-
  tenant is forced on, R13); for STANDARD/REVENUE tiers it is the customer's
  tenancy choice at checkout (R13).

**Worked example** (illustrative — a hosted voice-coaching tier):

| Input | Value |
|---|---|
| Voice meter cap | 500 min/mo |
| Voice unit vendor cost | $0.10/min |
| `vendor_cost_at_ceiling` | 500 × 1.05 × $0.10 = **$52.50** |
| `infra_fixed` (shared) | $0 |
| `support_overhead` (default) | $5 |
| `cost_ceiling` | $57.50 |
| `margin` (default 60%) | × 1.60 |
| **plan_price** | **$92** → list at **$99/mo** |

Round *up* to the nearest clean price point — never down (rounding down eats
the buffer R12 requires).

---

## 3. Model B — distributor clip (the R15 default)

The clip is **fixed by R15 at $10–20 per active end-user per month**, paid by
the distributor, invoiced in advance (R12). The distributor sets their own
end-user price (typically 3–10×) and keeps the margin — CAS is infrastructure,
not service provider.

```
distributor_invoice (advance) = clip × projected_active_end_users
clip ∈ [$10, $20]    # R15 band — fixed, not derived
```

**The clip must still clear the per-end-user cost ceiling** — this is the only
derived part of Model B. Define the per-end-user version of §1:

```
cost_ceiling_per_eu = vendor_cost_at_ceiling_per_eu
                    + (infra_fixed / active_end_users)
                    + support_overhead_per_eu

REQUIRED:  clip ≥ cost_ceiling_per_eu × (1 + margin)
```

- If a $10–20 clip clears the per-end-user ceiling with margin → **price by
  clip** (pick within the band by distributor sophistication / value).
- If the per-end-user cost ceiling is **too high for a $20 clip to cover** →
  the product cannot be a flat-clip distributor product as scoped. Options, in
  order: (a) tighten the per-end-user meter caps until it fits; (b) move that
  distributor to a **Model-A plan-with-cap on the distributor account** (the
  distributor's account carries the cap per R15); (c) ship it **BYOK** so the
  cost lands on the distributor's own keys (R10). Never absorb the gap (R12).
- The cap (R14) lives at the **distributor-account level**; `clip ×
  active_end_user_count` is invoiced in advance (R12). Tenancy choice (R13) is
  the distributor's.

**Worked example** — Singify (BUSINESS_MODEL §3 canonical distributor):

| Input | Value |
|---|---|
| Distributor | a singing academy; end users = its students |
| Per-student cost ceiling (voice + LLM, at cap) | ~$4/mo |
| `margin` (default 60%) → floor | $4 × 1.6 = $6.40 |
| Clip chosen (within R15 band, clears floor) | **$15/active student/mo** |
| Academy prices students | e.g. $49/mo → keeps $34 |
| CAS invoice (200 active students, in advance) | 200 × $15 = **$3,000/mo** |

---

## 4. Tenancy & `infra_fixed` (R13)

`infra_fixed` is the only input that changes with the customer's tenancy choice:

| Tenancy | `infra_fixed` | When |
|---|---|---|
| Shared (RLS-isolated) | ~$0 | Default for STANDARD/REVENUE tiers |
| Dedicated (own Vercel + Supabase) | ~$50/mo | Customer compliance choice, or forced for REGULATED tier |

The plan/clip reflects the delta where both are offered. The shared→dedicated
upgrade is a defined migration (`SUPABASE_MIGRATION_PLAYBOOK.md`); re-price on
switch.

---

## 5. Cap enforcement is the load-bearing half (R14)

A price is only honest if the cap is actually hard-cut. Pricing the ceiling
(this doc) and enforcing the ceiling (R14's atomic check-and-increment, the 80%
warn, the 100% disable, the 5% headroom) are two halves of one mechanism — cap =
cost ceiling = revenue ceiling. The cap-enforcement layer, meter table shape,
top-up webhook, and admin meter view are the shared `@caistech/usage-meters`
target (R14); pricing reads the **same** `PRODUCT_METERS` declaration the cap
layer reads, so price and cap can never drift.

---

## 6. Default coefficients (⚠ confirm with Dennis)

Fixed by an existing rule — do not change here:

| Parameter | Value | Source |
|---|---|---|
| `clip` band | $10–20 / active end-user / mo | R15 |
| `headroom` | 5% | R14 |
| `infra_fixed` (dedicated) | ~$50/mo | R13 |
| `infra_fixed` (shared) | ~$0 | R13 |

Proposed defaults this doc introduces (no rule pins them — **confirm**):

| Parameter | Proposed default | Rationale |
|---|---|---|
| `margin` | 60% markup on `cost_ceiling` | Covers cap-lag dollars (R12) + operator time; tune per lane value (Rule 1B) |
| `support_overhead` | $5 / active account / mo | Placeholder for support + payment-processing + reconciliation |
| Rounding | always **up** to a clean price point | Rounding down eats the R12 buffer |

---

## 7. Verification heuristic before launching any hosted tier / distributor clip

- Walk R12's worst case: a customer/distributor consumes 100% + headroom of
  every meter. Is `price ≥ cost_ceiling`? If no, the tier violates R12 — re-price.
- Is the price **billed in advance** and the cycle gated on payment clearing? If no, fix.
- Model B only: does the chosen clip **clear `cost_ceiling_per_eu × (1+margin)`**?
  If no, tighten caps / move to Model A / ship BYOK — never absorb.
- Does the priced cap read from the **same `PRODUCT_METERS`** the R14 cap layer
  enforces? If they're declared in two places, they will drift — unify them.

If any answer is no, the tier is not ready to launch.
