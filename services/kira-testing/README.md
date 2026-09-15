# @caistech/kira-testing

Centralised Kira Testing service. Provides two logical operations via the shared
`kira-testing-client`:

- `test()` — standard testing (naive-tester, any automated testing)
- `redTeam()` — adversarial testing (red-team)

This service owns model resolution and OmniRoute gateway integration. Testers never call
OmniRoute directly.

See [`docs/KIRA-Testing-Architecture.md`](../../docs/KIRA-Testing-Architecture.md) for the full
architecture.

## Configuration

Set the resolved combo and the OmniRoute gateway credential:

- `KIRA_TESTING_MODEL_COMBO` (or `KIRA_TESTING_MODEL` / `KIRA_TESTING_COMBO`) — e.g. `kira-testing`
- `KIRA_TESTING_OMNIROUTE_BASE_URL` — OmniRoute gateway base URL (default `http://localhost:20128`)
- `KIRA_TESTING_OMNIROUTE_API_KEY` — dedicated key (fallback: `OMNIROUTE_API_KEY`)
- `OMNIROUTE_BASE_URL` / `OMNIROUTE_API_KEY` — shared-credential fallbacks

Without a Kira-testing configuration, the service fails explicitly at the resolution stage — there
is no silent fallback.

## Layout

```text
src/
  api/test.ts           # standard test flow
  api/redteam.ts        # red-team flow
  gateway/omniroute.ts  # OmniRoute mechanics (only this layer knows them)
  resolver/testing-model.ts  # model/combo resolution (only this layer decides)
  schemas/              # authoritative request/result contract
  index.ts              # public surface
```
