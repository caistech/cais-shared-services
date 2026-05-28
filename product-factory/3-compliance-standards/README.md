# Stage 3: Compliance & Standards

> **House-building analogy:** NCC / Assessors — building code enforcement, continuous inspection

## Purpose
"Does this meet the rules?" — standards enforcement, continuous testing, automated CI checks.

## Components

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

## portfolio-gate (Automated CI)

| Rule | Description |
|---|---|
| R1 | Auth smoke test |
| R4 | Auth smoke on memory save |
| R10 | No verbatim errors |
| R13 | Route smoke test |

**Behavior:**
- If ANY of R1, R4, R10, R13 fail → CI fails immediately
- No human bypass without explicit override flag (`--force`, logged with reason)
