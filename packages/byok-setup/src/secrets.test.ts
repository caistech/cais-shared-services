import { describe, it, expect } from "vitest";
import { generateSecret } from "./secrets.js";

describe("generateSecret", () => {
  it("produces the requested character length", () => {
    expect(generateSecret("random-32")).toHaveLength(32);
    expect(generateSecret("random-48")).toHaveLength(48);
    expect(generateSecret("random-64")).toHaveLength(64);
  });
  it("is URL-safe (base64url — no +, /, or =)", () => {
    const s = generateSecret("random-64");
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("is non-deterministic", () => {
    expect(generateSecret("random-32")).not.toBe(generateSecret("random-32"));
  });
});
