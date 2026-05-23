# @caistech/agent-trust-score — Changelog

## 0.2.2 — 2026-05-23

### BYOK hygiene — remove hardcoded CAS-owned grader host

`calculateGrade()` previously defaulted the third positional argument
to `https://platform-trust.vercel.app`. That value was interpolated
into the report's `badge_url` and `report_url` fields, which downstream
consumers would resolve at render time — meaning every consumer
implicitly pointed badges and report links at CAS infrastructure.

This version removes the CAS-owned default:

- The third positional argument is now `graderUrl?: string` (renamed
  from `baseUrl` in the JSDoc / signature). Positional callers are
  unchanged; the parameter is still the third argument.
- When `graderUrl` is **provided**, `badge_url` / `report_url` are
  absolute URLs built against it (e.g. `${graderUrl}/badge/<slug>`).
- When `graderUrl` is **omitted**, `badge_url` / `report_url` are
  emitted as **relative paths** (e.g. `/badge/<slug>`). Consumers can
  prepend their own host at render time, or run the grader on the same
  origin.
- `ScanConfig.graderUrl` is the new preferred field on
  `scanProject({ ... })`. `ScanConfig.baseUrl` is kept as a deprecated
  alias for one release — old callers continue to work, but the field
  no longer has a CAS-owned default. To silence the deprecation, rename
  the field on your call site.

### Migration

```diff
- scanProject({ projectRoot, projectSlug, projectId, baseUrl: 'https://platform-trust.vercel.app' })
+ scanProject({ projectRoot, projectSlug, projectId, graderUrl: 'https://your-grader.example.com' })
```

If you don't run your own grader and were relying on the default, your
badge / report URLs are now relative. Either point them at your own
grader (recommended) or prepend `https://platform-trust.vercel.app/`
explicitly at render time if you genuinely want to keep using the
CAS-hosted grader.

## 0.2.1 — (historical, no changelog)

## 0.2.0 — (historical, no changelog)
