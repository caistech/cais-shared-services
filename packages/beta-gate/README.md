# @caistech/beta-gate

Reusable beta **trial clock** (14-day, extendable) + **usage caps** (per-day / total), extracted from
the SayFix beta model so every product gates a beta the same way. Supabase-injected, framework-agnostic.

## Wire it (once)

1. Apply `migration.sql` (ships `beta_trials` + `beta_usage`, RLS-on, service-role only).
2. Create the gate with a service-role client + your caps:

```ts
import { createBetaGate } from '@caistech/beta-gate'
import { createClient } from '@supabase/supabase-js'

export const betaGate = createBetaGate({
  supabase: createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
  config: {
    trialDays: 14,
    caps: {
      asset: { total: 10 },              // ≤10 assets for the whole trial
      stage1: { perDay: 20, total: 100 } // ≤20 analyses/day, ≤100 total
    },
  },
})
```

3. On signup: `await betaGate.ensureTrial(userId)`.
4. Before a capped action:

```ts
const check = await betaGate.gate(userId, 'asset') // check + record if allowed
if (!check.allowed) {
  // reason: 'no_trial' | 'trial_expired' | 'daily_cap' | 'total_cap'
  return Response.json({ error: reasonMessage(check.reason), daysLeft: check.daysLeft }, { status: 402 })
}
```

5. Show `await betaGate.status(userId)` in the UI — `{ active, daysLeft, expired }`.
6. Extend by review: `await betaGate.extend(userId)` (+14 days). Convert to paid: `betaGate.convert(userId)`.

## API
- `startTrial` / `ensureTrial` / `status` / `extend(days?)` / `convert`
- `check(subject, action)` → `CapCheck` (no write) · `record(subject, action)` · `gate(subject, action)` (check + record)
- `daysLeft(expiresAt)` — pure helper.

Actions with no cap rule are unlimited but still trial-gated. Caps count against the append-only
`beta_usage` log (auditable). Identity is the caller's — pass a server-derived subject id.
