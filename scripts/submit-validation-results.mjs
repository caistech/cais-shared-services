#!/usr/bin/env node
/**
 * scripts/submit-validation-results.mjs
 *
 * Submits validation test results (Parts A-D from VALIDATION_TEST_PLAN_BOTH_PORTALS.md)
 * to the product_validation_status table AND readiness_results table.
 *
 * FIX 2026-05-31: the per-check status normalisation previously collapsed EVERYTHING
 * that wasn't "passed"/"failed" to "pass" — silently turning `na` and `warning` into
 * `pass`. That corrupted the readiness_results signal (an inapplicable check counted as
 * earned). Status now maps pass|fail|na faithfully; warning/unknown -> skipped (no row),
 * because readiness_results has no `warning` state and a fabricated pass is worse than
 * an absent verdict.
 *
 * Two modes:
 *   1. --file <results.json>     — structured JSON matching the API spec
 *   2. Inline flags              — --part-a, --part-b, etc.
 *
 * Usage:
 *   node scripts/submit-validation-results.mjs <slug> --file results.json [--record-readiness]
 *   node scripts/submit-validation-results.mjs <slug> \
 *     --part-a passed --part-b warning --part-c passed --part-d passed \
 *     --findings "Magic link rate limited" "Profiles email duplicated" \
 *     --tester dennis@corporateaisolutions.com --duration 45
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGatesCreds, recordReadiness } from "./gate-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const VALID_PARTS = ["a_admin_portal", "b_user_portal", "c_auth_flows", "d_scaffold"];
const VALID_STATUSES = ["passed", "warning", "failed", "not_run"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name) {
  return process.argv.includes(`--${name}`);
}
function allArgs(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return [];
  const values = [];
  for (let j = i + 1; j < process.argv.length; j++) {
    if (process.argv[j].startsWith("--")) break;
    values.push(process.argv[j]);
  }
  return values;
}

function computeComposite(parts) {
  const statuses = Object.values(parts).map((p) => p.status);
  if (statuses.every((s) => s === "passed")) return "passed";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "warning")) return "warning";
  return "not_run";
}

function countChecks(parts) {
  let passed = 0, warning = 0, failed = 0, total = 0;
  for (const part of Object.values(parts)) {
    if (!part.checks) continue;
    for (const check of Object.values(part.checks)) {
      total++;
      if (check.status === "passed") passed++;
      else if (check.status === "fail" || check.status === "failed") failed++;
      else if (check.status === "warning") warning++;
    }
  }
  return { total, passed, warning, failed };
}

/**
 * Map an inbound check status to the readiness_results vocabulary (pass|fail|na),
 * or null to SKIP (warning / unknown — no row, never a fabricated pass).
 */
function toReadinessStatus(s) {
  switch (s) {
    case "passed":
    case "pass":   return "pass";
    case "failed":
    case "fail":   return "fail";
    case "na":     return "na";
    default:       return null; // warning, not_run, unknown -> skip
  }
}

export async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: node scripts/submit-validation-results.mjs <slug> --file results.json");
    console.error("   or: node scripts/submit-validation-results.mjs <slug> --part-a passed --part-b warning ...");
    process.exit(2);
  }

  let results;
  const filePath = arg("file");

  if (filePath) {
    const absPath = resolve(ROOT, filePath);
    if (!existsSync(absPath)) {
      console.error(`File not found: ${absPath}`);
      process.exit(1);
    }
    results = JSON.parse(readFileSync(absPath, "utf8"));
  } else {
    const parts = {};
    for (const part of VALID_PARTS) {
      const status = arg(`part-${part}`);
      if (status) parts[part] = { status };
    }
    const findings = allArgs("findings");
    results = {
      parts,
      findings,
      overall_status: arg("status") || computeComposite(parts),
      tester: arg("tester") || "system",
      duration_minutes: parseInt(arg("duration") || "0", 10),
    };
  }

  for (const [partKey, part] of Object.entries(results.parts || {})) {
    if (!VALID_PARTS.includes(partKey)) {
      console.error(`Unknown part: ${partKey}. Valid: ${VALID_PARTS.join(", ")}`);
      process.exit(1);
    }
    if (!VALID_STATUSES.includes(part.status)) {
      console.error(`Invalid status for ${partKey}: "${part.status}". Valid: ${VALID_STATUSES.join(", ")}`);
      process.exit(1);
    }
  }

  if (!results.overall_status) {
    results.overall_status = computeComposite(results.parts || {});
  }

  const { url, key } = resolveGatesCreds();
  const supabaseHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: "return=representation",
  };
  const supabaseGet = async (path) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { method: "GET", headers: supabaseHeaders });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text().then(t => t.slice(0, 200))}`);
    return res.json();
  };
  const supabaseMutate = (path, { method, body }) =>
    fetch(`${url}/rest/v1/${path}`, { method, headers: supabaseHeaders, body: body ? JSON.stringify(body) : undefined });

  // Step 1: Upsert summary to product_validation_status
  const summaryPayload = {
    product_slug: slug,
    test_part_a_admin_portal: results.parts?.a_admin_portal?.status || "not_run",
    test_part_b_user_portal: results.parts?.b_user_portal?.status || "not_run",
    test_part_c_auth_flows: results.parts?.c_auth_flows?.status || "not_run",
    test_part_d_scaffold_verify: results.parts?.d_scaffold?.status || "not_run",
    validation_test_status: results.overall_status || computeComposite(results.parts || {}),
    validation_test_findings: results.findings || [],
    validation_test_results: results,
    last_validation_test_run: new Date().toISOString(),
  };

  let existingId = null;
  try {
    const existing = await supabaseGet(`product_validation_status?product_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
    existingId = Array.isArray(existing) && existing.length > 0 ? existing[0].id : null;
  } catch (e) {
    // no row yet — INSERT below
  }

  let summaryRes;
  if (existingId) {
    summaryRes = await supabaseMutate(
      `product_validation_status?product_slug=eq.${encodeURIComponent(slug)}`,
      { method: "PATCH", body: summaryPayload },
    );
  } else {
    summaryPayload.display_name = slug;
    summaryRes = await supabaseMutate("product_validation_status", {
      method: "POST",
      body: summaryPayload,
    });
  }

  if (!summaryRes.ok) {
    const err = await summaryRes.text();
    throw new Error(`Failed to write product_validation_status: ${summaryRes.status} ${err.slice(0, 300)}`);
  }
  console.log(`OK Summary written to product_validation_status for ${slug}`);

  // Step 2: Optionally write per-check granular results to readiness_results
  const CHECK_TO_VT = {
    admin_access: "VT_A1", settings_profile: "VT_A2", settings_password: "VT_A3",
    settings_notifications: "VT_A4", sign_out_everywhere: "VT_A5", delete_account: "VT_A6",
    user_access: "VT_B1", admin_denied: "VT_B2", settings_user: "VT_B3",
    sign_out: "VT_B4", feature_nav: "VT_B5",
    signup: "VT_C1", login: "VT_C2", forgot_password: "VT_C3", magic_link: "VT_C4",
    admin_emails: "VT_D1", test_user_created: "VT_D2", test_user_non_admin: "VT_D3",
    profiles_table: "VT_D4", profiles_trigger: "VT_D5", profiles_rls: "VT_D6",
    email_infrastructure: "VT_D7",
  };
  if (has("record-readiness")) {
    const readinessChecks = [];
    let skipped = 0;
    for (const [partKey, part] of Object.entries(results.parts || {})) {
      if (!part.checks) continue;
      for (const [checkCode, check] of Object.entries(part.checks)) {
        const vtCode = CHECK_TO_VT[checkCode];
        if (!vtCode) continue; // unmapped check name -> skip
        const checkStatus = toReadinessStatus(check.status);
        if (!checkStatus) { skipped++; continue; } // warning/unknown -> no fabricated pass
        readinessChecks.push({
          code: vtCode,
          status: checkStatus,
          evidence: check.note || null,
        });
      }
    }
    if (readinessChecks.length > 0) {
      try {
        // Pass deployment binding through if the caller resolved one (Delta 2).
        await recordReadiness({
          slug,
          source: "naive-tester",
          checks: readinessChecks,
          deploymentId: arg("deployment") || null,
          recordedBy: results.tester || "system",
        });
        console.log(`OK ${readinessChecks.length} per-check results written to readiness_results${skipped ? ` (${skipped} skipped: warning/unknown)` : ""}`);
      } catch (e) {
        console.error(`WARN record-readiness failed (non-critical): ${e.message}`);
      }
    }
  }

  const checks = countChecks(results.parts || {});
  console.log(`\nValidation Test Results: ${slug}`);
  console.log(`   Overall: ${results.overall_status}`);
  console.log(`   Part A (Admin Portal):     ${results.parts?.a_admin_portal?.status || "not_run"}`);
  console.log(`   Part B (User Portal):      ${results.parts?.b_user_portal?.status || "not_run"}`);
  console.log(`   Part C (Auth Flows):       ${results.parts?.c_auth_flows?.status || "not_run"}`);
  console.log(`   Part D (Scaffold Verify):  ${results.parts?.d_scaffold?.status || "not_run"}`);
  if (checks.total > 0) {
    console.log(`   Checks: ${checks.passed} passed, ${checks.warning} warning, ${checks.failed} failed (${checks.total} total)`);
  }
  if (results.findings?.length) {
    console.log(`   Findings (${results.findings.length}):`);
    results.findings.forEach((f, i) => console.log(`     ${i + 1}. ${f}`));
  }
  console.log(`   Tester: ${results.tester || "N/A"} | Duration: ${results.duration_minutes || "N/A"} min`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(`ERROR ${e.message}`); process.exit(1); });
}
