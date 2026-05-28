# Stage 7: Operations & Maintenance

> **House-building analogy:** Post-occupancy — maintenance calls, proactive monitoring

## Purpose
"Keep it running." — support, issue tracking, proactive monitoring (Smart Sensors).

## Components

| Sub-system | Function |
|---|---|
| **SayFix** (standalone product) | Full Jira+Zendesk hybrid — can be sold/used externally. Separate product, separate tenant, full features. |
| **@caistech/support** (shared service) | Extracted essence of SayFix embedded in EVERY product's admin portal: stakeholder invites, issue submission, ticket tracking. Same core logic, embedded not standalone. |
| **Smart Sensors** (planned) | Proactive monitoring |

---

## SayFix: Dual Model

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

---

## Smart Sensors — Phased Implementation

### Phase 1 — Must Have (BUILD NOW)
| Sensor | What It Monitors |
|---|---|
| Health sensors | Uptime, 200 vs errors, dependency health |
| Security sensors | Auth anomalies, exposure, rate limits |
| Cost sensors | Monthly spend vs budget, cost spikes |

### Phase 2 — Should Have
| Sensor | What It Monitors |
|---|---|
| Performance sensors | Page load, Web Vitals, latency |

### Phase 3 — Nice to Have
| Sensor | What It Monitors |
|---|---|
| Usage sensors | Active users, feature usage, drop-offs |
| Voice/AI sensors | ConvAI health, memory loop |

> **Rationale:** If the house is on fire (health) or unlocked (security) — nothing else matters. **Cost is also Phase 1** because money is critical: if the bill is unexpectedly high, you need to know immediately.

---

## Feedback Loop

```
┌─────────────────────────────────────────────┐
│  Stage 7 (Operations)                        │
│  ────────────────────                        │
│  Smart Sensors detect patterns                │
│  SayFix receives recurring issues            │
│           ↓                                   │
│  Lessons learned → update PRODUCT_STANDARDS   │
│           ↓                                   │
│  Stage 1 (Pre-Development)                    │
│  ─────────────────────────                   │
│  Updated standards inform new builds          │
└─────────────────────────────────────────────┘
```

### lessons-learned/ Directory

```
lessons-learned/
├── YYYY-MM-DD-issue-summary.md
├── updated-standards-diff.md
└── PORTFOLIO_STANDARD.md (updated if applicable)
```

**Process:**
- When Smart Sensors or @caistech/support detect a recurring pattern → create a lessons-learned entry
- Quarterly → review entries and update PRODUCT_STANDARDS.md and PORTFOLIO_STANDARD.md
