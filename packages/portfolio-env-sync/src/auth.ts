import type {
  AuthApplyAction,
  AuthConfig,
  ProjectConfig,
} from "./types.js";
import { SupabaseAuthError, type SupabaseManagementClient } from "./supabase.js";

/**
 * Map a manifest AuthConfig to the Supabase Management API field names.
 * Supabase represents redirect_urls as a comma-joined string in the
 * `uri_allow_list` field; we translate to that shape.
 */
function manifestToSupabaseFields(
  desired: AuthConfig
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (desired.site_url !== undefined) out.site_url = desired.site_url;
  if (desired.redirect_urls !== undefined) {
    out.uri_allow_list = desired.redirect_urls.join(",");
  }
  if (desired.rate_limit_email_sent !== undefined) {
    out.rate_limit_email_sent = desired.rate_limit_email_sent;
  }
  if (desired.mailer_otp_exp !== undefined) {
    out.mailer_otp_exp = desired.mailer_otp_exp;
  }
  if (desired.mailer_otp_length !== undefined) {
    out.mailer_otp_length = desired.mailer_otp_length;
  }
  if (desired.smtp_max_frequency !== undefined) {
    out.smtp_max_frequency = desired.smtp_max_frequency;
  }
  return out;
}

/**
 * Compare desired vs live Supabase Auth config; return only the fields
 * that differ. Empty object means in-sync. Used to make PATCH idempotent
 * and to log which fields actually changed.
 */
function diffFields(
  desired: Record<string, unknown>,
  live: Record<string, unknown>
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(desired)) {
    const liveVal = live[k];
    // For uri_allow_list, normalise comma+spaces for comparison
    if (k === "uri_allow_list" && typeof v === "string" && typeof liveVal === "string") {
      const normalise = (s: string) =>
        s.split(",").map((x) => x.trim()).filter(Boolean).sort().join(",");
      if (normalise(v) !== normalise(liveVal)) diff[k] = v;
      continue;
    }
    if (v !== liveVal) diff[k] = v;
  }
  return diff;
}

/**
 * Apply auth_config from a manifest project entry to the project's
 * Supabase Auth config. Idempotent: reads live config, computes diff,
 * only PATCHes fields that differ.
 *
 * Re-throws SupabaseAuthError so the CLI can surface auth failures as
 * config errors (exit 2) rather than per-project drift.
 */
export async function applyAuthConfig(
  project: ProjectConfig,
  supabaseFactory: () => SupabaseManagementClient
): Promise<AuthApplyAction> {
  if (!project.auth_config) {
    return { kind: "no_change", reason: "no auth_config declared" };
  }
  if (!project.supabase_project_ref) {
    return {
      kind: "skipped",
      reason: "auth_config declared but project has no supabase_project_ref",
    };
  }

  let supabase: SupabaseManagementClient;
  try {
    supabase = supabaseFactory();
  } catch (err) {
    if (err instanceof SupabaseAuthError) throw err;
    return {
      kind: "error",
      error: `Supabase client init failed: ${(err as Error).message}`,
    };
  }

  let live: Record<string, unknown>;
  try {
    live = await supabase.getAuthConfig(project.supabase_project_ref);
  } catch (err) {
    if (err instanceof SupabaseAuthError) throw err;
    return {
      kind: "error",
      error: `auth-config GET failed: ${(err as Error).message}`,
    };
  }

  const desired = manifestToSupabaseFields(project.auth_config);
  const diff = diffFields(desired, live);

  if (Object.keys(diff).length === 0) {
    return { kind: "no_change", reason: "already in sync" };
  }

  try {
    await supabase.patchAuthConfig(project.supabase_project_ref, diff);
    return { kind: "patched", fields: Object.keys(diff) };
  } catch (err) {
    if (err instanceof SupabaseAuthError) throw err;
    return {
      kind: "error",
      error: `auth-config PATCH failed: ${(err as Error).message}`,
    };
  }
}
