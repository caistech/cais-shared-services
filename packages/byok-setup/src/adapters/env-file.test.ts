import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnvFile, writeEnvFile, assertGitignored } from "./env-file.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "byok-test-"));
});

describe("parseEnvFile", () => {
  it("parses keys, ignoring comments and blanks", () => {
    const out = parseEnvFile("# comment\n\nA=1\nB = two \n");
    expect(out).toEqual({ A: "1", B: "two" });
  });
});

describe("writeEnvFile", () => {
  it("writes new keys", () => {
    const p = join(dir, ".env.local");
    const r = writeEnvFile(p, { A: "1", B: "2" });
    expect(r.written.sort()).toEqual(["A", "B"]);
    expect(parseEnvFile(readFileSync(p, "utf8"))).toEqual({ A: "1", B: "2" });
  });
  it("keeps existing values by default (idempotent)", () => {
    const p = join(dir, ".env.local");
    writeFileSync(p, "A=old\n");
    const r = writeEnvFile(p, { A: "new", B: "2" });
    expect(r.kept).toEqual(["A"]);
    expect(r.written).toEqual(["B"]);
    expect(parseEnvFile(readFileSync(p, "utf8"))).toEqual({ A: "old", B: "2" });
  });
  it("overwrites with force", () => {
    const p = join(dir, ".env.local");
    writeFileSync(p, "A=old\n");
    writeEnvFile(p, { A: "new" }, { force: true });
    expect(parseEnvFile(readFileSync(p, "utf8")).A).toBe("new");
  });
  it("does not leave a .tmp file behind", () => {
    const p = join(dir, ".env.local");
    writeEnvFile(p, { A: "1" });
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });
});

describe("assertGitignored", () => {
  it("passes when the env file is listed", () => {
    const env = join(dir, ".env.local");
    const gi = join(dir, ".gitignore");
    writeFileSync(gi, "node_modules\n.env.local\n");
    expect(() => assertGitignored(env, gi)).not.toThrow();
  });
  it("throws when no .gitignore exists", () => {
    expect(() => assertGitignored(join(dir, ".env.local"), join(dir, ".gitignore"))).toThrow(/gitignore/);
  });
  it("throws when the env file is not listed", () => {
    const gi = join(dir, ".gitignore");
    writeFileSync(gi, "node_modules\n");
    expect(() => assertGitignored(join(dir, ".env.local"), gi)).toThrow(/not gitignored/);
  });
  it("honors a trailing-wildcard ignore (.env*)", () => {
    const gi = join(dir, ".gitignore");
    writeFileSync(gi, ".env*\n");
    expect(() => assertGitignored(join(dir, ".env.local"), gi)).not.toThrow();
  });
});
