export {
  senderFromEnv,
  identificationLine,
  complianceFooterHtml,
  complianceFooterText,
  withComplianceFooter,
  assertCompliant,
  assertJurisdictionAllowed,
  SUPPORTED_OUTREACH_JURISDICTIONS,
} from "./compliance.js";
export type {
  SenderIdentity,
  ConsentBasis,
  ComplianceFooterArgs,
  EmailBody,
  Jurisdiction,
} from "./compliance.js";

// Pillar 3's RUNTIME half: minting opt-out links, honouring them, and remembering. Rendering an
// unsubscribe link is the easy part; a link that works and a send path that respects it is the
// obligation.
export {
  createUnsubscribeRoute,
  listUnsubscribeHeaders,
  normaliseEmail,
  signUnsubscribeToken,
  unsubscribeUrlFor,
  verifyUnsubscribeToken,
} from "./consent.js";
export type {
  SuppressionReason,
  SuppressionStore,
  UnsubscribeBrand,
  UnsubscribeRouteOptions,
} from "./consent.js";

export { createSupabaseSuppressionStore } from "./supabase-suppressions.js";
export type { SupabaseLike, SupabaseSuppressionOptions } from "./supabase-suppressions.js";
