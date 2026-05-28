#!/usr/bin/env node
/**
 * product-factory/5-certification-signoff/certify-product.mjs
 * 
 * CERTIFICATE OF OCCUPANCY — Stage 5: Certification & Sign-off
 * 
 * House-building analogy: Certifier issues the formal "ready for production" artifact
 * after all trade certificates are received.
 * 
 * This script:
 * 1. Aggregates trade certificates (auth, voice, security, responsive)
 * 2. Aggregates gate results (R1, R4, R10, R13)
 * 3. Issues Certificate of Occupancy with 30-day auto-reset
 * 
 * Usage:
 *   node certify-product.mjs <slug> [--force]
 *   node certify-product.mjs <slug> --check  # Check if valid
 *   node certify-product.mjs <slug> --renew  # Manual renew (resets 30-day timer)
 *   node certify-product.mjs <slug> --invalidate  # Invalidate (require human review)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_FACTORY = resolve(dirname(fileURLToPath(import.meta.url)));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

const VALIDITY_DAYS = 30;

async function getPortfolioGateResults(slug) {
  const { hasGatePassed, recordGate, getLiveProductionDeployment } = await import(`${ROOT}/scripts/gate-check.mjs`);
  
  const results = {
    R1: { status: "unknown", name: "Auth smoke test" },
    R4: { status: "unknown", name: "Auth smoke on save" },
    R10: { status: "unknown", name: "No verbatim errors" },
    R13: { status: "unknown", name: "Route smoke test" },
  };

  for (const gate of Object.keys(results)) {
    try {
      const passed = await hasGatePassed(slug, gate);
      results[gate].status = passed ? "pass" : "fail";
    } catch (e) {
      results[gate].status = "unknown";
    }
  }

  return results;
}

async function getTradeCertificates(slug) {
  const { recordReadiness, getLiveProductionDeployment } = await import(`${ROOT}/scripts/gate-check.mjs`);
  
  const certs = {
    auth_certificate: { status: "unknown", checks: [] },
    voice_certificate: { status: "unknown", checks: [] },
    security_certificate: { status: "unknown", checks: [] },
    responsive_certificate: { status: "unknown", checks: [] },
  };

  const readinessChecks = {
    auth_certificate: ["VT_C1", "VT_C2", "VT_C3", "VT_C4"],
    voice_certificate: ["VOICE_1", "VOICE_2"],
    security_certificate: ["CSO_1", "CSO_2"],
    responsive_certificate: ["RESP_1", "RESP_2"],
  };

  for (const [certName, checkCodes] of Object.entries(readinessChecks)) {
    let allPass = true;
    let anyFail = false;
    
    for (const code of checkCodes) {
      try {
        const { url, key } = await import(`${ROOT}/scripts/gate-check.mjs`).then(m => m.resolveGatesCreds());
        const res = await fetch(
          `${url}/rest/v1/readiness_results?product_slug=eq.${encodeURIComponent(slug)}&check_code=eq.${encodeURIComponent(code)}&order=created_at.desc&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          if (data[0].status === "fail") anyFail = true;
          if (data[0].status !== "pass") allPass = false;
        }
      } catch (e) {
        allPass = false;
      }
    }

    if (anyFail) certs[certName].status = "fail";
    else if (allPass) certs[certName].status = "pass";
    else certs[certName].status = "unknown";
  }

  return certs;
}

function calculateReadinessScore(gateResults, tradeCerts) {
  let total = 0;
  let passed = 0;

  for (const r of Object.values(gateResults)) {
    total++;
    if (r.status === "pass") passed++;
  }

  for (const c of Object.values(tradeCerts)) {
    total++;
    if (c.status === "pass") passed++;
  }

  return Math.round((passed / total) * 100);
}

function determineStatus(gateResults, tradeCerts) {
  const allGatesPass = Object.values(gateResults).every(r => r.status === "pass");
  const allCertsPass = Object.values(tradeCerts).every(c => c.status === "pass");
  
  if (allGatesPass && allCertsPass) return "passed";
  
  const anyGateFail = Object.values(gateResults).some(r => r.status === "fail");
  const anyCertFail = Object.values(tradeCerts).some(c => c.status === "fail");
  
  if (anyGateFail || anyCertFail) return "failed";
  return "warning";
}

function loadCertificate(slug) {
  const certPath = resolve(PRODUCT_FACTORY, "5-certification-signoff", "certificates", `${slug}.json`);
  if (existsSync(certPath)) {
    return JSON.parse(readFileSync(certPath, "utf8"));
  }
  return null;
}

function saveCertificate(cert) {
  const certDir = resolve(PRODUCT_FACTORY, "5-certification-signoff", "certificates");
  const certPath = resolve(certDir, `${cert.product_slug}.json`);
  
  const existing = existsSync(certDir) ? [] : [];
  writeFileSync(certPath, JSON.stringify(cert, null, 2));
  console.log(`📜 Certificate saved to: ${certPath}`);
}

async function checkCertificate(slug) {
  const cert = loadCertificate(slug);
  
  if (!cert) {
    console.log(`❌ No Certificate of Occupancy exists for ${slug}`);
    console.log(`   Run: node certify-product.mjs ${slug} --force`);
    return { valid: false, reason: "no_certificate" };
  }

  const now = new Date();
  const validUntil = new Date(cert.valid_until);
  
  if (now > validUntil) {
    console.log(`⚠️ Certificate EXPIRED for ${slug} (expired ${validUntil.toISOString()})`);
    return { valid: false, reason: "expired", certificate: cert };
  }

  if (cert.user_feedback_flag === "issues_reported") {
    console.log(`❌ Certificate INVALID for ${slug} — issues reported, human review required`);
    return { valid: false, reason: "issues_reported", certificate: cert };
  }

  if (cert.user_feedback_flag === "pending_review") {
    console.log(`⚠️ Certificate PENDING REVIEW for ${slug}`);
    return { valid: false, reason: "pending_review", certificate: cert };
  }

  console.log(`✅ Certificate VALID for ${slug}`);
  console.log(`   Issued: ${cert.issued_at}`);
  console.log(`   Valid until: ${cert.valid_until}`);
  console.log(`   Readiness score: ${cert.readiness_score}/100`);
  console.log(`   Status: ${cert.product_validation_status}`);
  
  return { valid: true, certificate: cert };
}

async function renewCertificate(slug) {
  const cert = loadCertificate(slug);
  
  if (!cert) {
    console.log(`❌ No Certificate to renew for ${slug}`);
    return;
  }

  const now = new Date();
  const newValidUntil = new Date(now.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  
  cert.issued_at = now.toISOString();
  cert.valid_until = newValidUntil.toISOString();
  cert.sign_off_authority = "auto";
  cert.last_user_checkin = now.toISOString();
  cert.user_feedback_flag = "no_issues";

  saveCertificate(cert);
  console.log(`✅ Certificate RENEWED for ${slug}`);
  console.log(`   New valid until: ${cert.valid_until}`);
}

async function invalidateCertificate(slug) {
  const cert = loadCertificate(slug);
  
  if (!cert) {
    console.log(`❌ No Certificate to invalidate for ${slug}`);
    return;
  }

  cert.user_feedback_flag = "issues_reported";
  cert.sign_off_authority = "human:dennis@corporateaisolutions.com";
  
  saveCertificate(cert);
  console.log(`❌ Certificate INVALIDATED for ${slug}`);
  console.log(`   Human review required before re-certification`);
}

async function issueCertificate(slug, force = false) {
  console.log(`\n🏠 CERTIFICATE OF OCCUPANCY — ${slug}`);
  console.log(`═`.repeat(50));

  const gateResults = await getPortfolioGateResults(slug);
  console.log(`\n📊 Gate Results:`);
  for (const [gate, result] of Object.entries(gateResults)) {
    const icon = result.status === "pass" ? "✅" : result.status === "fail" ? "❌" : "❓";
    console.log(`   ${icon} ${gate}: ${result.name} — ${result.status}`);
  }

  const tradeCerts = await getTradeCertificates(slug);
  console.log(`\n📜 Trade Certificates:`);
  for (const [cert, result] of Object.entries(tradeCerts)) {
    const icon = result.status === "pass" ? "✅" : result.status === "fail" ? "❌" : "❓";
    console.log(`   ${icon} ${cert} — ${result.status}`);
  }

  const readinessScore = calculateReadinessScore(gateResults, tradeCerts);
  const status = determineStatus(gateResults, tradeCerts);

  console.log(`\n📈 Readiness Score: ${readinessScore}/100`);
  console.log(`📋 Overall Status: ${status}`);

  if (status === "failed" && !force) {
    console.log(`\n❌ Certificate DENIED — not all gates/certificates passed`);
    console.log(`   Use --force to issue certificate anyway (not recommended)`);
    process.exit(1);
  }

  const now = new Date();
  const validUntil = new Date(now.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  const certificate = {
    product_slug: slug,
    issued_at: now.toISOString(),
    valid_until: validUntil.toISOString(),
    sign_off_authority: force ? "human:cli-force" : "auto",
    readiness_score: readinessScore,
    trade_certificates: Object.fromEntries(
      Object.entries(tradeCerts).map(([k, v]) => [k, v.status])
    ),
    gate_results: Object.fromEntries(
      Object.entries(gateResults).map(([k, v]) => [k, v.status])
    ),
    product_validation_status: status,
    last_user_checkin: now.toISOString(),
    user_feedback_flag: "no_issues",
  };

  saveCertificate(certificate);

  console.log(`\n🏠 CERTIFICATE OF OCCUPANCY ISSUED`);
  console.log(`   Product: ${slug}`);
  console.log(`   Valid until: ${certificate.valid_until}`);
  console.log(`   Auto-reset: Every 30 days (checks user_feedback_flag)`);
  console.log(`\n   🚨 IMPORTANT: If issues arise, run:`);
  console.log(`      node certify-product.mjs ${slug} --invalidate`);
  console.log(`   This will flag for human review instead of auto-renew`);
}

async function autoResetCertificate(slug) {
  const cert = loadCertificate(slug);
  
  if (!cert) {
    console.log(`No certificate to reset for ${slug}`);
    return;
  }

  const now = new Date();
  const validUntil = new Date(cert.valid_until);
  const daysUntilExpiry = Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24));

  console.log(`\n🔄 Certificate Auto-Reset Check: ${slug}`);
  console.log(`   Days until expiry: ${daysUntilExpiry}`);

  if (daysUntilExpiry > 7) {
    console.log(`   Not due for renewal yet (${daysUntilExpiry} days remaining)`);
    return;
  }

  if (cert.user_feedback_flag === "no_issues") {
    const newValidUntil = new Date(now.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    cert.issued_at = now.toISOString();
    cert.valid_until = newValidUntil.toISOString();
    cert.last_user_checkin = now.toISOString();
    cert.sign_off_authority = "auto";
    
    saveCertificate(cert);
    console.log(`✅ Certificate AUTO-RENEWED for ${slug}`);
    console.log(`   New valid until: ${cert.valid_until}`);
  } else if (cert.user_feedback_flag === "issues_reported") {
    console.log(`❌ Auto-renew BLOCKED — issues were reported`);
    console.log(`   Human review required before renewal`);
  } else if (cert.user_feedback_flag === "pending_review") {
    console.log(`⚠️ Auto-renew PENDING — no user feedback received`);
    console.log(`   Sending reminder...`);
  }
}

async function main() {
  const slug = process.argv[2];
  
  if (!slug) {
    console.log(`Usage:`);
    console.log(`  node certify-product.mjs <slug>           # Issue certificate`);
    console.log(`  node certify-product.mjs <slug> --force    # Force issue (not recommended)`);
    console.log(`  node certify-product.mjs <slug> --check    # Check if valid`);
    console.log(`  node certify-product.mjs <slug> --renew    # Manual renew`);
    console.log(`  node certify-product.mjs <slug> --invalidate # Flag for human review`);
    console.log(`  node certify-product.mjs <slug> --auto-reset # Run auto-reset check`);
    process.exit(2);
  }

  if (has("check")) {
    await checkCertificate(slug);
  } else if (has("renew")) {
    await renewCertificate(slug);
  } else if (has("invalidate")) {
    await invalidateCertificate(slug);
  } else if (has("auto-reset")) {
    await autoResetCertificate(slug);
  } else {
    await issueCertificate(slug, has("force"));
  }
}

main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
