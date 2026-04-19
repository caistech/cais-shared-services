/**
 * Compliance Checkers (CO-01 through CO-04)
 */

import type { CriterionResult } from "../types";
import { findFiles, grepFiles, hasPattern, readFile, fileExists } from "./static-utils";
import { join } from "path";

export function checkCompliance(root: string): CriterionResult[] {
  return [
    checkCO01(root),
    checkCO02(root),
    checkCO03(root),
    checkCO04(root),
  ];
}

/** CO-01: Australian Privacy Act (APP 11) */
function checkCO01(root: string): CriterionResult {
  const hasPiiLogging = hasPattern(root, /pii|personal.*info|privacy|data.*protection|access.*log.*personal/i);
  const hasRetentionPolicy = hasPattern(root, /retention.*polic|data.*retention|delete.*after|purge|ttl.*days/i);
  const hasAccessLogging = hasPattern(root, /logAuditEvent|audit.*log|access.*log/i);

  const checks = [hasPiiLogging, hasRetentionPolicy, hasAccessLogging];
  const passed = checks.filter(Boolean).length;

  if (passed >= 2) {
    return {
      id: "CO-01", dimension: "compliance", verdict: passed === 3 ? "pass" : "partial",
      severity: "high", title: "Australian Privacy Act (APP 11)",
      detail: `PII handling: ${hasPiiLogging ? "yes" : "no"}, Retention: ${hasRetentionPolicy ? "yes" : "no"}, Access logging: ${hasAccessLogging ? "yes" : "no"}`,
      remediation: passed === 3 ? "" : "Ensure all PII access is logged with retention policy.",
      effort: "medium",
    };
  }

  return {
    id: "CO-01", dimension: "compliance", verdict: "fail",
    severity: "high", title: "Australian Privacy Act (APP 11)",
    detail: "Insufficient PII controls detected",
    remediation: "Identify PII fields. Log access. Define retention policy.",
    effort: "high",
  };
}

/** CO-02: Audit Trail Completeness */
function checkCO02(root: string): CriterionResult {
  const hasAuditLog = hasPattern(root, /audit_log|logAuditEvent|auditLog/i);
  const hasImmutable = hasPattern(root, /insert.only|immutable|no.*update.*delete|INSERT ONLY/i);
  const hasInputHash = hasPattern(root, /input_hash|hash.*input|hashData/i);

  if (hasAuditLog && hasInputHash) {
    return {
      id: "CO-02", dimension: "compliance",
      verdict: hasImmutable ? "pass" : "partial",
      severity: "high", title: "Audit Trail Completeness",
      detail: `Audit logging${hasImmutable ? " (immutable)" : ""} with input hashing detected`,
      remediation: hasImmutable ? "" : "Ensure audit_log table is insert-only (no UPDATE/DELETE).",
      effort: "low",
    };
  }

  if (hasAuditLog) {
    return {
      id: "CO-02", dimension: "compliance", verdict: "partial",
      severity: "high", title: "Audit Trail Completeness",
      detail: "Audit logging present but missing input/output hashing",
      remediation: "Add input_hash and output_hash to audit log entries.",
      effort: "low",
    };
  }

  return {
    id: "CO-02", dimension: "compliance", verdict: "fail",
    severity: "high", title: "Audit Trail Completeness",
    detail: "No audit trail detected",
    remediation: "Wire all write operations to platform-trust audit_log.",
    effort: "medium",
  };
}

/** CO-03: Human Approval Gate on Write Operations */
function checkCO03(root: string): CriterionResult {
  const hasApproval = hasPattern(root, /requires_human_approval|human.*approval|approval.*gate|pending_approval/i);
  const hasApprovalUI = hasPattern(root, /approv|approval.*queue|approval.*dashboard/i);

  if (hasApproval && hasApprovalUI) {
    return {
      id: "CO-03", dimension: "compliance", verdict: "pass",
      severity: "medium", title: "Human Approval Gate on Write Operations",
      detail: "Human approval gates with UI detected",
      remediation: "", effort: "low",
    };
  }

  if (hasApproval) {
    return {
      id: "CO-03", dimension: "compliance", verdict: "partial",
      severity: "medium", title: "Human Approval Gate on Write Operations",
      detail: "Approval logic present but no approval UI detected",
      remediation: "Add approval queue UI for human reviewers.",
      effort: "medium",
    };
  }

  return {
    id: "CO-03", dimension: "compliance", verdict: "fail",
    severity: "medium", title: "Human Approval Gate on Write Operations",
    detail: "No human approval gates found",
    remediation: "Add requires_human_approval flag to permission policies for high-consequence operations.",
    effort: "medium",
  };
}

/** CO-04: Data Residency */
function checkCO04(root: string): CriterionResult {
  // Check for AU region Supabase
  const hasAuRegion = hasPattern(root, /ap-southeast-2|sydney|oceania|au-syd/i);
  const hasResidencyDoc = hasPattern(root, /data.residency|storage.location|region.*sydney|hosted.*australia/i);

  // Check Supabase URL for region
  const envExample = readFile(join(root, ".env.example"));
  const supabaseFiles = findFiles(root, [".ts"]).filter((f) =>
    readFile(f)?.includes("supabase") ?? false
  );

  if (hasAuRegion || hasResidencyDoc) {
    return {
      id: "CO-04", dimension: "compliance", verdict: "pass",
      severity: "medium", title: "Data Residency",
      detail: "Australian data residency (ap-southeast-2/Sydney) detected",
      remediation: "", effort: "low",
    };
  }

  return {
    id: "CO-04", dimension: "compliance", verdict: "fail",
    severity: "medium", title: "Data Residency",
    detail: "No data residency documentation or AU region configuration found",
    remediation: "Document data storage locations. Ensure AU data stays in AU Supabase region.",
    effort: "low",
  };
}
