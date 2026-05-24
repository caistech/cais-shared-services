// Unified BYOK manifest schema (v0.2). See SCHEMA.md for the full spec and the
// findings that produced each field.

export type Scope = "public" | "secret" | "config" | "build-time";
export type Phase = "build" | "runtime" | "post-deploy";
export type SecretClass =
  | "provider-paste" // copied from the provider dashboard
  | "create-then-copy" // provider generates it after you create a resource needing the deployed URL
  | "internal-generated" // wizard generates it; only this app consumes it
  | "external-match"; // wizard generates it AND an external sender must be configured with the same value
export type AutoGenerate = "random-32" | "random-48" | "random-64";
export type DestinationId = "env-file" | "vercel" | "supabase";

export interface ByokService {
  id: string;
  name: string;
  envVar: string;
  /** Hard requirement. Superseded by requiredIf when present. */
  required?: boolean;
  /** Conditional requirement, e.g. "ENABLE_SECURITY_GATE=true" (evaluated against collected values) or a prose condition. */
  requiredIf?: string;
  scope?: Scope;
  phase?: Phase;
  /** Cannot be obtained until the app is deployed (needs the live URL). Implies phase "post-deploy". */
  dependsOnDeploy?: boolean;
  /** Groups entries from the same account/dashboard so the operator sets it up once. */
  provider?: string;
  /** Which adapters receive this value. Defaults to all keys in the top-level destinations. */
  destination?: DestinationId[];
  description?: string;
  signup?: string;
  keyPage?: string;
  instructions?: string[];
  /** Shape hint (regex). Necessary but not sufficient — see validateValue. */
  keyFormat?: string;
  autoGenerate?: AutoGenerate;
  /** Members of a group are either/or (e.g. Anthropic OR OpenRouter). */
  exclusiveGroup?: string;
  secretClass?: SecretClass;
  costNote?: string;
}

export interface DestinationConfig {
  path?: string; // env-file
  targets?: string[]; // vercel
}

export interface ByokManifest {
  product: string;
  version?: string;
  description?: string;
  destinations?: Partial<Record<DestinationId, DestinationConfig>>;
  services: ByokService[];
}
