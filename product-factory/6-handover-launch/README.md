# Stage 6: Handover & Launch

> **House-building analogy:** Settlement day — keys, warranties, manuals handed to homeowner

## Purpose
"Here are the keys." — deploy to production, hand over to "homeowner" (product owner/user).

## Components

| Component | Function |
|---|---|
| Vercel deploy | Settlement/keys |
| `docs/TESTING.md` | User manual |
| Handover package | Full handover to "homeowner" |

## Handover Package

The folder of keys, warranties, and manuals given to the homeowner at settlement:

```
handover-package/
├── credentials.json          (or references to secrets manager)
├── TESTING.md               (you have this)
├── support-contacts.md      (who to call for what)
├── runbooks/                 (common issue fixes)
│   └── common-issues.md
├── launch-checklist.md       (post-deploy verification)
└── certificate-of-occupancy.json  (signed — from Stage 5)
```

This is what the "homeowner" receives when the product is handed over.
