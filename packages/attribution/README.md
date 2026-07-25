# @caistech/attribution

First-touch referral attribution for referrals that **pay someone**.

## Why it exists

Several products had a `?ref=` tag. Only F2K-Projects' ROI portal had attribution that could survive
a commission dispute — HMAC-signed, HttpOnly, scoped, windowed, and immutable in the database. This
package is that implementation, generalised.

The distinction matters. When attribution only feeds analytics, a plain cookie is fine. When it
decides **who gets paid**, three properties stop being optional:

1. **Tamper-evident** — the payload is HMAC-signed, so nobody can rewrite themselves into someone
   else's introduction from page JS.
2. **First-touch wins** — a later touch never overwrites an earlier valid one. The person who made
   the introduction is paid, not the last link clicked.
3. **Immutable once written** — enforced by a database trigger, because an application-layer rule is
   one forgotten code path (an admin screen, a bulk import, a support script) away from a silent
   reassignment.

Zero dependencies; Node crypto only.

## Use

```ts
import { createAttribution, firstTouchNow } from '@caistech/attribution'

const attribution = createAttribution({ cookiePrefix: 'kira_ft_' })  // secret: ATTRIBUTION_SECRET
```

**The referral link resolver** (`/r/[token]`):

```ts
const existing = cookies().get(attribution.cookieName('kira'))?.value

if (attribution.shouldWrite(existing)) {
  const touch = firstTouchNow({
    scope: 'kira',
    referrerId: referrer.id,
    referrerOrgId: referrer.orgId,
    token,
  })
  cookies().set(attribution.cookieName('kira'), attribution.sign(touch), attribution.cookieOptions())
}
// shouldWrite() is false when a valid first touch already exists — that's first-touch-wins.
```

**At signup**, read it and write it onto the row once:

```ts
const touch = attribution.parse(cookies().get(attribution.cookieName('kira'))?.value)
if (touch) {
  await supabase.from('users').update({
    referrer_id: touch.referrerId,
    referrer_org_id: touch.referrerOrgId,
    first_touch_at: touch.firstTouchAt,
  }).eq('id', userId)
}
```

## The window

90 days by default. An **expired** touch parses as `null` — deliberately treated as *no attribution*
rather than *stale attribution*, so a later valid referrer can still be recorded instead of the
visitor being permanently attributed to someone out of window.

## Immutability

Apply `migration.sql`. It ships the `enforce_attribution_immutability()` trigger function plus
commented templates for your columns and triggers. Once set, the attribution columns cannot change:
`NULL → value` is allowed (the first write), `value → different value` raises.

An override requires deliberate intent — the header `x-allow-attribution-override: true` or the
`app.allow_attribution_override` session var — and **always writes an audit row**, so a reassignment
is never silent even if the calling code forgets to log it.

Keep the self-reported "who told you about us?" field (`referral_source_text`) **outside** the
protected set. It is a hint for a human to act on, not an attribution.

## Cookie attributes

`HttpOnly`, `SameSite=Lax`, `Secure` in production, path `/`. **Lax, not Strict** — the link is
followed cross-site (from an email, or the referrer's own page), and Strict would drop the cookie on
the very navigation that establishes the attribution.

## Migrating F2K-Projects onto this

The signed payload keys (`e`/`a`/`g`/`t`/`ts`) are **deliberately identical** to the original, so
cookies already issued in the wild stay valid. There is a test pinning that; don't tidy the keys.

Field renames only: `estate → scope`, `agentId → referrerId`, `agencyId → referrerOrgId`. Pass
`cookiePrefix: 'f2k_ft_'` and `secretEnvKeys: ['ATTRIBUTION_SECRET', 'AGENT_INVITE_TOKEN_SECRET']`
to keep the existing cookie names and secret resolution.

## Tests

`npm test` (vitest) — 17 tests: round-trip, tamper rejection (edited payload, wrong secret, wrong
signature length), the window including the expired-means-none rule, first-touch-wins, cookie
attributes, lazy secret resolution, and the F2K wire-format compatibility pin.
