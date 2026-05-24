# @caistech/property-launch-kit — Changelog

## 0.3.2 — 2026-05-25

### DesignGallery — optional per-design price label

Adds an optional `priceLabel` field to the `Design` type. The price anchor
previously hardcoded `"H&L from {price}"`, which is wrong for designs priced
on a different basis (e.g. ancillary dwellings sold as a build only, with no
land in the figure).

- `priceLabel` defaults to `"H&L from"` — existing consumers are unaffected.
- Set per design when the basis differs, e.g. `"House only — from"`.
- Set to `""` to render the price with no prefix (useful for `"POA"` /
  `"Price on application"`).

Driven by Seafields, where ancillary dwellings (Joey, Koala) are priced
house-only while the standalone homes (BigRoo, GROH 4x2, etc.) are H&L.

## 0.3.1 — 2026-05-23

### BYOK hygiene — scrub CAS-host example from daily-digest docs

`createDailyDigestHandler({ adminUrl })` already required `adminUrl` as
an option, so the package never embedded a hardcoded host in runtime
code. However:

- The JSDoc usage example referenced
  `https://f2k-projects.vercel.app/admin/seafields-registrations`,
  a CAS-owned product surface, which the phone-home audit flagged
  as a coupling hint.

The example now uses `process.env.ADMIN_URL` + a generic
`https://your-app.example.com/...` placeholder so the package surface
contains no portfolio-specific URLs. The consumer's own admin URL is
the only host the digest's CTA ever points at.

Also adds a runtime guard so an empty `adminUrl` throws at factory-call
time with a clear BYOK message, rather than silently rendering a broken
"Open admin" CTA.

### Migration

No code changes required. Existing callers passing a non-empty
`adminUrl` work unchanged.

## 0.3.0 — 2026-05-22

Daily-digest cron helper + migration template + React components
(`NotifyRecipientsCard`, `DesignGallery`). Used by f2k-projects.

## 0.2.0 — 2026-05-18

React components moved into the package (previously consumer-owned).

## 0.1.0 — 2026-05-15

Initial release: branded admin email shell + recipient management.
