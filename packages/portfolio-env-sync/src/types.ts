/**
 * Portfolio env sync — type definitions.
 *
 * The manifest declares what env vars *should* exist for each portfolio
 * project. The audit/apply tools compare live state against this declaration
 * and report or fix drift.
 */

/** Vercel environments where an env var can be scoped. */
export type VercelTarget = "production" | "preview" | "development";

export const VERCEL_TARGETS: readonly VercelTarget[] = [
  "production",
  "preview",
  "development",
] as const;

/**
 * One env var declaration in the manifest.
 *
 * - `targets`: Vercel environments where this var must be set. Defaults to
 *   all three. Use a subset for env-specific values (e.g. dev-only mocks).
 * - `value` / `ref` / `from_supabase`: how the value is resolved. Audit-only
 *   mode (v0) doesn't resolve values — it only checks key presence — so any
 *   of these are fine for v0.
 */
export interface EnvBinding {
  targets?: VercelTarget[];
  value?: string;
  ref?: string;
  from_supabase?: "url" | "anon_key" | "service_role_key";
}

/**
 * Supabase Auth configuration for a project. Optional. When present,
 * `--apply` PATCHes these fields on the project's Supabase Auth config
 * via `/v1/projects/<ref>/config/auth`.
 *
 * All fields are optional; only declared fields are applied. Other Auth
 * config fields on Supabase are left untouched.
 */
export interface AuthConfig {
  /** Supabase Auth Site URL — where magic links and OAuth redirect after
   * the auth flow completes. Must match the project's deployed domain. */
  site_url?: string;
  /** Allowed redirect URLs (incl. wildcards). Translated to Supabase's
   * comma-joined `uri_allow_list`. */
  redirect_urls?: string[];
  /** Auth emails per hour per IP. Supabase free SMTP: typical ceiling 4.
   * Setting too low (e.g. 2) silently blocks magic-link retries. */
  rate_limit_email_sent?: number;
  /** OTP / magic-link expiry in seconds. */
  mailer_otp_exp?: number;
  /** OTP digit length. */
  mailer_otp_length?: number;
  /** Per-recipient cooldown in seconds. Default 60 — too long for rapid
   * dev testing of magic-link flows. Drop to 1 in dev / 30–60 in prod. */
  smtp_max_frequency?: number;
}

/** A single project's manifest entry. */
export interface ProjectConfig {
  name: string;
  vercel_project_id: string;
  /** Optional — populated as projects connect their own Supabase. */
  supabase_project_ref?: string;
  /** Inherit shared env vars by name. */
  inherit_shared?: string[];
  /** Project-specific env vars. */
  envs?: Record<string, EnvBinding>;
  /** Optional. Supabase Auth config to push when --apply runs. Requires
   * supabase_project_ref to be set. */
  auth_config?: AuthConfig;
}

/**
 * A `secrets:` block entry — describes how to resolve a `$secret:NAME`
 * ref. The reference `ref: "$secret:platform_trust_service_key"` looks
 * up `secrets.platform_trust_service_key` and resolves via the shape
 * declared there.
 *
 * Currently supported: from_supabase. Future: from_env, from_op (1Password).
 */
export interface SecretSource {
  from_supabase?: {
    project_ref: string;
    field: "url" | "anon_key" | "service_role_key";
  };
}

/** Top-level manifest schema. */
export interface Manifest {
  team_id: string;
  /** Env vars common to multiple projects. Project entries opt in via
   * `inherit_shared: [VAR_NAME, ...]`. */
  shared: Record<string, EnvBinding>;
  /** Optional. Resolution sources for `ref: "$secret:NAME"` placeholders. */
  secrets?: Record<string, SecretSource>;
  projects: ProjectConfig[];
}

/** A single env var as Vercel reports it from the API. */
export interface VercelEnvVar {
  key: string;
  /** Vercel returns one record per (key, target) tuple. */
  target: VercelTarget[];
  type: "plain" | "encrypted" | "system" | "secret" | "sensitive";
}

/**
 * One Vercel env-var *record* including its id. v0.5 apply needs ids
 * to PATCH existing entries. Unlike VercelEnvVar (which collapses by
 * key), this is the raw row — multiple rows per key are possible if
 * Vercel split values across targets.
 */
export interface VercelEnvRecord {
  id: string;
  key: string;
  target: VercelTarget[];
  type: VercelEnvVar["type"];
}

/** Result of one apply action against one (project, key) pair. */
export type ApplyAction =
  | { kind: "skipped"; key: string; reason: string }
  | { kind: "created"; key: string; targets: VercelTarget[] }
  | { kind: "updated"; key: string; added_targets: VercelTarget[] }
  | { kind: "error"; key: string; error: string };

/** Apply result for one project. */
export interface ProjectApplyResult {
  project: string;
  vercel_project_id: string;
  actions: ApplyAction[];
}

/** Result of applying Supabase Auth config to one project. */
export type AuthApplyAction =
  | { kind: "no_change"; reason: string }
  | { kind: "patched"; fields: string[] }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; error: string };

/** Result of auditing one env var on one project. */
export type EnvStatus =
  | { kind: "ok"; targets: VercelTarget[] }
  | { kind: "needs_attention"; present_in: VercelTarget[]; missing_from: VercelTarget[] }
  | { kind: "missing" }
  | { kind: "extra"; present_in: VercelTarget[] };

/** Full audit row for one env var on one project. */
export interface AuditRow {
  project: string;
  key: string;
  expected_targets: VercelTarget[];
  status: EnvStatus;
}

/** Audit result for one project. */
export interface ProjectAudit {
  project: string;
  vercel_project_id: string;
  /** Set if the Vercel API returned an error for this project. */
  error?: string;
  rows: AuditRow[];
}
