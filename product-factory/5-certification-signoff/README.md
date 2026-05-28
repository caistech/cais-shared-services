# Stage 5: Certification & Sign-off

> **House-building analogy:** Certifier's work — trade certificates → Certificate of Occupancy

## Purpose
"Is this ready?" — formal validation, trade certificates, full product sign-off.

## Components

| Component | Function |
|---|---|
| `readiness_results` | Trade certificate data |
| `submit-validation-results.mjs` | Certificate submission |
| Gate scoring | Aggregating certificates |
| `product_validation_status` | Certificate tracking |
| **Certificate of Occupancy** | Formal "ready for production" artifact |

## Certificate of Occupancy (CRITICAL)

> Artifact that says: *"All trade certificates received, all gates passed, product is legally allowed to launch"*

### Schema

```json
{
  "product_slug": "string",
  "issued_at": "ISO timestamp",
  "valid_until": "ISO timestamp (1 month from issued_at)",
  "sign_off_authority": "auto | human:email",
  "readiness_score": 0-100,
  "trade_certificates": {
    "auth_certificate": "pass/fail",
    "voice_certificate": "pass/fail",
    "security_certificate": "pass/fail",
    "responsive_certificate": "pass/fail"
  },
  "gate_results": {
    "R1": "pass/fail",
    "R4": "pass/fail",
    "R10": "pass/fail",
    "R13": "pass/fail"
  },
  "product_validation_status": "passed | warning | failed",
  "last_user_checkin": "ISO timestamp | null",
  "user_feedback_flag": "no_issues | issues_reported | pending_review"
}
```

### Auto-Reset Rule (CRITICAL)

Every 30 days, the system checks `user_feedback_flag`:

- **no_issues** → automatically renew `valid_until` for another 30 days. Reset `last_user_checkin` to today.
- **issues_reported** → DO NOT auto-renew. Require human review and re-certification.
- **pending_review** → send reminder. After 7 days with no response, flag for human attention.

This is the **single source of truth for launch AND ongoing operations**. Without a valid Certificate of Occupancy (not expired), launch is blocked AND ongoing operations send alerts.
