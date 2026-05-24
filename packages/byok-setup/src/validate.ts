import type { ByokManifest, ByokService } from "./schema.js";

/** Parse + structurally validate a manifest. Throws on malformed input. */
export function loadManifest(raw: string): ByokManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`byok.config.json is not valid JSON: ${(e as Error).message}`);
  }
  const m = parsed as ByokManifest;
  if (!m || typeof m !== "object" || !Array.isArray(m.services)) {
    throw new Error("byok.config.json must be an object with a 'services' array.");
  }
  for (const s of m.services) {
    if (!s || !s.id || !s.envVar) {
      throw new Error(`Each service needs 'id' and 'envVar' (offending: ${JSON.stringify(s).slice(0, 80)})`);
    }
  }
  return m;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a pasted value. keyFormat is a shape hint, not proof of validity.
 * For JWT-class Supabase keys we additionally check the role claim, because anon
 * and service_role share the same `eyJ...` shape (SCHEMA finding 4).
 */
export function validateValue(service: ByokService, value: string): ValidationResult {
  if (!value) return { ok: false, reason: "empty" };
  if (service.keyFormat) {
    let re: RegExp;
    try {
      re = new RegExp(service.keyFormat);
    } catch {
      return { ok: true }; // a bad regex in the manifest must not block the operator
    }
    if (!re.test(value)) {
      return { ok: false, reason: `does not match expected format ${service.keyFormat}` };
    }
  }
  const expectedRole = expectedJwtRole(service);
  if (expectedRole && value.startsWith("eyJ")) {
    const role = decodeJwtRole(value);
    if (role && role !== expectedRole) {
      return { ok: false, reason: `JWT role is '${role}', expected '${expectedRole}' — wrong Supabase key pasted?` };
    }
  }
  return { ok: true };
}

function expectedJwtRole(service: ByokService): string | null {
  const v = service.envVar.toUpperCase();
  if (v.includes("SERVICE_ROLE")) return "service_role";
  if (v.includes("ANON")) return "anon";
  return null;
}

/** Decode a JWT payload's `role` claim, or null if not a JWT / no role. */
export function decodeJwtRole(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8")) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Is this key required given what's collected so far?
 * required:true → always. requiredIf "KEY=value" → required when collected[KEY] === value.
 * A prose requiredIf can't be auto-evaluated → treated as optional (operator judgment).
 */
export function isRequired(service: ByokService, collected: Record<string, string>): boolean {
  if (service.required) return true;
  if (service.requiredIf) {
    const m = service.requiredIf.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) return collected[m[1]] === m[2];
    return false;
  }
  return false;
}

/** Either/or groups where at least one member is required but none is set. */
export function exclusiveGroupViolations(manifest: ByokManifest, collected: Record<string, string>): string[] {
  const groups = new Map<string, ByokService[]>();
  for (const s of manifest.services) {
    if (!s.exclusiveGroup) continue;
    const arr = groups.get(s.exclusiveGroup) ?? [];
    arr.push(s);
    groups.set(s.exclusiveGroup, arr);
  }
  const violations: string[] = [];
  for (const [group, members] of groups) {
    const groupRequired = members.some((m) => m.required);
    const anySet = members.some((m) => Boolean(collected[m.envVar]));
    if (groupRequired && !anySet) {
      violations.push(`${group} (set one of: ${members.map((m) => m.envVar).join(" / ")})`);
    }
  }
  return violations;
}

/** Required keys (excluding exclusive-group members, handled separately) with no value. */
export function missingRequired(manifest: ByokManifest, collected: Record<string, string>): string[] {
  return manifest.services
    .filter((s) => !s.exclusiveGroup && isRequired(s, collected) && !collected[s.envVar])
    .map((s) => s.envVar);
}
