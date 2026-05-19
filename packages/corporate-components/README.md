# @caistech/corporate-components

React components that bake the Corporate AI Solutions
[Portfolio Standard](../../foundation/PORTFOLIO_STANDARD.md) into drop-in components.

Install once, swap raw page-level patterns for these, and the rule is closed
across the product. Every component here corresponds to a specific Portfolio
Standard rule.

| Component | Closes | Subpath |
| --- | --- | --- |
| `<AuthForm/>` | R1 (auth four-leg) | `./auth` |
| `<PasswordInput/>` | R1 (password visibility toggle) | `./auth` |
| `<ExplanatoryHeader/>` | R3 (page / panel explanatory header) | `./headers` |
| `<TrustPanel/>` | R15 (regulated trust scaffolding) | `./trust` |
| `<CorporateHeader/>`, `<CorporateFooter/>` | Brand surface | root |

## Install

```bash
npm install @caistech/corporate-components --legacy-peer-deps
```

`lucide-react` is a peer dependency. `@supabase/ssr` is required by
`<AuthForm/>`; pass `createBrowserClient` as a prop so the package never
bundles a Supabase SDK.

## `<ExplanatoryHeader/>` — Portfolio Standard R3

Every page and every standalone panel opens with a 1–3 sentence header
answering **what is this**, **what does the user do**, and **why does it
matter**. TypeScript enforces all three slots — no silent omission.

```tsx
import { ExplanatoryHeader } from '@caistech/corporate-components';

export default function OpenObligationsPage() {
  return (
    <main className="p-6">
      <ExplanatoryHeader
        what="Open Obligations"
        whatLong="Items other parties owe you against a deadline."
        todo="Add what's outstanding and Watchdog will chase it."
        matters="Anything overdue here is what's currently blocking your project."
      />
      {/* form / table / panel content */}
    </main>
  );
}
```

For embedded standalone panels inside a larger tab, use `compact`:

```tsx
<ExplanatoryHeader
  compact
  what="Recent activity"
  todo="Review the last 24 hours of system events."
  matters="Use this to confirm yesterday's run completed cleanly."
/>
```

### Props

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `what` | `string` | yes | 1–3 words naming the surface |
| `whatLong` | `string` | no | One sentence expanding `what` |
| `todo` | `string` | yes | What the user does here |
| `matters` | `string` | yes | Why it matters to the broader workflow |
| `compact` | `boolean` | no | Compact variant for embedded panels |
| `className` | `string` | no | Appended Tailwind classes |
| `as` | `'h1' \| 'h2' \| 'h3'` | no | Heading level (defaults: `h1` full, `h2` compact) |
| `ariaLabel` | `string` | no | Override landmark region label |

The component renders a `<header role="region" aria-label="…">` wrapper so
screen readers index it. Server-renderable — no client directive.

## `<TrustPanel/>` — Portfolio Standard R15

Required on every REGULATED-tier product's landing page and on every screen
that makes a regulatory claim. Discloses **named counterparties with current
status**, certifications, and policies. No claim without a backing role.

The `kind` prop chooses the disclosure block:

| `kind` | Required props | Use case |
| --- | --- | --- |
| `"regulated-financial"` | `counterparties` | Tokenised funds, MIS, AFSL-regulated structures |
| `"consumer-health"` | — (certifications recommended) | Health / wellness products |
| `"children-data"` | `policies` (privacy + parents + cookies) | Any product handling under-18 data |
| `"credential-infrastructure"` | — | Identity, credentials, badges |
| `"generic"` | — | Anything else with policies |

### Example — F2K-Fund-Tokenisation

```tsx
import { TrustPanel } from '@caistech/corporate-components';

<TrustPanel
  kind="regulated-financial"
  counterparties={[
    { role: 'AFSL holder', name: 'Acme Capital Markets Pty Ltd', status: 'Contracted', detail: 'AFSL 123456' },
    { role: 'Trustee', name: 'Sandstone Trustees', status: 'Contracted' },
    { role: 'Custodian', name: undefined, status: 'In negotiation' },
    { role: 'Auditor', name: undefined, status: 'Not yet appointed' },
    { role: 'Valuer', name: undefined, status: 'Open EOI' },
  ]}
  policies={[
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ]}
/>
```

Counterparty status badge colours:

- **green** — `Contracted`
- **amber** — `In negotiation`, `Open EOI`
- **red** — `Not yet appointed`

The honest-display rule: if a counterparty isn't passed, it isn't rendered.
Never defaulted to "Contracted". Status is always visible. Elena's complaint
on F2K-Fund-Tokenisation (2026-05-19 naive-tester) was that claims existed
without status; this component makes that gap impossible to ship silently.

### Example — children's data product

```tsx
<TrustPanel
  kind="children-data"
  policies={[
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'For Parents', href: '/parents' },
    { name: 'Cookie Policy', href: '/cookies' },
    { name: 'Safety Centre', href: '/safety' },
  ]}
  certifications={[
    { name: 'COPPA compliance', issuer: 'Self-certification', href: '/coppa' },
    { name: 'GDPR-K aligned', issuer: 'Self-certification' },
  ]}
/>
```

The component validates that Privacy + Parents/Safety + Cookies links are
present and surfaces a `console.warn` if any are missing. CI gate
`trust-panel-presence.yml` in `@caistech/portfolio-gate` enforces strictly
at build time.

### Example — generic

```tsx
<TrustPanel
  kind="generic"
  policies={[
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ]}
/>
```

## Other components

- `<AuthForm/>` — R1 auth surface. See [`src/auth/`](./src/auth/).
- `<PasswordInput/>` — password input with visibility toggle.
- `<CorporateHeader/>`, `<CorporateFooter/>` — brand surface. Vendor identity
  routed via `process.env.NEXT_PUBLIC_VENDOR_*` per R11.
- `<AbnLookup/>` (copy-paste, see [`src/abn-lookup/`](./src/abn-lookup/)).
- `<AddressAutocomplete/>` (copy-paste, see [`src/address-autocomplete/`](./src/address-autocomplete/)).

## Subpath imports

```tsx
import { AuthForm } from '@caistech/corporate-components/auth';
import { ExplanatoryHeader } from '@caistech/corporate-components/headers';
import { TrustPanel } from '@caistech/corporate-components/trust';
```

Or import everything from the root:

```tsx
import {
  AuthForm,
  ExplanatoryHeader,
  TrustPanel,
} from '@caistech/corporate-components';
```

## Versioning

- **0.3.0** (2026-05-20) — `<ExplanatoryHeader/>` + `<TrustPanel/>` (closes R3, R15).
- **0.2.0** — `<AuthForm/>` + `<PasswordInput/>` (closes R1).
- **0.1.x** — `<CorporateHeader/>`, `<CorporateFooter/>`, ABN lookup, address autocomplete.

## References

- Portfolio Standard: [`foundation/PORTFOLIO_STANDARD.md`](../../foundation/PORTFOLIO_STANDARD.md)
- Naive-tester reports (2026-05-19): [`naive-tester-reports/2026-05-19-1711/`](../../naive-tester-reports/2026-05-19-1711/)
- F2K-Fund-Tokenisation naive-tester report — the canonical use case for `<TrustPanel kind="regulated-financial">`
