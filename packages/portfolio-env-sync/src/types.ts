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
}

/** Top-level manifest schema. */
export interface Manifest {
  team_id: string;
  /** Env vars common to multiple projects. Project entries opt in via
   * `inherit_shared: [VAR_NAME, ...]`. */
  shared: Record<string, EnvBinding>;
  projects: ProjectConfig[];
}

/** A single env var as Vercel reports it from the API. */
export interface VercelEnvVar {
  key: string;
  /** Vercel returns one record per (key, target) tuple. */
  target: VercelTarget[];
  type: "plain" | "encrypted" | "system" | "secret" | "sensitive";
}

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
