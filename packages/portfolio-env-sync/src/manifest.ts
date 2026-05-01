import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  EnvBinding,
  Manifest,
  ProjectConfig,
  SecretSource,
  VercelTarget,
} from "./types.js";
import { VERCEL_TARGETS } from "./types.js";

/**
 * Load and validate a portfolio manifest from disk.
 *
 * Manual TS validation rather than Zod for v0 — keeps deps minimal. If the
 * manifest grows past ~5 fields per binding, switch to Zod.
 */
export function loadManifest(path: string): Manifest {
  const raw = readFileSync(resolve(path), "utf-8");
  const parsed = parseYaml(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Manifest ${path} is empty or not a YAML mapping`);
  }

  const m = parsed as Record<string, unknown>;

  if (typeof m.team_id !== "string" || !m.team_id.startsWith("team_")) {
    throw new Error(`Manifest ${path}: 'team_id' must be a string starting with 'team_'`);
  }

  const shared = validateBindings("shared", m.shared);
  const secrets = validateSecrets("secrets", m.secrets);
  const projectsRaw = m.projects;
  if (!Array.isArray(projectsRaw)) {
    throw new Error(`Manifest ${path}: 'projects' must be a list`);
  }

  const projects: ProjectConfig[] = projectsRaw.map((p, i) => validateProject(p, i));

  // Validate inherit_shared references resolve to actual shared keys
  for (const project of projects) {
    for (const inherited of project.inherit_shared ?? []) {
      if (!(inherited in shared)) {
        throw new Error(
          `Manifest ${path}: project '${project.name}' inherits '${inherited}' but it's not in 'shared'`
        );
      }
    }
  }

  return { team_id: m.team_id, shared, secrets, projects };
}

/**
 * Look up a $secret:NAME reference in the manifest's secrets block.
 * Returns undefined if the secret name is not declared.
 */
export function lookupSecret(
  manifest: Manifest,
  secretRef: string
): SecretSource | undefined {
  const match = /^\$secret:(.+)$/.exec(secretRef);
  if (!match) return undefined;
  return manifest.secrets?.[match[1]!];
}

function validateSecrets(
  context: string,
  raw: unknown
): Record<string, SecretSource> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${context}: must be a mapping of NAME -> source`);
  }
  const out: Record<string, SecretSource> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = validateSecretSource(`${context}.${key}`, value);
  }
  return out;
}

function validateSecretSource(context: string, raw: unknown): SecretSource {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${context}: must be a mapping`);
  }
  const s = raw as Record<string, unknown>;
  const out: SecretSource = {};

  if (s.from_supabase !== undefined) {
    if (!s.from_supabase || typeof s.from_supabase !== "object") {
      throw new Error(`${context}.from_supabase: must be a mapping`);
    }
    const fs = s.from_supabase as Record<string, unknown>;
    if (typeof fs.project_ref !== "string" || !fs.project_ref) {
      throw new Error(`${context}.from_supabase.project_ref: required string`);
    }
    if (
      typeof fs.field !== "string" ||
      !["url", "anon_key", "service_role_key"].includes(fs.field)
    ) {
      throw new Error(
        `${context}.from_supabase.field: must be 'url', 'anon_key', or 'service_role_key'`
      );
    }
    out.from_supabase = {
      project_ref: fs.project_ref,
      field: fs.field as "url" | "anon_key" | "service_role_key",
    };
  }

  if (Object.keys(out).length === 0) {
    throw new Error(`${context}: no recognised source field (need from_supabase)`);
  }
  return out;
}

function validateProject(raw: unknown, idx: number): ProjectConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error(`projects[${idx}]: must be a mapping`);
  }
  const p = raw as Record<string, unknown>;

  if (typeof p.name !== "string" || !p.name) {
    throw new Error(`projects[${idx}]: 'name' is required`);
  }
  if (typeof p.vercel_project_id !== "string" || !p.vercel_project_id.startsWith("prj_")) {
    throw new Error(
      `projects[${idx}] (${p.name}): 'vercel_project_id' must start with 'prj_'`
    );
  }

  const result: ProjectConfig = {
    name: p.name,
    vercel_project_id: p.vercel_project_id,
  };

  if (typeof p.supabase_project_ref === "string") {
    result.supabase_project_ref = p.supabase_project_ref;
  }
  if (Array.isArray(p.inherit_shared)) {
    result.inherit_shared = p.inherit_shared.filter(
      (s): s is string => typeof s === "string"
    );
  }
  if (p.envs !== undefined) {
    result.envs = validateBindings(`projects[${idx}].envs`, p.envs);
  }

  return result;
}

function validateBindings(
  context: string,
  raw: unknown
): Record<string, EnvBinding> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${context}: must be a mapping of NAME -> binding`);
  }
  const out: Record<string, EnvBinding> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = validateBinding(`${context}.${key}`, value);
  }
  return out;
}

function validateBinding(context: string, raw: unknown): EnvBinding {
  // Allow shorthand: `KEY: "literal-value"` → { value: "literal-value" }
  if (typeof raw === "string") return { value: raw };

  if (!raw || typeof raw !== "object") {
    throw new Error(`${context}: binding must be a string or mapping`);
  }
  const b = raw as Record<string, unknown>;
  const out: EnvBinding = {};

  if (Array.isArray(b.targets)) {
    const targets = b.targets.filter(
      (t): t is VercelTarget =>
        typeof t === "string" && (VERCEL_TARGETS as readonly string[]).includes(t)
    );
    if (targets.length !== b.targets.length) {
      throw new Error(`${context}.targets: only ${VERCEL_TARGETS.join("/")} allowed`);
    }
    out.targets = targets;
  }
  if (typeof b.value === "string") out.value = b.value;
  if (typeof b.ref === "string") out.ref = b.ref;
  if (typeof b.from_supabase === "string") {
    if (!["url", "anon_key", "service_role_key"].includes(b.from_supabase)) {
      throw new Error(
        `${context}.from_supabase: must be 'url', 'anon_key', or 'service_role_key'`
      );
    }
    out.from_supabase = b.from_supabase as EnvBinding["from_supabase"];
  }

  return out;
}

/**
 * Resolve the full set of env bindings for a project, merging inherited
 * shared vars with project-specific ones. Project-specific overrides any
 * inherited binding of the same name.
 */
export function resolveProjectEnvs(
  manifest: Manifest,
  project: ProjectConfig
): Record<string, EnvBinding> {
  const out: Record<string, EnvBinding> = {};
  for (const name of project.inherit_shared ?? []) {
    const binding = manifest.shared[name];
    if (binding) out[name] = binding;
  }
  for (const [name, binding] of Object.entries(project.envs ?? {})) {
    out[name] = binding;
  }
  return out;
}

/** All Vercel targets, in canonical order. */
export function defaultTargets(): VercelTarget[] {
  return [...VERCEL_TARGETS];
}
