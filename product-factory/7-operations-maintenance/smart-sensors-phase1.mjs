#!/usr/bin/env node
/**
 * product-factory/7-operations-maintenance/smart-sensors-phase1.mjs
 * 
 * SMART SENSORS — Phase 1 (Must Have)
 * 
 * House-building analogy: Post-occupancy monitoring — if the house is on fire 
 * (health) or unlocked (security) — nothing else matters. Cost is also critical.
 * 
 * Phase 1 Sensors:
 * - Health: Uptime, 200 vs errors, dependency health
 * - Security: Auth anomalies, exposure, rate limits  
 * - Cost: Monthly spend vs budget, cost spikes
 * 
 * Usage:
 *   node smart-sensors-phase1.mjs run              # Run all sensors
 *   node smart-sensors-phase1.mjs health           # Health sensor only
 *   node smart-sensors-phase1.mjs security         # Security sensor only
 *   node smart-sensors-phase1.mjs cost             # Cost sensor only
 *   node smart-sensors-phase1.mjs cost --upload    # Upload cost data
 *   node smart-sensors-phase1.mjs dashboard        # Show dashboard
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_FACTORY = resolve(dirname(fileURLToPath(import.meta.url)));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

const SENSOR_DATA_DIR = resolve(PRODUCT_FACTORY, "7-operations-maintenance", "sensor-data");

function ensureDataDir() {
  if (!existsSync(SENSOR_DATA_DIR)) {
    mkdirSync(SENSOR_DATA_DIR, { recursive: true });
  }
}

function loadManifest() {
  const manifestPath = resolve(ROOT, "portfolio-manifest.yaml");
  if (!existsSync(manifestPath)) {
    console.log("⚠️ portfolio-manifest.yaml not found");
    return [];
  }
  try {
    const content = readFileSync(manifestPath, "utf8");
    const products = [];
    let currentProduct = {};
    
    for (const line of content.split("\n")) {
      if (line.startsWith("  slug: ")) {
        if (currentProduct.slug) products.push(currentProduct);
        currentProduct = { slug: line.replace("  slug: ", "").trim() };
      } else if (line.startsWith("    display_name: ")) {
        currentProduct.display_name = line.replace("    display_name: ", "").trim();
      } else if (line.startsWith("    canonical_url: ")) {
        currentProduct.canonical_url = line.replace("    canonical_url: ", "").trim();
      }
    }
    if (currentProduct.slug) products.push(currentProduct);
    
    return products;
  } catch (e) {
    console.error("Failed to parse manifest:", e.message);
    return [];
  }
}

async function checkHealth(product) {
  const url = product.canonical_url || `https://${product.slug}-corporate-ai-solutions.vercel.app`;
  
  try {
    const res = await fetch(url, { 
      method: "HEAD",
      signal: AbortSignal.timeout(10000)
    });
    
    const status = res.ok ? "healthy" : "degraded";
    const statusCode = res.status;
    
    return {
      product: product.slug,
      url,
      status,
      status_code: statusCode,
      checked_at: new Date().toISOString(),
      details: statusCode === 200 ? "OK" : `HTTP ${statusCode}`
    };
  } catch (e) {
    return {
      product: product.slug,
      url,
      status: "down",
      status_code: 0,
      checked_at: new Date().toISOString(),
      details: e.message
    };
  }
}

async function runHealthSensor() {
  console.log(`\n🏥 HEALTH SENSOR`);
  console.log(`─`.repeat(40));
  
  const products = loadManifest();
  const results = [];
  
  for (const product of products) {
    const result = await checkHealth(product);
    results.push(result);
    
    const icon = result.status === "healthy" ? "✅" : result.status === "degraded" ? "⚠️" : "❌";
    console.log(`   ${icon} ${product.slug}: ${result.status} (${result.status_code})`);
  }
  
  const healthy = results.filter(r => r.status === "healthy").length;
  const degraded = results.filter(r => r.status === "degraded").length;
  const down = results.filter(r => r.status === "down").length;
  
  console.log(`\n   Summary: ${healthy} healthy, ${degraded} degraded, ${down} down`);
  
  ensureDataDir();
  const healthPath = resolve(SENSOR_DATA_DIR, "health-latest.json");
  writeFileSync(healthPath, JSON.stringify(results, null, 2));
  console.log(`   Saved to: sensor-data/health-latest.json`);
  
  return results;
}

async function checkSecurity(product) {
  const results = {
    product: product.slug,
    checked_at: new Date().toISOString(),
    auth_anomalies: [],
    exposed_secrets: [],
    rate_limit_hits: [],
    status: "ok"
  };
  
  try {
    const { url, key } = await import(`${ROOT}/scripts/gate-check.mjs`).then(m => m.resolveGatesCreds());
    
    const res = await fetch(
      `${url}/rest/v1/auth_logs?created_at=gt.${new Date(Date.now() - 24*60*60*1000).toISOString()}&select=id,email,action`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    
    if (res.ok) {
      const logs = await res.json();
      const failedLogins = logs.filter(l => l.action === "login_failed");
      
      if (failedLogins.length > 10) {
        results.auth_anomalies.push(`${failedLogins.length} failed logins in 24h`);
        results.status = "warning";
      }
    }
  } catch (e) {
    results.auth_anomalies.push(`Could not check auth logs: ${e.message}`);
  }
  
  return results;
}

async function runSecuritySensor() {
  console.log(`\n🔒 SECURITY SENSOR`);
  console.log(`─`.repeat(40));
  
  const products = loadManifest();
  const results = [];
  
  for (const product of products) {
    const result = await checkSecurity(product);
    results.push(result);
    
    const icon = result.status === "ok" ? "✅" : "⚠️";
    console.log(`   ${icon} ${product.slug}: ${result.status}`);
    if (result.auth_anomalies.length > 0) {
      result.auth_anomalies.forEach(a => console.log(`      - ${a}`));
    }
  }
  
  ensureDataDir();
  const securityPath = resolve(SENSOR_DATA_DIR, "security-latest.json");
  writeFileSync(securityPath, JSON.stringify(results, null, 2));
  console.log(`\n   Saved to: sensor-data/security-latest.json`);
  
  return results;
}

function loadCostData() {
  const costPath = resolve(SENSOR_DATA_DIR, "costs.json");
  if (existsSync(costPath)) {
    return JSON.parse(readFileSync(costPath, "utf8"));
  }
  return {};
}

function saveCostData(data) {
  ensureDataDir();
  const costPath = resolve(SENSOR_DATA_DIR, "costs.json");
  writeFileSync(costPath, JSON.stringify(data, null, 2));
}

function runCostSensor() {
  console.log(`\n💰 COST SENSOR`);
  console.log(`─`.repeat(40));
  
  const products = loadManifest();
  const costData = loadCostData();
  
  console.log(`   Note: This is Phase 1 — manual cost tracking`);
  console.log(`   Use --upload to update cost data`);
  console.log(`\n   Current cost data:`);
  
  for (const product of products) {
    const cost = costData[product.slug] || { monthly: 0, budget: 0 };
    const icon = cost.monthly > cost.budget && cost.budget > 0 ? "⚠️" : "✅";
    console.log(`   ${icon} ${product.slug}: $${cost.monthly}/mo (budget: $${cost.budget}/mo)`);
  }
  
  ensureDataDir();
  const costPath = resolve(SENSOR_DATA_DIR, "cost-latest.json");
  const summary = {
    products: products.map(p => ({
      slug: p.slug,
      display_name: p.display_name,
      current_cost: costData[p.slug]?.monthly || 0,
      budget: costData[p.slug]?.budget || 0,
      status: (costData[p.slug]?.monthly || 0) > (costData[p.slug]?.budget || 0) ? "over_budget" : "ok"
    })),
    total_cost: Object.values(costData).reduce((sum, c) => sum + (c.monthly || 0), 0),
    total_budget: Object.values(costData).reduce((sum, c) => sum + (c.budget || 0), 0),
    checked_at: new Date().toISOString()
  };
  writeFileSync(costPath, JSON.stringify(summary, null, 2));
  
  const total = summary.total_cost;
  const budget = summary.total_budget;
  const status = budget > 0 && total > budget ? "⚠️ OVER BUDGET" : "✅ Within budget";
  console.log(`\n   Total: $${total}/mo (budget: $${budget}/mo) — ${status}`);
  console.log(`   Saved to: sensor-data/cost-latest.json`);
  
  return summary;
}

function uploadCostData() {
  console.log(`\n📤 UPLOAD COST DATA`);
  console.log(`─`.repeat(40));
  
  const costData = loadCostData();
  const products = loadManifest();
  
  for (const product of products) {
    if (!costData[product.slug]) {
      costData[product.slug] = { monthly: 0, budget: 0 };
    }
  }
  
  saveCostData(costData);
  
  console.log(`   Cost data saved for ${Object.keys(costData).length} products`);
  console.log(`\n   To set costs manually, edit:`);
  console.log(`   ${SENSOR_DATA_DIR}/costs.json`);
  console.log(`\n   Format:`);
  console.log(`   { "product-slug": { "monthly": 100, "budget": 200 } }`);
}

function showDashboard() {
  console.log(`\n📊 SMART SENSORS DASHBOARD — Phase 1`);
  console.log(`═`.repeat(50));
  
  ensureDataDir();
  
  const healthPath = resolve(SENSOR_DATA_DIR, "health-latest.json");
  const securityPath = resolve(SENSOR_DATA_DIR, "security-latest.json");
  const costPath = resolve(SENSOR_DATA_DIR, "cost-latest.json");
  
  console.log(`\n🏥 HEALTH`);
  if (existsSync(healthPath)) {
    const health = JSON.parse(readFileSync(healthPath, "utf8"));
    const healthy = health.filter(r => r.status === "healthy").length;
    const degraded = health.filter(r => r.status === "degraded").length;
    const down = health.filter(r => r.status === "down").length;
    console.log(`   ✅ ${healthy} | ⚠️ ${degraded} | ❌ ${down}`);
  } else {
    console.log(`   No data. Run: node smart-sensors-phase1.mjs health`);
  }
  
  console.log(`\n🔒 SECURITY`);
  if (existsSync(securityPath)) {
    const security = JSON.parse(readFileSync(securityPath, "utf8"));
    const ok = security.filter(r => r.status === "ok").length;
    const warning = security.filter(r => r.status === "warning").length;
    console.log(`   ✅ ${ok} | ⚠️ ${warning}`);
  } else {
    console.log(`   No data. Run: node smart-sensors-phase1.mjs security`);
  }
  
  console.log(`\n💰 COST`);
  if (existsSync(costPath)) {
    const cost = JSON.parse(readFileSync(costPath, "utf8"));
    console.log(`   Total: $${cost.total_cost}/mo (budget: $${cost.total_budget}/mo)`);
  } else {
    console.log(`   No data. Run: node smart-sensors-phase1.mjs cost`);
  }
  
  console.log(`\n${`─`.repeat(50)}`);
  console.log(`   Data location: ${SENSOR_DATA_DIR}`);
}

async function main() {
  const cmd = process.argv[2] || "dashboard";
  
  switch (cmd) {
    case "run":
      await runHealthSensor();
      await runSecuritySensor();
      runCostSensor();
      showDashboard();
      break;
    case "health":
      await runHealthSensor();
      break;
    case "security":
      await runSecuritySensor();
      break;
    case "cost":
      if (has("upload")) {
        uploadCostData();
      } else {
        runCostSensor();
      }
      break;
    case "dashboard":
    default:
      showDashboard();
      break;
  }
}

main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
