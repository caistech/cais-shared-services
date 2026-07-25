# @caistech/email-send

The portfolio's Resend transport. **Sending + the compliance footer live here; templates stay in
the product.**

## Why it exists

Two packages already existed and neither could send: `@caistech/nudge-core` defines an
`EmailTransport` interface with no implementation, and `@caistech/email-compliance` produces the
Spam Act footer but does not deliver. So every product wrote its own Resend call — Kira via the SDK
with three local templates, raiseready-core via raw `fetch` deriving `noreply@<slug>` — with
divergent from-domains and divergent (or absent) footers. For a resold, white-label channel that is
a deliverability and compliance risk, not a tidiness one.

Zero runtime dependencies beyond `@caistech/email-compliance`: Resend is called over its REST API
with native `fetch`.

## Use

```ts
import { createEmailSender } from '@caistech/email-send'

const email = createEmailSender({
  sender: {
    name: 'Corporate AI Solutions',
    email: 'hello@corporateaisolutions.com',
    abn: '12 345 678 901',
    postal: 'PO Box 1, Perth WA 6000',
  },
})

// Transactional (billing notice, password reset): identification footer, no unsubscribe.
await email.send({
  to: owner.email,
  subject: 'Your first Kira payment is on Friday',
  html: renderTrialEndingEmail(owner),   // the product's template, the product's voice
  compliance: { transactional: true },
})

// Commercial (campaign, newsletter): unsubscribe + consent basis are required.
await email.send({
  to: prospect.email,
  subject: 'What your business is worth',
  html: renderCampaign(prospect),
  compliance: { unsubscribeUrl, reason: 'express' },
})
```

Pass **no** `compliance` and no footer is appended — appropriate only for mail that carries its own.

## From address

Defaults to `EMAIL_FROM`, then `noreply@updates.corporateaisolutions.com` — **the only
Resend-verified sending subdomain in the portfolio.** The bare apex is not verified; mail from it is
rejected, which is how Kira sent every transactional email to nowhere for months. Override per
product, but override to something *verified*.

The API key resolves at **send** time (`RESEND_API_KEY`), not construction time — constructing a
mail client at module scope with no key is what broke Next.js build-time page-data collection in
every product that used the SDK directly.

## White-label

`compliance.sender` overrides the identity per send, so a distributor product carries the
**distributor's** name and ABN, never a CAS one. That is the "whose brand travels" gate.

## With nudge-core

`sender.transport` is already `EmailTransport`-shaped:

```ts
import { createEmailSender } from '@caistech/email-send'
import { createEmailSender as createNudgeSender } from '@caistech/nudge-core'

const email = createEmailSender({ sender })
const sendNudge = createNudgeSender(email.transport, FROM, nudgeEmailConfig)
```

## Errors

A non-2xx from Resend throws with **Resend's own message included** — `"domain is not verified"` is
the most common failure and is unrecognisable behind a generic "send failed".

## Tests

`npm test` (vitest) — 11 tests: the verified default From, the always-present text alternative,
error passthrough, lazy key resolution, transactional vs commercial footers, white-label sender
override, the nudge-core transport shape, and the HTML→text conversion.
