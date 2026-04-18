// Direct-import components (self-contained — React only).
export { CorporateHeader } from './CorporateHeader';
export { CorporateFooter } from './CorporateFooter';

// Copy-paste components live under:
//   src/abn-lookup/      — ABN lookup + ABR search (requires shadcn/ui Input/Label/Badge + lucide-react + @caistech/abn-lookup)
//   src/address-autocomplete/ — Mapbox address autocomplete (requires shadcn/ui Input + lucide-react + @caistech/mapbox)
// These are NOT exported directly because they rely on the consumer's `@/` tsconfig paths for shadcn/ui.
// See each subdir's README.md for copy-paste instructions.
