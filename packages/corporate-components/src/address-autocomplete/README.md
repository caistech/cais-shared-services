# Address Autocomplete (Mapbox)

Australian address autocomplete with coordinate parsing and reverse geocoding.

## Files to copy

1. `lib/mapbox.ts` → `src/lib/mapbox.ts`
2. `lib/mapbox-types.ts` → `src/lib/mapbox-types.ts`
3. `AddressAutocomplete.tsx` → `src/components/common/address-autocomplete.tsx`

## Dependencies

- `lucide-react` (MapPin icon)
- shadcn/ui `Input` component
- `NEXT_PUBLIC_MAPBOX_TOKEN` env var

## Usage

```tsx
import { AddressAutocomplete } from "@/components/common/address-autocomplete"
import type { GeocodedAddress } from "@/lib/mapbox-types"

function MyForm() {
  function handleSelect(address: GeocodedAddress) {
    console.log(address.formatted_address, address.latitude, address.longitude)
    console.log(address.suburb, address.state, address.postcode)
  }

  return <AddressAutocomplete onSelect={handleSelect} />
}
```

## Features

- Forward search (address text → suggestions)
- Reverse search (coordinates → address)
- Coordinate parsing ("27.4698S 153.0251E", "-27.4698, 153.0251")
- Static map URL generation
- AU-only results, 5 suggestions, 300ms debounce
