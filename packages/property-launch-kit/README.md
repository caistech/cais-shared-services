# @caistech/property-launch-kit

Shared primitives for property-sale launch products in the Corporate AI Solutions portfolio.

## What it provides

| Export | Purpose |
|---|---|
| `renderBrandedEmail(args, branding)` | Returns a complete `<!doctype html>` admin email body with F2K's branded shell. Header carries the product name + badge, rows render a label/value table, optional intro + CTA + footer. Branding is a typed config (product name, admin URL, optional palette overrides). |
| `getActiveRecipients({ supabase, table, fallback })` | Reads any `{product}_notify_recipients` table and returns the active email list, falling back to a hardcoded list if the lookup fails or returns empty. Takes a Supabase client as an argument so the package stays agnostic of how products init Supabase. |
| `escapeHtml`, `formatCurrency` | Utility helpers used by the renderer; exported for consumer convenience. |

## Consumer pattern

Each product holds a thin shim that pre-fills branding + table name:

```ts
// src/lib/seafields/notify.ts
import {
  renderBrandedEmail as renderShared,
  getActiveRecipients as getShared,
  type Branding,
  type RenderArgs,
} from "@caistech/property-launch-kit";
import { createSupabaseService } from "@/lib/supabase-service";

const BRANDING: Branding = {
  productName: "Seafields Estate",
  adminUrl: "https://f2k-projects.vercel.app/admin/seafields-registrations",
};

const FALLBACK = ["dennis@factory2key.com.au", "uwe@factory2key.com.au", "barryh@hld.com.au"];

export async function getActiveRecipients(): Promise<string[]> {
  return getShared({
    supabase: createSupabaseService(),
    table: "seafields_notify_recipients",
    fallback: FALLBACK,
  });
}

export function renderBrandedEmail(args: RenderArgs): string {
  return renderShared(args, BRANDING);
}
```

Call sites import from `@/lib/seafields/notify` (the shim) — not from the package directly. That keeps the package surface small (just two exports) while letting each product carry its own product-specific branding and fallback list without repeating them on every call.

## Recipient table schema

Each consumer needs a `{product}_notify_recipients` table matching this shape:

```sql
CREATE TABLE {product}_notify_recipients (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  added_by    UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS gated to super_admin reads — service-role keys bypass RLS so the dispatcher works.

## Branding palette

The default palette is F2K's deep-blue + teal accent. Override per-product via `branding.palette`:

```ts
const BRANDING: Branding = {
  productName: "Future Estate",
  adminUrl: "...",
  palette: { primary: "#4A2B0F", accent: "#E89B47" },  // earth tones for a rural estate
};
```

## Used by

- `f2k-projects` Seafields Estate (Waggrakine WA, 145 lots)
- `f2k-projects` Branscombe Estate (Claremont TAS, 37 homes)

When adopting in a new portfolio product, also bring across:
- The `NotifyRecipientsCard` admin component (parameterised by `apiEndpoint`)
- The daily-digest cron route pattern (`/api/cron/{product}-daily-digest`)
- The `/api/admin/{product}/notify-recipients` REST endpoint shape

Those aren't in this package yet — they're React/Next.js-specific and depend on each consumer's auth/permission model. A future v0.2 may package them once a third consumer arrives.
