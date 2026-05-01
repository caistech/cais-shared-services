import type {
  ApplyAction,
  EnvBinding,
  Manifest,
  ProjectApplyResult,
  ProjectAudit,
  ProjectConfig,
  VercelEnvRecord,
} from "./types.js";
import { resolveProjectEnvs } from "./manifest.js";
import { VercelAuthError, type VercelClient } from "./vercel.js";
import { SupabaseAuthError, type SupabaseManagementClient } from "./supabase.js";

/**
 * Apply manifest declarations to Vercel for one project.
 *
 * Reads the audit (computed earlier from live Vercel state) and turns
 * each `missing` row into a CREATE, each `needs_attention` row into a
 * PATCH that adds the missing targets. `ok` and `extra` rows are no-ops.
 *
 * Value resolution order:
 *   1. binding.value (literal)
 *   2. binding.from_supabase + project.supabase_project_ref → Supabase
 *   3. binding.ref ($secret:...) → unsupported in v0.5; SKIPPED
 *
 * Re-throws auth errors (Vercel/Supabase) so the CLI can exit 2 — those
 * are config problems, not per-project drift.
 */
export async function applyProject(
  manifest: Manifest,
  project: ProjectConfig,
  audit: ProjectAudit,
  vercel: VercelClient,
  supabaseFactory: () => SupabaseManagementClient
): Promise<ProjectApplyResult> {
  const declared = resolveProjectEnvs(manifest, project);
  const actions: ApplyAction[] = [];

  // Cache the raw Vercel env list (with ids) once per project — needed
  // for any PATCH operations (needs_attention rows).
  let rawEnvsPromise: Promise<VercelEnvRecord[]> | undefined;
  const getRawEnvs = (): Promise<VercelEnvRecord[]> => {
    rawEnvsPromise ??= vercel.listEnvRaw(project.vercel_project_id);
    return rawEnvsPromise;
  };

  for (const row of audit.rows) {
    if (row.status.kind === "ok" || row.status.kind === "extra") continue;

    const binding = declared[row.key];
    if (!binding) {
      // Should be unreachable — declared keys are exactly what produces
      // missing/needs_attention rows. Defensive only.
      actions.push({
        kind: "skipped",
        key: row.key,
        reason: "no manifest binding",
      });
      continue;
    }

    if (row.status.kind === "missing") {
      const resolution = await resolveValue(binding, project, supabaseFactory);
      if (resolution.kind === "unresolvable") {
        actions.push({ kind: "skipped", key: row.key, reason: resolution.reason });
        continue;
      }
      try {
        await vercel.createEnv({
          projectIdOrName: project.vercel_project_id,
          key: row.key,
          value: resolution.value,
          targets: row.expected_targets,
        });
        actions.push({
          kind: "created",
          key: row.key,
          targets: row.expected_targets,
        });
      } catch (err) {
        if (err instanceof VercelAuthError) throw err;
        actions.push({
          kind: "error",
          key: row.key,
          error: (err as Error).message,
        });
      }
      continue;
    }

    // needs_attention — find the existing record(s) and PATCH targets
    const status = row.status; // narrow
    try {
      const raw = await getRawEnvs();
      const matching = raw.filter((r) => r.key === row.key);
      if (matching.length === 0) {
        actions.push({
          kind: "skipped",
          key: row.key,
          reason: "needs_attention but no record found (race condition?)",
        });
        continue;
      }
      if (matching.length > 1) {
        // Multiple Vercel rows for the same key — typically when values
        // differ across targets. Can't unify without picking a winner;
        // requires manual intervention.
        actions.push({
          kind: "skipped",
          key: row.key,
          reason: `${matching.length} Vercel records share this key — manual resolution required`,
        });
        continue;
      }
      const single = matching[0]!;
      const newTargets = [...status.present_in, ...status.missing_from];
      await vercel.updateEnvTargets({
        projectIdOrName: project.vercel_project_id,
        envId: single.id,
        targets: newTargets,
      });
      actions.push({
        kind: "updated",
        key: row.key,
        added_targets: status.missing_from,
      });
    } catch (err) {
      if (err instanceof VercelAuthError) throw err;
      if (err instanceof SupabaseAuthError) throw err;
      actions.push({
        kind: "error",
        key: row.key,
        error: (err as Error).message,
      });
    }
  }

  return {
    project: project.name,
    vercel_project_id: project.vercel_project_id,
    actions,
  };
}

type Resolution =
  | { kind: "resolved"; value: string }
  | { kind: "unresolvable"; reason: string };

async function resolveValue(
  binding: EnvBinding,
  project: ProjectConfig,
  supabaseFactory: () => SupabaseManagementClient
): Promise<Resolution> {
  if (binding.value !== undefined) {
    return { kind: "resolved", value: binding.value };
  }

  if (binding.from_supabase) {
    if (!project.supabase_project_ref) {
      return {
        kind: "unresolvable",
        reason: `from_supabase: '${binding.from_supabase}' but project has no supabase_project_ref`,
      };
    }
    let supabase: SupabaseManagementClient;
    try {
      supabase = supabaseFactory();
    } catch (err) {
      if (err instanceof SupabaseAuthError) throw err;
      return {
        kind: "unresolvable",
        reason: `Supabase client init failed: ${(err as Error).message}`,
      };
    }
    try {
      const value = await supabase.resolveBinding(
        project.supabase_project_ref,
        binding.from_supabase
      );
      return { kind: "resolved", value };
    } catch (err) {
      if (err instanceof SupabaseAuthError) throw err;
      return {
        kind: "unresolvable",
        reason: `Supabase resolution failed: ${(err as Error).message}`,
      };
    }
  }

  if (binding.ref) {
    return {
      kind: "unresolvable",
      reason: `ref: '${binding.ref}' — secret store integration not yet implemented`,
    };
  }

  return {
    kind: "unresolvable",
    reason: "binding has no value, from_supabase, or ref",
  };
}
