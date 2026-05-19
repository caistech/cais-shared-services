// Direct-import components (self-contained — React only).
export { CorporateHeader } from './CorporateHeader';
export { CorporateFooter } from './CorporateFooter';

// Portfolio Standard R1 — the auth surface.
// Closes (a) forgot-password, (b) password visibility toggle on every field,
// (c) magic-link, (d) email verification — in a single drop-in component.
// See ./auth/index.ts for the full surface.
export { AuthForm, PasswordInput } from './auth';
export type {
  AuthFormProps,
  AuthMode,
  AuthUser,
  AuthErrorCode,
  PasswordInputProps,
} from './auth';
export {
  AUTH_ERROR_CODES,
  resolveAuthErrorMessage,
  resolveAuthErrorCode,
  mapSupabaseAuthError,
} from './auth';

// Portfolio Standard R3 — explanatory header for every page and panel.
// Requires what / todo / matters at the type level — no silent omission.
export { ExplanatoryHeader } from './headers';
export type { ExplanatoryHeaderProps } from './headers';

// Portfolio Standard R15 — trust scaffolding for REGULATED-tier products.
// Counterparty / certification / policy disclosure with honest status badges.
export { TrustPanel } from './trust';
export type {
  TrustPanelProps,
  TrustKind,
  CounterpartyStatus,
  Counterparty,
  Certification,
  Policy,
  RegulatedFinancialTrustPanelProps,
  ConsumerHealthTrustPanelProps,
  ChildrenDataTrustPanelProps,
  CredentialInfrastructureTrustPanelProps,
  GenericTrustPanelProps,
} from './trust';

// Copy-paste components live under:
//   src/abn-lookup/      — ABN lookup + ABR search (requires shadcn/ui Input/Label/Badge + lucide-react + @caistech/abn-lookup)
//   src/address-autocomplete/ — Mapbox address autocomplete (requires shadcn/ui Input + lucide-react + @caistech/mapbox)
// These are NOT exported directly because they rely on the consumer's `@/` tsconfig paths for shadcn/ui.
// See each subdir's README.md for copy-paste instructions.
