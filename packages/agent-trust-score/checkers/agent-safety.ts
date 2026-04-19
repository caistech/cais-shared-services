/**
 * Agent Safety Checkers (AS-01 through AS-09)
 *
 * Static analysis for agentic-specific security patterns.
 */

import type { CriterionResult } from "../types";
import { findFiles, grepFiles, hasPattern, readFile, fileExists } from "./static-utils";
import { join } from "path";

export function checkAgentSafety(root: string): CriterionResult[] {
  const files = findFiles(root, [".ts", ".tsx", ".js", ".jsx"]);

  return [
    checkAS01(root, files),
    checkAS02(root, files),
    checkAS03(root, files),
    checkAS04(root, files),
    checkAS05(root),
    checkAS06(root, files),
    checkAS07(root, files),
    checkAS08(root, files),
    checkAS09(root, files),
  ];
}

/** AS-01: Write Guard Semantic Integrity */
function checkAS01(root: string, files: string[]): CriterionResult {
  // Look for intent classification on write paths
  const hasIntentClassifier = grepFiles(
    files,
    /write_intent_classif|intent.*classif|semantic.*guard|operation.*intent/i,
    root
  );

  // Check for keyword-only write guards (bad pattern)
  const keywordGuards = grepFiles(
    files,
    /===?\s*["'](book|create|write|delete|update)["']|\.includes\(["'](book|create|write)/i,
    root
  );

  if (hasIntentClassifier.length > 0) {
    return {
      id: "AS-01", dimension: "agent_safety", verdict: "pass",
      severity: "high", title: "Write Guard Semantic Integrity",
      detail: `Intent classification found in ${hasIntentClassifier.length} location(s)`,
      remediation: "", effort: "low",
      locations: hasIntentClassifier,
    };
  }

  if (keywordGuards.length > 0) {
    return {
      id: "AS-01", dimension: "agent_safety", verdict: "fail",
      severity: "high", title: "Write Guard Semantic Integrity",
      detail: `Found ${keywordGuards.length} keyword-based write guard(s) without intent classification`,
      remediation: "Replace keyword checks with intent classification. Add write_intent_classifier to middleware.",
      effort: "medium", locations: keywordGuards,
    };
  }

  // No write guards found at all — partial (might not need them)
  return {
    id: "AS-01", dimension: "agent_safety", verdict: "partial",
    severity: "medium", title: "Write Guard Semantic Integrity",
    detail: "No write guard patterns detected — may not apply if project has no write operations",
    remediation: "If project has write operations, add intent classification.",
    effort: "medium",
  };
}

/** AS-02: Caller Authentication on All Endpoints */
function checkAS02(root: string, files: string[]): CriterionResult {
  const authPatterns = grepFiles(
    files,
    /caller_context|authenticate.*request|validateSession|session_token|checkAuth|withAuth|requireAuth/i,
    root
  );

  const apiRoutes = files.filter((f) => f.includes("/api/") && f.endsWith("route.ts"));
  const unprotectedRoutes: Array<{ file: string; line: number; snippet: string }> = [];

  for (const route of apiRoutes) {
    const content = readFile(route);
    if (!content) continue;
    if (!/authenticate|checkAuth|withAuth|requireAuth|session|caller_context|withTrust/i.test(content)) {
      unprotectedRoutes.push({
        file: route.replace(root, "").replace(/^[/\\]/, ""),
        line: 1,
        snippet: "No authentication pattern found in route handler",
      });
    }
  }

  if (unprotectedRoutes.length === 0 && authPatterns.length > 0) {
    return {
      id: "AS-02", dimension: "agent_safety", verdict: "pass",
      severity: "critical", title: "Caller Authentication on All Endpoints",
      detail: `All ${apiRoutes.length} API routes have authentication patterns`,
      remediation: "", effort: "low",
    };
  }

  return {
    id: "AS-02", dimension: "agent_safety",
    verdict: unprotectedRoutes.length > 0 ? "fail" : "partial",
    severity: "critical", title: "Caller Authentication on All Endpoints",
    detail: `${unprotectedRoutes.length} API route(s) missing authentication`,
    remediation: "Add caller_context or auth middleware to all API routes.",
    effort: "medium", locations: unprotectedRoutes,
  };
}

/** AS-03: Resource Ceiling Enforcement */
function checkAS03(root: string, files: string[]): CriterionResult {
  const hasTokenCeiling = hasPattern(root, /MAX_SESSION_TOKENS|token.*ceiling|token.*budget|token.*limit/i);
  const hasRateLimit = hasPattern(root, /rate.?limit|checkRateLimit|rateLimiter/i);
  const hasMaxTurns = hasPattern(root, /max_turns|maxIterations|MAX_ITERATIONS|max_wall_time/i);

  const checks = [hasTokenCeiling, hasRateLimit, hasMaxTurns];
  const passed = checks.filter(Boolean).length;

  if (passed === 3) {
    return {
      id: "AS-03", dimension: "agent_safety", verdict: "pass",
      severity: "high", title: "Resource Ceiling Enforcement",
      detail: "Token ceiling, rate limiting, and max iterations all present",
      remediation: "", effort: "low",
    };
  }

  const missing: string[] = [];
  if (!hasTokenCeiling) missing.push("token ceiling (MAX_SESSION_TOKENS)");
  if (!hasRateLimit) missing.push("rate limiting");
  if (!hasMaxTurns) missing.push("max iterations/turns");

  return {
    id: "AS-03", dimension: "agent_safety",
    verdict: passed > 0 ? "partial" : "fail",
    severity: "high", title: "Resource Ceiling Enforcement",
    detail: `Missing: ${missing.join(", ")}`,
    remediation: "Add resource ceiling env vars, rate limiting middleware, and max_turns config.",
    effort: "low",
  };
}

/** AS-04: Session Identity Integrity */
function checkAS04(root: string, files: string[]): CriterionResult {
  const hasSessionRotation = hasPattern(root, /session.*rotat|rotate.*session|new.*session.*token|session.*start.*token/i);
  const hasRevalidation = hasPattern(root, /re.?validat|re.?authenticat|validate.*identity|verify.*session/i);

  if (hasSessionRotation && hasRevalidation) {
    return {
      id: "AS-04", dimension: "agent_safety", verdict: "pass",
      severity: "high", title: "Session Identity Integrity",
      detail: "Session rotation and identity re-validation patterns found",
      remediation: "", effort: "low",
    };
  }

  return {
    id: "AS-04", dimension: "agent_safety",
    verdict: hasSessionRotation || hasRevalidation ? "partial" : "fail",
    severity: "high", title: "Session Identity Integrity",
    detail: `Missing: ${!hasSessionRotation ? "session token rotation" : ""}${!hasSessionRotation && !hasRevalidation ? " and " : ""}${!hasRevalidation ? "identity re-validation" : ""}`,
    remediation: "Rotate session tokens on SessionStart. Validate identity on every new session.",
    effort: "medium",
  };
}

/** AS-05: Social Engineering Resistance (behavioural only — static returns partial) */
function checkAS05(_root: string): CriterionResult {
  return {
    id: "AS-05", dimension: "agent_safety", verdict: "partial",
    severity: "medium", title: "Social Engineering Resistance",
    detail: "Behavioural probe required — static analysis cannot verify social engineering resistance",
    remediation: "Run behavioural probes to test multi-turn social pressure scenarios.",
    effort: "low",
  };
}

/** AS-06: Prompt Injection via Trusted Content */
function checkAS06(root: string, files: string[]): CriterionResult {
  const hasCamel = hasPattern(root, /security.?gate|securityGate|quarantine|CaMeL|camel/i);
  const hasSanitizer = hasPattern(root, /sanitize.*input|input.*sanitiz|sanitizeInput/i);
  const hasQuarantine = hasPattern(root, /quarantine|sandboxed.*LLM|untrusted.*content/i);

  if (hasCamel && hasSanitizer) {
    return {
      id: "AS-06", dimension: "agent_safety", verdict: "pass",
      severity: "critical", title: "Prompt Injection via Trusted Content",
      detail: "CaMeL pipeline and input sanitizer detected",
      remediation: "", effort: "low",
    };
  }

  if (hasSanitizer || hasQuarantine) {
    return {
      id: "AS-06", dimension: "agent_safety", verdict: "partial",
      severity: "critical", title: "Prompt Injection via Trusted Content",
      detail: "Partial injection protection found but full CaMeL pipeline not detected",
      remediation: "Integrate @caistech/security-gate on all content ingestion paths.",
      effort: "medium",
    };
  }

  return {
    id: "AS-06", dimension: "agent_safety", verdict: "fail",
    severity: "critical", title: "Prompt Injection via Trusted Content",
    detail: "No prompt injection protection detected",
    remediation: "Integrate @platform-trust/security-gate on all content ingestion paths.",
    effort: "high",
  };
}

/** AS-07: Silent Failure Detection */
function checkAS07(root: string, files: string[]): CriterionResult {
  const hasAuditLog = hasPattern(root, /audit.?log|logAuditEvent|status.*failed|status.*error/i);
  const hasFailureNotification = hasPattern(root, /notify.*fail|alert.*fail|dead.?letter|fail.*notification/i);

  // Check for silent catch patterns (bad)
  const silentCatches = grepFiles(
    files,
    /catch\s*\([^)]*\)\s*\{[\s\n]*console\.(log|warn|error)/,
    root
  );

  if (hasAuditLog && silentCatches.length === 0) {
    return {
      id: "AS-07", dimension: "agent_safety", verdict: "pass",
      severity: "high", title: "Silent Failure Detection",
      detail: "Audit logging present, no silent catch patterns found",
      remediation: "", effort: "low",
    };
  }

  return {
    id: "AS-07", dimension: "agent_safety",
    verdict: hasAuditLog ? "partial" : "fail",
    severity: "high", title: "Silent Failure Detection",
    detail: `${silentCatches.length} console-only catch block(s) found${!hasAuditLog ? ", no audit logging detected" : ""}`,
    remediation: "Wire all tool failures to platform-trust audit_log with status: 'failed'.",
    effort: "low", locations: silentCatches.slice(0, 5),
  };
}

/** AS-08: Cross-Agent Instruction Containment */
function checkAS08(root: string, files: string[]): CriterionResult {
  const hasMultiAgent = hasPattern(root, /multi.?agent|agent.*to.*agent|inter.?agent|cross.?agent/i);

  if (!hasMultiAgent) {
    // No multi-agent patterns — pass by default (not applicable)
    return {
      id: "AS-08", dimension: "agent_safety", verdict: "pass",
      severity: "high", title: "Cross-Agent Instruction Containment",
      detail: "No multi-agent patterns detected — criterion not applicable",
      remediation: "", effort: "low",
    };
  }

  const hasPermissionOnInterAgent = hasPattern(
    root,
    /checkPermission.*agent|agent.*checkPermission|validate.*agent.*instruction/i
  );

  return {
    id: "AS-08", dimension: "agent_safety",
    verdict: hasPermissionOnInterAgent ? "pass" : "fail",
    severity: "high", title: "Cross-Agent Instruction Containment",
    detail: hasPermissionOnInterAgent
      ? "Permission checks present on inter-agent messages"
      : "Multi-agent patterns found but no permission checks on inter-agent messages",
    remediation: "All inter-agent instructions must pass through checkPermission middleware.",
    effort: "medium",
  };
}

/** AS-09: Safety Coordination Logging */
function checkAS09(root: string, files: string[]): CriterionResult {
  const hasRefusalLog = hasPattern(root, /safety_coordination|refusal.*log|log.*refusal/i);

  // Check Supabase migrations for the table
  const migrations = findFiles(join(root, "supabase"), [".sql"]);
  const hasTable = migrations.some((f) => {
    const content = readFile(f);
    return content?.includes("safety_coordination_log") ?? false;
  });

  if (hasRefusalLog || hasTable) {
    return {
      id: "AS-09", dimension: "agent_safety", verdict: "pass",
      severity: "low", title: "Safety Coordination Logging",
      detail: "Safety coordination logging detected",
      remediation: "", effort: "low",
    };
  }

  return {
    id: "AS-09", dimension: "agent_safety", verdict: "fail",
    severity: "low", title: "Safety Coordination Logging",
    detail: "No safety coordination logging found (design credit — not penalised in grade override)",
    remediation: "Add safety_coordination_log table. Wire agent refusal events to log.",
    effort: "low",
  };
}
