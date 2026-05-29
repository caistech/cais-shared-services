# Pipeline ⇄ InvestorPilot Integration

> Closed-loop validation: products passing pipeline validation get market-tested via InvestorPilot outreach

## Overview

When a product passes all validation gates in Corporate AI Solutions (pipeline), its profile is submitted to InvestorPilot which creates two outreach streams:
1. **Distributor ICP** - for recruiting distributors
2. **End User ICP** - for feedback/gathering

The loop closes when market signals flow back to pipeline for automated LIVE/DIE decisions.

## Architecture

```
Corporate AI Solutions          InvestorPilot              Product Sites
┌──────────────────┐           ┌──────────────────┐      ┌──────────────────┐
│ Product passes  │──GO──────▶│ Provision        │      │                 │
│ validation      │  webhook │ channels         │      │                 │
└──────────────────┘           └────────┬─────────┘      └────────┬─────────┘
                                         │                      │
                                         │    CTA + events      │
                                         ▼                      │
                                  ┌──────────────────┐      │
                                  │ Market signals   │◀─────┘
                                  │ (intent + eng)  │
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │ Pipeline verdict │
                                  │ LIVE → continue  │
                                  │ DIE  → pause      │
                                  └──────────────────┘
```

## Product Factory Mapping

| Stage | Integration Work | Deliverable |
|-------|------------------|-------------|
| **1-Pre-Development** | Define webhook contract, event schema | Integration spec |
| **2-Design-Planning** | Pipeline webhook endpoint, InvestorPilot API endpoint | API spec |
| **3-Compliance** | Compliance gate (regulated products), shadow mode logging | Decision audit trail |
| **4-Construction** | Webhook implementation, channel provisioning, event ingestion | Working integration |
| **5-Certification-Signoff** | End-to-end test: GO → provision → signal → verdict | Integration test |
| **6-Handover-Launch** | Monitoring, alerting on webhook failures | Ops runbook |
| **7-Operations-Maintenance** | Market validation rubric tuning, automated die tuning | Live ops |

## Webhook Payload (on GO)

```typescript
interface PipelineToInvestorPilotPayload {
  product_name: string;
  description: string;
  landing_page_url: string;
  distributor_icp: string;    // ICP content (not rubric)
  distributor_pitch: string; // Business/margin pitch (REQUIRED for GO)
  regulated_flag: boolean;
  cta_spec: {
    destination: string;
    events: string[];
  };
}
```

## Reusing Existing @caistech/* Packages

| Component | Package | Usage |
|-----------|---------|-------|
| Outreach execution | `ghl-client`, `unipile-channels` | Already in InvestorPilot |
| Email enrichment | `hunter-email` | Already in InvestorPilot |
| Search/enrichment | `brave-search` | Already in InvestorPilot |
| AI for rubric structuring | `ai-client` | In both systems |

## Build Phases

### Phase 1: Webhook Out (Pipeline → InvestorPilot)
- Pipeline emits webhook on GO decision
- Payload: product profile fields

### Phase 2: Provisioning (InvestorPilot)
- Create product
- Create distributor channel (inject pitch + ICP)
- Create end-user feedback channel
- Return stream IDs to pipeline

### Phase 3: Signals + Verdict
- Product site emits intent events
- InvestorPilot returns engagement metrics
- Pipeline runs market validation rubric
- Automated LIVE/DIE decision

## Known Gaps to Confirm

- [ ] InvestorPilot API: accepts ICP content directly or only auto-fill?
- [ ] Product pages: event emission contract exists?
- [ ] Pipeline: ingestion endpoint for signals?
- [ ] Compliance: shadow mode for regulated products?

## Dependencies

- `portfolio-gate` - for product validation state
- InvestorPilot API endpoints (to be confirmed)
- Product page event emission (to be confirmed)

## Status

**Phase:** 1-Pre-Development
**Owner:** Pipeline (primary), InvestorPilot (consumer)
