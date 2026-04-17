# ABN Lookup (Australian Business Register)

Company name search + ABN validation via the official ABR JSON API.

## Files to copy

1. `lib/abn.ts` → `src/lib/abn.ts` (validation + formatting)
2. `AbnLookupField.tsx` → `src/components/common/abn-lookup-field.tsx` (React component)
3. `api-route.ts` → `src/app/api/abn-lookup/route.ts` (Next.js API route)

## Dependencies

- `lucide-react` (Search, CheckCircle, Loader2, Building2 icons)
- shadcn/ui `Input`, `Label`, `Badge` components
- `ABR_GUID` env var (register free at abr.business.gov.au/Tools/WebServices)

## Usage

```tsx
import { AbnLookupField } from "@/components/common/abn-lookup-field"

function MyForm() {
  return (
    <AbnLookupField
      onSelect={({ abn, name, state }) => {
        console.log(abn, name, state)
      }}
    />
  )
}
```

## Features

- Search by company name (debounced 400ms, min 2 chars)
- Auto-detect 11-digit ABN input (debounced 300ms)
- ABN checksum validation (mod 89 algorithm)
- ABN formatting (XX XXX XXX XXX)
- Shows active/inactive status badge
- Auto-populates hidden form fields (entity name, type, ACN, state, postcode)
- Dropdown with business names, states, trading name indicators
