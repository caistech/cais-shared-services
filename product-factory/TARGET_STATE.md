# PROPOSED PRODUCT FACTORY STRUCTURE

> **Feedback incorporated:** This document has been refined based on peer review. Key additions: feasibility gate, Certificate of Occupancy definition, Handover Package scope, Smart Sensors phasing, feedback loop from Operations.

## Full Lifecycle (Ground-Up Redesign)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCT FACTORY LIFECYCLE                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  1. PRE-DEVELOPMENT          ← Site Survey / Permits                         │
│     ├─ Site survey (feasibility)                                             │
│     ├─ Material procurement (infrastructure provisioning)                    │
│     └─ Building permit (feature pre-flight)                                  │
│                                                                               │
│  2. DESIGN & PLANNING         ← Architect's Work                             │
│     ├─ Concept / Vision — WHAT are we building?                               │
│     │   └─ /office-hours (hybrid human+AI ideation)                           │
│     │       └─ Q7: Product Type Classification ← CRITICAL                    │
│     └─ Architectural plans — SPEC + decisions                                │
│         └─ /plan-ceo / /plan-eng / /plan-design / /plan-devex                │
│                                                                               │
│  3. COMPLIANCE & STANDARDS    ← NCC / Assessors                              │
│     ├─ Pre-build compliance (standards enforcement)                          │
│     │   └─ portfolio-gate (automated CI checks)                              │
│     └─ During-build checks (continuous testing)                              │
│         └─ /naive-tester / /voice-auditor / /cso / /review / /qa / etc.       │
│                                                                               │
│  4. CONSTRUCTION              ← Builder's Work                               │
│     └─ Implementation (coding, assembly)                                     │
│         └─ /investigate (troubleshooting during build)                      │
│                                                                               │
│  5. CERTIFICATION & SIGN-OFF  ← Certifier's Work                              │
│     ├─ Trade certificates (individual checks)                              │
│     └─ Certificate of Occupancy (full validation)                            │
│         └─ readiness_results + gate scoring + validation status              │
│                                                                               │
│  6. HANDOVER & LAUNCH         ← Settlement Day                               │
│     └─ Deploy + hand to "homeowner"                                           │
│         └─ Testing.md + credentials + support contacts                       │
│                                                                               │
│  7. OPERATIONS & MAINTENANCE ← Post-Occupancy                                 │
│     ├─ SayFix (standalone product) + @caistech/support (embedded)            │
│     └─ Smart Sensors (proactive monitoring)                                  │
│         ├─ Phase 1: Health + Security + Cost sensors                         │
│         ├─ Phase 2: Performance sensors                                     │
│         └─ Phase 3: Usage + Voice/AI sensors                                 │
│                                                                               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  CROSS-CUTTING (present throughout):                                         │
│     • @caistech/* packages (shared building materials)                         │
│     • @caistech/support (embedded support/ticketing — extracted from SayFix)  │
│     • Templates (project scaffolds)                                            │
│     • Pipeline Cockpit (oversight dashboard)                                   │
│     • portfolio-manifest.yaml (project registry)                              │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Detail by Stage

### 1. PRE-DEVELOPMENT

> Analogous to: Site survey → Soil test → Building permit

| Component | Function |
|---|---|
| **Feasibility gate** | "Should we build this?" — effort vs value, demand validation. The "soil test" before designing foundations. |
| **Cost estimation** | "How much will this cost to run?" — estimate monthly costs during design phase |
| `feature-preflight.mjs` | Building permit — checks prerequisites before code |
| `onboard-new-project.sh` | Site survey + material procurement |
| `harvest-secrets.mjs`, `set-caistech-token.sh` | Material procurement |
| `vercel-env-restore.mjs` | Material procurement |
| `configure-email-templates.sh` | Email infrastructure prep |

> **Note on /investigate:** Can be called from any stage (Pre-development site investigation, Construction troubleshooting, Post-occupancy "why is the leak happening?"). It's a tool, not a stage.

---

### 2. DESIGN & PLANNING

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

---

### 3. COMPLIANCE & STANDARDS

| Component | Function |
|---|---|
| `PRODUCT_STANDARDS.md` | NCC (building code) |
| `PORTFOLIO_STANDARD.md` | Foundation rules |
| `/naive-tester` | User-perspective assessor |
| `/voice-auditor` | Voice compliance assessor |
| `/gtm-auditor` | Distribution compliance |
| `/cso` | Security compliance |
| `/review` | Code quality |
| `/design-review` | Visual compliance |
| `/devex-review` | DX compliance |
| `/benchmark` | Performance compliance |
| `/qa` | Continuous inspection |
| `portfolio-gate` | Automated enforcement (R1,R4,R10,R13) |

---

### 4. CONSTRUCTION

| Component | Function |
|---|---|
| Implementation | Builder — the actual work |
| `/investigate` | Troubleshooting |

---

### 5. CERTIFICATION & SIGN-OFF

| Component | Function |
|---|---|
| `readiness_results` | Trade certificate data |
| `submit-validation-results.mjs` | Certificate submission |
| Gate scoring | Aggregating certificates |
| `product_validation_status` | Certificate tracking |
| **Certificate of Occupancy** | Formal "ready for production" artifact |

#### Certificate of Occupancy — Definition

> Artifact that says: *"All trade certificates received, all gates passed, product is legally allowed to launch"*

**Implementation:**

```
certificate-of-occupancy.json
├── product_slug: string
├── issued_at: ISO timestamp
├── sign_off_authority: "auto" | "human:email"
├── readiness_score: number (0-100)
├── trade_certificates: {
│   ├── auth_certificate: pass/fail
│   ├── voice_certificate: pass/fail
│   ├── security_certificate: pass/fail
│   ├── responsive_certificate: pass/fail
│   └── ... (one per compliance check)
│   }
├── gate_results: {
│   ├── R1: pass/fail (auth smoke)
│   ├── R4: pass/fail (auth smoke on save)
│   ├── R10: pass/fail (no verbatim errors)
│   ├── R13: pass/fail (route smoke)
│   └── ... (all portfolio-gate results)
│   }
└── product_validation_status: passed/warning/failed
```

This is the single source of truth for launch permission. Without it, you have data but no formal go/no-go artifact.

---

### 6. HANDOVER & LAUNCH

| Component | Function |
|---|---|
| Vercel deploy | Settlement/keys |
| `docs/TESTING.md` | User manual |
| Handover package | Full handover to "homeowner" |

#### Handover Package — Scope

The folder of keys, warranties, and manuals given to the homeowner at settlement:

```
handover-package/
├── credentials.json          (or references to secrets manager)
├── TESTING.md               (you have this)
├── support-contacts.md      (who to call for what)
├── runbooks/                 (common issue fixes)
├── launch-checklist.md      (post-deploy verification)
└── certificate-of-occupancy.json  (signed — from Stage 5)
```

This is what the "homeowner" receives when the product is handed over.

---

### 7. OPERATIONS & MAINTENANCE

| Sub-system | Function |
|---|---|
| **SayFix** (standalone product) | Full Jira+Zendesk hybrid — can be sold/used externally. Separate product, separate tenant, full features. |
| **@caistech/support** (shared service) | Extracted essence of SayFix embedded in EVERY product's admin portal: stakeholder invites, issue submission, ticket tracking. Same core logic, embedded not standalone. |
| **Smart Sensors** (planned) | Proactive monitoring |

---

#### SayFix: Dual Model

| Model | What It Is | Use Case |
|---|---|---|
| **Standalone** | SayFix as a product | Sold to external clients, own tenant, full-featured |
| **Embedded** | @caistech/support in every product | Admin portal embeds stakeholder invites + issue submission |

**How they relate:**

```
@caistech/support (shared service)
    ├── Embedded in every product's admin portal
    ├── Stakeholder management (invite users)
    ├── Issue submission (form in product)
    ├── Ticket tracking (view status)
    └── ← Same ticket schema, same workflow

SayFix (standalone product)
    ├── Consumes @caistech/support
    ├── Adds: multi-tenant branding, custom SLAs, billing
    ├── Can be sold to external clients
    └── Is what external clients would get
```

This matches the @caistech/* pattern: shared service (embedded) + product wrapper (standalone).

#### Smart Sensors — Prioritised Implementation

**Phase 1 — Must Have:**
| Sensor | What It Monitors |
|---|---|
| Health sensors | Uptime, 200 vs errors, dependency health |
| Security sensors | Auth anomalies, exposure, rate limits |
| Cost sensors | Monthly spend vs budget, cost spikes |

**Phase 2 — Should Have:**
| Sensor | What It Monitors |
|---|---|
| Performance sensors | Page load, Web Vitals, latency |

**Phase 3 — Nice to Have:**
| Sensor | What It Monitors |
|---|---|
| Usage sensors | Active users, feature usage, drop-offs |
| Voice/AI sensors | ConvAI health, memory loop |

> Rationale: If the house is on fire (health) or unlocked (security) — nothing else matters. **Cost is also Phase 1** because money is critical: if the bill is unexpectedly high, you need to know immediately.

---

### COST MANAGEMENT SYSTEM (Cross-Cutting)

Costs span all stages: design (estimation) → build (tracking) → operations (monitoring). This is a separate system that hooks into multiple stages.

#### Stage-Gated Cost Views

| Stage | Cost View | Purpose |
|---|---|---|
| **Pre-Development** | Cost Estimator | "If we build this, what's the monthly run cost?" |
| **Build** | Build Cost Tracker | "What's it cost to develop? (dev resources, integrations)" |
| **Operations** | Production Cost Dashboard | "What is this running product costing now?" |
| **Portfolio** | Portfolio Cost Aggregator | "What's the whole portfolio costing monthly?" |

---

#### Product-Level Cost Dashboard

Each product needs a cost management view showing:

```
Product Cost Dashboard
├── Supabase Costs
│   ├── Database (rows, storage)
│   ├── Auth (MAU)
│   ├── Storage (files, bandwidth)
│   └── Edge Functions (invocations)
├── Vercel Costs
│   ├── Compute (GB-hours)
│   •   Bandwidth (GB)
│   •   Serverless function executions
│   •   Build minutes
├── API Integration Costs
│   ├── ElevenLabs (voice minutes)
│   ├── Anthropic/OpenAI (API calls, tokens)
│   ├── Resend (emails sent)
│   ├── Other (third-party APIs)
├── External Services
│   ├── Domain registration
│   ├── SSL certificates
│   └── Any other paid services
├── Cost Trend Graph
│   └── Month-over-month usage + cost
└── Alerts
    ├── Budget threshold warnings
    ├── Unusual spike detection
```

---

#### Portfolio-Level Cost View

Aggregated view across all products:

```
Portfolio Cost Dashboard
├── Total Monthly Cost
├── Cost by Product (breakdown table)
├── Cost by Category (Supabase, Vercel, APIs)
├── Month-over-Month Trend
├── Budget vs Actual (if caps set)
├── Products Needing Attention
│   ├── Cost spikes
│   ├── Budget exceeded
│   └── Unusual patterns
└── Export/Reporting
    └── CSV export for billing
```

---

#### Cost Estimation (Pre-Development)

During design phase, estimate running costs:

```
Cost Estimate Template
├── Projected MAU: number
├── Projected API calls/month: number
├── Projected storage: GB
├── Projected voice minutes: number
├── Projected emails: number
├── Estimated Supabase: $X/month
├── Estimated Vercel: $Y/month
├── Estimated APIs: $Z/month
├── TOTAL estimated: $X+Y+Z/month
└── Compare: internal vs hosted vs BYOK pricing models
```

This feeds into the product type decision (Q7) — different types have different cost structures.

---

#### Cost Monitoring Implementation

**Data Sources:**
| Source | How to Get Data |
|---|---|
| Supabase | Supabase Dashboard → Usage, or API |
| Vercel | Vercel Dashboard → Usage, or GraphQL API |
| ElevenLabs | ElevenLabs Dashboard → Usage |
| Anthropic/OpenAI | Provider dashboards, or cost APIs |
| Resend | Resend Dashboard → Usage |

**Implementation Approach:**

1. **Per-Product Cost Collector** — Edge function that polls each provider's usage API monthly
2. **Cost Database** — Store monthly costs per product in dedicated table
3. **Product Dashboard** — UI showing cost breakdown + trends
4. **Portfolio Aggregator** — Rolls up all products
5. **Alerting** — Warn when costs exceed thresholds

**Priority:**
- Phase 1: Manual export + portfolio view (get visibility)
- Phase 2: Automated collection per product
- Phase 3: Real-time dashboards + alerts

---

### FEEDBACK LOOP: Operations → Pre-Development

Real housing: maintenance calls reveal design flaws → builder learns → improves future builds.

```
┌─────────────────────────────────────────────┐
│  Stage 7 (Operations)                        │
│  ────────────────────                        │
│  Smart Sensors detect patterns                │
│  SayFix receives recurring issues            │
│           ↓                                   │
│  Lessons learned → update PRODUCT_STANDARDS  │
│           ↓                                   │
│  Stage 1 (Pre-Development)                  │
│  ─────────────────────────                   │
│  Updated standards inform new builds          │
└─────────────────────────────────────────────┘
```

This closes the loop. Without it, you repeat mistakes.

---

## Product Type Classification (from /office-hours Q7)

> **Analogy:** In house building, you test the soil before designing foundations. Different soil → different foundations. Q7 is your "site soil test" — different foundations (auth/billing/voice/responsive) for different product types.

This drives downstream treatment:

| Type | Example | Auth | Billing | Voice | Responsive | Team Admin | Cert Level |
|---|---|---|---|---|---|---|---|
| SaaS (multi-tenant) | Singify | Full | Stripe | Mandatory | Mandatory | Mandatory | Full |
| Custom build | MMC clients | Client-spec | Often none | Optional | Can skip | Can skip | Abbreviated |
| Internal tool | SayFix | Minimal | N/A | Optional | Can skip | Can skip | Minimal |
| Infrastructure | @caistech/* | N/A | N/A | N/A | N/A | N/A | Minimal |
| White-label | RaiseReady | Full | Stripe | Mandatory | Mandatory | Critical | Full |

---

## What's Complete vs What's Missing

| Stage | Complete | Missing |
|---|---|---|
| 1. Pre-Development | ✅ All tooling + feasibility gate concept | — |
| 2. Design & Planning | ✅ + Q7 added | — |
| 3. Compliance | ✅ Strong audit suite | Partial automation (portfolio-gate v0.1) |
| 4. Construction | ✅ | — |
| 5. Certification | ✅ Data infrastructure | ✅ Certificate of Occupancy (now defined) |
| 6. Handover | ⚠️ Deploys work | ✅ Handover package (now scoped) |
| 7. Operations | ✅ SayFix exists | Smart Sensors (not built — prioritised) |
| Cross-cutting | ✅ Packages, templates, cockpit | ✅ Feedback loop (now added) |
