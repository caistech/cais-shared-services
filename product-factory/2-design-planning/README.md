# Stage 2: Design & Planning

> **House-building analogy:** Architect's work — concept → plans → decisions

## Purpose
"WHAT are we building?" — vision, specifications, architectural decisions.

## Components

| Component | Function |
|---|---|
| `/office-hours` | **Hybrid ideation** — human frustration + AI stress-test |
| → Q1-Q7 | Demand, Status Quo, Desperate Specificity, Narrowest Wedge, Observation, Future-Fit, **Product Type** |
| `/plan-ceo_review` | Strategic architecture |
| `/plan-eng_review` | Technical architecture |
| `/plan-design_review` | UX/UI architecture |
| `/plan-devex_review` | Developer experience architecture |
| `/autoplan` | All reviews in sequence |
| Templates | House designs (project scaffolds) |

## Q7: Product Type Classification (CRITICAL)
> **Analogy:** In house building, you test the soil before designing foundations. Different soil → different foundations. Q7 is your "site soil test" — different foundations (auth/billing/voice/responsive) for different product types.

| Type | Example | Auth | Billing | Voice | Responsive | Team Admin | Cert Level |
|---|---|---|---|---|---|---|---|
| SaaS (multi-tenant) | Singify | Full | Stripe | Mandatory | Mandatory | Mandatory | Full |
| Custom build | MMC clients | Client-spec | Often none | Optional | Can skip | Can skip | Abbreviated |
| Internal tool | SayFix | Minimal | N/A | Optional | Can skip | Can skip | Minimal |
| Infrastructure | @caistech/* | N/A | N/A | N/A | N/A | N/A | Minimal |
| White-label | RaiseReady | Full | Stripe | Mandatory | Mandatory | Critical | Full |
