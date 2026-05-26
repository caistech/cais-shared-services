// Subpath export: `@caistech/corporate-components/address-autocomplete`.
// Kept off the main barrel so `.` importers don't inherit the @caistech/mapbox
// requirement — only repos that use the autocomplete pull the geocoding layer.
export { AddressAutocomplete } from "./AddressAutocomplete";
export type { AddressAutocompleteProps } from "./AddressAutocomplete";
export type { GeocodedAddress, MapboxFeature } from "@caistech/mapbox";
