# Stage 1: Pre-Development

> **House-building analogy:** Site survey → Soil test → Building permit

## Purpose
"Should we build this?" — feasibility, provisioning, prerequisites before code.

## Components

| Component | Function |
|---|---|
| **Feasibility gate** | "Should we build this?" — effort vs value, demand validation. The "soil test" before designing foundations. |
| **Cost estimation** | "How much will this cost to run?" — estimate monthly costs during design phase |
| `feature-preflight.mjs` | Building permit — checks prerequisites before code |
| `onboard-new-project.sh` | Site survey + material procurement |
| `harvest-secrets.mjs`, `set-caistech-token.sh` | Material procurement |
| `vercel-env-restore.mjs` | Material procurement |
| `configure-email-templates.sh` | Email infrastructure prep |

## Notes
- `/investigate` can be called from this stage (site investigation)
- Cost estimation feeds into Q7 product type decision
