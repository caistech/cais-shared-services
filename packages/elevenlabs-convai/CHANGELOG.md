# @caistech/elevenlabs-convai — Changelog

## 0.1.6 — 2026-05-23

### BYOK hygiene — remove residual reference to a CAS-owned host

The `createConversationTools(baseUrl)` factory was already correctly
parameterised — `baseUrl` is a required positional argument and the
package never embedded a hardcoded host in runtime code. However:

- The JSDoc example referenced `https://mova.vercel.app`, a CAS-owned
  Vercel deploy, which the phone-home audit flagged as a coupling hint.
- The README's `createAgent()` example used the same CAS host as the
  webhook URL placeholder.

Both have been replaced with the generic `https://your-app.example.com`
placeholder so the package surface contains no portfolio-specific URLs.

In addition, `createConversationTools()` now throws at call time if
`baseUrl` is missing or empty. TypeScript already enforced the type,
but a runtime guard makes the BYOK contract explicit: the package
ships no default host — the consumer's URL is the only host the
returned tool definitions ever target.

### Migration

No code changes required. Existing callers passing a valid `baseUrl`
work unchanged.
