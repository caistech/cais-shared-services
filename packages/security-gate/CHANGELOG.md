# Changelog

## 0.2.2 — 2026-05-01

### Added
- `exports` map in `package.json` declaring four subpath entry points:
  - `.` → root barrel (`dist/index.{js,d.ts}`)
  - `./types` → shared types module
  - `./red-team` → red-team barrel (covers `createRedTeamRunner`, `EndpointRegistry`,
    `RedTeamReporter`, all probe sets, all `RegisteredEndpoint`/`RedTeamRun`/
    `RedTeamReport` types)
  - `./red-team/types` → red-team types module direct

### Why
On 2026-04-30 the platform-trust Vercel build failed with
`Module not found: Can't resolve '@caistech/security-gate/red-team'`. Root cause:
the package declared only `main`/`types` (no `exports` field), so under
`"type": "module"` Node.js could not resolve subpath imports. The platform-trust
hotfix (PR #2) switched to barrel-only imports to unblock the deploy; this
release closes the gap so future consumers can use either pattern.

### Compatibility
- `main`/`types` retained for legacy CJS/loose-resolution consumers.
- `camel/`, `guardrails/`, `runtime/` deliberately excluded — they have no
  `index.{js,d.ts}` barrel in `dist/`. Add their barrels (and exports entries)
  when a consumer needs them.
