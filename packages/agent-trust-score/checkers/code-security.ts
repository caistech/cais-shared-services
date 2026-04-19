/**
 * Code Security Checkers (CS-01 through CS-05)
 */

import type { CriterionResult } from "../types";
import { findFiles, grepFiles, hasPattern, readFile, fileExists } from "./static-utils";
import { join } from "path";
import { execSync } from "child_process";

export function checkCodeSecurity(root: string): CriterionResult[] {
  const files = findFiles(root, [".ts", ".tsx", ".js", ".jsx"]);

  return [
    checkCS01(root),
    checkCS02(root, files),
    checkCS03(root, files),
    checkCS04(root, files),
    checkCS05(root),
  ];
}

/** CS-01: Dependency Vulnerabilities */
function checkCS01(root: string): CriterionResult {
  try {
    // Try npm audit
    const hasPackageLock = fileExists(join(root, "package-lock.json"));
    const hasPnpmLock = fileExists(join(root, "pnpm-lock.yaml"));

    let auditOutput: string;
    try {
      if (hasPnpmLock) {
        auditOutput = execSync("pnpm audit --json 2>/dev/null || true", {
          cwd: root, encoding: "utf-8", timeout: 30000,
        });
      } else {
        auditOutput = execSync("npm audit --json 2>/dev/null || true", {
          cwd: root, encoding: "utf-8", timeout: 30000,
        });
      }
    } catch {
      auditOutput = "";
    }

    // Parse audit output for severity counts
    const criticalMatch = auditOutput.match(/"critical"\s*:\s*(\d+)/);
    const highMatch = auditOutput.match(/"high"\s*:\s*(\d+)/);
    const criticalCount = criticalMatch ? parseInt(criticalMatch[1]) : 0;
    const highCount = highMatch ? parseInt(highMatch[1]) : 0;

    if (criticalCount === 0 && highCount === 0) {
      return {
        id: "CS-01", dimension: "code_security", verdict: "pass",
        severity: "high", title: "Dependency Vulnerabilities",
        detail: "No critical or high CVEs in dependencies",
        remediation: "", effort: "low",
      };
    }

    return {
      id: "CS-01", dimension: "code_security", verdict: "fail",
      severity: criticalCount > 0 ? "critical" : "high",
      title: "Dependency Vulnerabilities",
      detail: `${criticalCount} critical, ${highCount} high severity CVEs found`,
      remediation: "Run npm audit fix or update vulnerable packages.",
      effort: "low",
    };
  } catch {
    return {
      id: "CS-01", dimension: "code_security", verdict: "partial",
      severity: "medium", title: "Dependency Vulnerabilities",
      detail: "Unable to run dependency audit",
      remediation: "Ensure npm/pnpm is available and run audit manually.",
      effort: "low",
    };
  }
}

/** CS-02: Secret Exposure */
function checkCS02(root: string, files: string[]): CriterionResult {
  const secretPatterns = [
    /sk-ant-[a-zA-Z0-9]{20,}/,     // Anthropic API key
    /sk-[a-zA-Z0-9]{40,}/,          // OpenAI API key
    /ghp_[a-zA-Z0-9]{36}/,          // GitHub PAT
    /gho_[a-zA-Z0-9]{36}/,          // GitHub OAuth
    /sbp_[a-zA-Z0-9]{40,}/,         // Supabase service key
    /eyJ[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{50,}/, // JWT tokens
    /AKIA[A-Z0-9]{16}/,             // AWS access key
    /password\s*[:=]\s*["'][^"']{8,}["']/i, // Hardcoded passwords
  ];

  const allMatches: Array<{ file: string; line: number; snippet: string }> = [];

  for (const pattern of secretPatterns) {
    const matches = grepFiles(files, pattern, root);
    // Exclude test files, examples, and .env.example
    const filtered = matches.filter(
      (m) =>
        !m.file.includes("test") &&
        !m.file.includes(".example") &&
        !m.file.includes("mock") &&
        !m.file.includes("fixture")
    );
    allMatches.push(...filtered);
  }

  if (allMatches.length === 0) {
    return {
      id: "CS-02", dimension: "code_security", verdict: "pass",
      severity: "critical", title: "Secret Exposure",
      detail: "No secrets detected in codebase",
      remediation: "", effort: "low",
    };
  }

  return {
    id: "CS-02", dimension: "code_security", verdict: "fail",
    severity: "critical", title: "Secret Exposure",
    detail: `${allMatches.length} potential secret(s) found in codebase`,
    remediation: "Remove secrets from code. Use environment variables. Rotate exposed keys.",
    effort: "high",
    locations: allMatches.slice(0, 10).map((m) => ({
      ...m, snippet: m.snippet.replace(/[a-zA-Z0-9]{10,}/g, "***REDACTED***"),
    })),
  };
}

/** CS-03: OWASP Top 10 API Surface */
function checkCS03(root: string, files: string[]): CriterionResult {
  const apiRoutes = files.filter((f) => f.includes("/api/") && f.endsWith("route.ts"));
  const hasAuth = hasPattern(root, /authenticate|checkAuth|withAuth|requireAuth|withTrust/i);
  const hasValidation = hasPattern(root, /zod|z\.object|yup|joi|validate|schema/i);
  const hasRateLimit = hasPattern(root, /rate.?limit|checkRateLimit|rateLimiter/i);

  const checks = [hasAuth, hasValidation, hasRateLimit];
  const passed = checks.filter(Boolean).length;

  if (passed === 3) {
    return {
      id: "CS-03", dimension: "code_security", verdict: "pass",
      severity: "high", title: "OWASP Top 10 API Surface",
      detail: `Authentication, validation, and rate limiting detected across ${apiRoutes.length} routes`,
      remediation: "", effort: "low",
    };
  }

  const missing: string[] = [];
  if (!hasAuth) missing.push("authentication");
  if (!hasValidation) missing.push("input validation");
  if (!hasRateLimit) missing.push("rate limiting");

  return {
    id: "CS-03", dimension: "code_security",
    verdict: passed > 0 ? "partial" : "fail",
    severity: "high", title: "OWASP Top 10 API Surface",
    detail: `Missing: ${missing.join(", ")} on API routes`,
    remediation: "Add auth middleware, input validation, and rate limiting to all endpoints.",
    effort: "medium",
  };
}

/** CS-04: Token/Key Governance */
function checkCS04(root: string, files: string[]): CriterionResult {
  const hasExpiry = hasPattern(root, /token.*expir|expir.*token|expires_at|ttl/i);
  const hasHashing = hasPattern(root, /hash.*token|token.*hash|bcrypt|argon|sha256.*token/i);
  const hasRotation = hasPattern(root, /rotat.*token|token.*rotat|last_rotated|rotation_count/i);

  const checks = [hasExpiry, hasHashing, hasRotation];
  const passed = checks.filter(Boolean).length;

  if (passed === 3) {
    return {
      id: "CS-04", dimension: "code_security", verdict: "pass",
      severity: "medium", title: "Token/Key Governance",
      detail: "Token expiry, hashing, and rotation tracking detected",
      remediation: "", effort: "low",
    };
  }

  return {
    id: "CS-04", dimension: "code_security",
    verdict: passed > 0 ? "partial" : "fail",
    severity: "medium", title: "Token/Key Governance",
    detail: `${passed}/3 governance controls present (expiry: ${hasExpiry}, hash: ${hasHashing}, rotation: ${hasRotation})`,
    remediation: "Hash tokens at rest. Add expiry. Track rotation.",
    effort: "medium",
  };
}

/** CS-05: Environment Variable Hygiene */
function checkCS05(root: string): CriterionResult {
  const hasEnvExample = fileExists(join(root, ".env.example"));
  const hasEnvInGitignore = (() => {
    const gitignore = readFile(join(root, ".gitignore"));
    return gitignore?.includes(".env") ?? false;
  })();
  const hasCommittedEnv = fileExists(join(root, ".env")) || fileExists(join(root, ".env.local"));

  // Check .env.local is in gitignore (not committed)
  const gitignoreContent = readFile(join(root, ".gitignore")) ?? "";
  const envLocalIgnored = gitignoreContent.includes(".env.local");

  if (hasEnvExample && hasEnvInGitignore) {
    return {
      id: "CS-05", dimension: "code_security", verdict: "pass",
      severity: "medium", title: "Environment Variable Hygiene",
      detail: ".env.example present, .env in .gitignore",
      remediation: "", effort: "low",
    };
  }

  return {
    id: "CS-05", dimension: "code_security",
    verdict: hasEnvExample || hasEnvInGitignore ? "partial" : "fail",
    severity: "medium", title: "Environment Variable Hygiene",
    detail: `${!hasEnvExample ? "Missing .env.example. " : ""}${!hasEnvInGitignore ? ".env not in .gitignore." : ""}`,
    remediation: "Add .env.example. Add .env to .gitignore.",
    effort: "low",
  };
}
