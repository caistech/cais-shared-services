import { describe, it, expect } from "vitest";
import {
  loadManifest,
  validateValue,
  decodeJwtRole,
  isRequired,
  exclusiveGroupViolations,
  missingRequired,
} from "./validate.js";
import type { ByokManifest, ByokService } from "./schema.js";

function jwtWithRole(role: string): string {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.sig`;
}

const svc = (s: Partial<ByokService>): ByokService => ({ id: "x", name: "X", envVar: "X", ...s });

describe("loadManifest", () => {
  it("parses a valid manifest", () => {
    const m = loadManifest('{"product":"p","services":[{"id":"a","name":"A","envVar":"A"}]}');
    expect(m.product).toBe("p");
    expect(m.services).toHaveLength(1);
  });
  it("throws on invalid JSON", () => {
    expect(() => loadManifest("{not json")).toThrow(/not valid JSON/);
  });
  it("throws when services is missing", () => {
    expect(() => loadManifest('{"product":"p"}')).toThrow(/services/);
  });
  it("throws when a service lacks id or envVar", () => {
    expect(() => loadManifest('{"product":"p","services":[{"name":"A"}]}')).toThrow(/id.*envVar/);
  });
});

describe("validateValue", () => {
  it("rejects empty", () => {
    expect(validateValue(svc({}), "").ok).toBe(false);
  });
  it("enforces keyFormat", () => {
    const s = svc({ keyFormat: "^sk-ant-[A-Za-z0-9_-]+$" });
    expect(validateValue(s, "sk-ant-abc123").ok).toBe(true);
    expect(validateValue(s, "nope").ok).toBe(false);
  });
  it("does not block on a malformed regex in the manifest", () => {
    expect(validateValue(svc({ keyFormat: "(" }), "anything").ok).toBe(true);
  });
  it("rejects a service_role JWT pasted into the anon slot (finding 4)", () => {
    const anon = svc({ envVar: "NEXT_PUBLIC_SUPABASE_ANON_KEY", keyFormat: "^eyJ" });
    const r = validateValue(anon, jwtWithRole("service_role"));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/role/);
  });
  it("accepts a correctly-roled JWT", () => {
    const anon = svc({ envVar: "NEXT_PUBLIC_SUPABASE_ANON_KEY", keyFormat: "^eyJ" });
    expect(validateValue(anon, jwtWithRole("anon")).ok).toBe(true);
  });
});

describe("decodeJwtRole", () => {
  it("extracts the role claim", () => {
    expect(decodeJwtRole(jwtWithRole("service_role"))).toBe("service_role");
  });
  it("returns null for non-JWTs", () => {
    expect(decodeJwtRole("not-a-jwt")).toBeNull();
  });
});

describe("isRequired", () => {
  it("honors required:true", () => {
    expect(isRequired(svc({ required: true }), {})).toBe(true);
  });
  it("evaluates requiredIf KEY=value against collected", () => {
    const s = svc({ requiredIf: "ENABLE_SECURITY_GATE=true" });
    expect(isRequired(s, { ENABLE_SECURITY_GATE: "true" })).toBe(true);
    expect(isRequired(s, { ENABLE_SECURITY_GATE: "false" })).toBe(false);
    expect(isRequired(s, {})).toBe(false);
  });
  it("treats prose requiredIf as optional (not auto-evaluable)", () => {
    expect(isRequired(svc({ requiredIf: "operator accepts DWG uploads" }), {})).toBe(false);
  });
});

describe("exclusiveGroupViolations", () => {
  const manifest: ByokManifest = {
    product: "p",
    services: [
      svc({ id: "anthropic", envVar: "ANTHROPIC_API_KEY", exclusiveGroup: "llm", required: true }),
      svc({ id: "openrouter", envVar: "OPENROUTER_API_KEY", exclusiveGroup: "llm" }),
    ],
  };
  it("flags a required group with nothing set", () => {
    expect(exclusiveGroupViolations(manifest, {})).toHaveLength(1);
  });
  it("is satisfied when one member is set", () => {
    expect(exclusiveGroupViolations(manifest, { OPENROUTER_API_KEY: "sk-or-x" })).toHaveLength(0);
  });
});

describe("missingRequired", () => {
  const manifest: ByokManifest = {
    product: "p",
    services: [
      svc({ id: "url", envVar: "URL", required: true }),
      svc({ id: "opt", envVar: "OPT" }),
      svc({ id: "llm", envVar: "ANTHROPIC_API_KEY", exclusiveGroup: "llm", required: true }),
    ],
  };
  it("lists unset required keys but excludes exclusive-group members", () => {
    expect(missingRequired(manifest, {})).toEqual(["URL"]);
    expect(missingRequired(manifest, { URL: "https://x" })).toEqual([]);
  });
});
