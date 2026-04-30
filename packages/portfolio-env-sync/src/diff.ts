import type {
  AuditRow,
  EnvStatus,
  ProjectAudit,
  ProjectConfig,
  VercelEnvVar,
  VercelTarget,
} from "./types.js";
import { defaultTargets, resolveProjectEnvs } from "./manifest.js";
import type { Manifest } from "./types.js";

/**
 * Given a project's manifest entry and the live Vercel env list,
 * compute one audit row per (manifest-declared key) and surface any
 * Vercel keys not declared in the manifest as `extra`.
 */
export function auditProject(
  manifest: Manifest,
  project: ProjectConfig,
  liveEnvs: VercelEnvVar[]
): ProjectAudit {
  const declared = resolveProjectEnvs(manifest, project);
  const liveByKey = new Map(liveEnvs.map((e) => [e.key, e] as const));
  const declaredKeys = new Set(Object.keys(declared));

  const rows: AuditRow[] = [];

  // 1. Each declared key — does it exist on Vercel with the expected targets?
  for (const [key, binding] of Object.entries(declared)) {
    const expected = binding.targets ?? defaultTargets();
    const live = liveByKey.get(key);
    rows.push({
      project: project.name,
      key,
      expected_targets: expected,
      status: classifyDeclared(expected, live),
    });
  }

  // 2. Each Vercel key NOT in manifest — flag as `extra` (informational).
  for (const live of liveEnvs) {
    if (declaredKeys.has(live.key)) continue;
    // Skip Vercel-system vars — they're not in the manifest by design.
    if (live.type === "system") continue;
    rows.push({
      project: project.name,
      key: live.key,
      expected_targets: [],
      status: { kind: "extra", present_in: live.target },
    });
  }

  return {
    project: project.name,
    vercel_project_id: project.vercel_project_id,
    rows,
  };
}

function classifyDeclared(
  expected: VercelTarget[],
  live: VercelEnvVar | undefined
): EnvStatus {
  if (!live) return { kind: "missing" };

  const present = new Set(live.target);
  const missingFrom = expected.filter((t) => !present.has(t));
  const presentIn = expected.filter((t) => present.has(t));

  if (missingFrom.length === 0) {
    return { kind: "ok", targets: presentIn };
  }
  return {
    kind: "needs_attention",
    present_in: presentIn,
    missing_from: missingFrom,
  };
}

/** Aggregate counts for a single project audit. */
export interface ProjectSummary {
  project: string;
  ok: number;
  needs_attention: number;
  missing: number;
  extra: number;
}

export function summarise(audit: ProjectAudit): ProjectSummary {
  const counts = { ok: 0, needs_attention: 0, missing: 0, extra: 0 };
  for (const row of audit.rows) {
    counts[row.status.kind]++;
  }
  return { project: audit.project, ...counts };
}
