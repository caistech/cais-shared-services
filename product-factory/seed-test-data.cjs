#!/usr/bin/env node
/**
 * Seed test data for Product Factory dashboard demonstration
 */

const { readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const ROOT = join(homedir(), "PycharmProjects");
const envPath = join(ROOT, "Corporate-AI-Solutions", ".env.local");

function envValue(file, key) {
  try {
    const m = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
    if (!m) return null;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  } catch { return null; }
}

const url = envValue(envPath, "NEXT_PUBLIC_SUPABASE_URL");
const key = envValue(envPath, "SUPABASE_SERVICE_ROLE_KEY");

if (!url || !key) {
  console.error("Could not resolve Supabase credentials");
  process.exit(1);
}

async function rest(path, { method = "POST", body } = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const testProducts = [
  {
    product_slug: 'sayfix',
    display_name: 'SayFix',
    has_promise: true,
    has_distributor: true,
    has_end_user: true,
    has_friction: true,
    weighted_score_percent: 85,
    hard_gates_passed: 4,
    hard_gates_total: 5,
    validation_test_status: 'passed',
    gate1_ready: true,
    can_run_outreach: true,
    is_draft: false,
    is_paused: false,
  },
  {
    product_slug: 'singify',
    display_name: 'Singify',
    has_promise: true,
    has_distributor: true,
    has_end_user: true,
    has_friction: true,
    weighted_score_percent: 72,
    hard_gates_passed: 3,
    hard_gates_total: 5,
    validation_test_status: 'warning',
    gate1_ready: false,
    can_run_outreach: false,
    is_draft: false,
    is_paused: false,
  },
  {
    product_slug: 'deal-findrs',
    display_name: 'DealFindrs',
    has_promise: true,
    has_distributor: true,
    has_end_user: false,
    has_friction: false,
    weighted_score_percent: 45,
    hard_gates_passed: 2,
    hard_gates_total: 5,
    validation_test_status: 'not_run',
    gate1_ready: false,
    can_run_outreach: false,
    is_draft: false,
    is_paused: false,
  },
  {
    product_slug: 'r-and-d-tax',
    display_name: 'R&D Tax Tracker',
    has_promise: true,
    has_distributor: false,
    has_end_user: false,
    has_friction: false,
    weighted_score_percent: 20,
    hard_gates_passed: 1,
    hard_gates_total: 5,
    validation_test_status: 'not_run',
    gate1_ready: false,
    can_run_outreach: false,
    is_draft: true,
    is_paused: false,
  },
];

async function seedData() {
  console.log('Seeding test data for Product Factory dashboard...\n');

  for (const product of testProducts) {
    await rest(`product_validation_status`, { body: product });
    console.log(`✅ ${product.product_slug}: Seeded with ${product.weighted_score_percent}% readiness`);
  }

  const lifecycleStages = [
    { product_slug: 'sayfix', current_stage: 4, stage_name: 'Construction' },
    { product_slug: 'singify', current_stage: 3, stage_name: 'Compliance & Standards' },
    { product_slug: 'deal-findrs', current_stage: 2, stage_name: 'Design & Planning' },
    { product_slug: 'r-and-d-tax', current_stage: 1, stage_name: 'Pre-Development' },
  ];

  for (const stage of lifecycleStages) {
    await rest(`product_lifecycle_stage`, { body: stage });
    console.log(`  └─ Stage: ${stage.current_stage} (${stage.stage_name})`);
  }

  await rest(`certificate_of_occupancy`, {
    body: {
      product_slug: 'sayfix',
      issued_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      sign_off_authority: 'auto',
      readiness_score: 85,
      trade_certificates: { auth: 'pass', voice: 'pass', security: 'pass', responsive: 'pass' },
      gate_results: { R1: 'pass', R4: 'pass', R10: 'pass', R13: 'pass' },
      product_validation_status: 'passed',
      last_user_checkin: new Date().toISOString(),
      user_feedback_flag: 'no_issues',
    },
  });
  console.log(`  └─ Certificate of Occupancy: VALID`);

  const sensorData = [
    { product_slug: 'sayfix', sensor_type: 'health', status: 'ok', checked_at: new Date().toISOString() },
    { product_slug: 'sayfix', sensor_type: 'security', status: 'ok', checked_at: new Date().toISOString() },
    { product_slug: 'sayfix', sensor_type: 'cost', status: 'ok', checked_at: new Date().toISOString() },
    { product_slug: 'singify', sensor_type: 'health', status: 'warning', checked_at: new Date().toISOString() },
    { product_slug: 'singify', sensor_type: 'security', status: 'ok', checked_at: new Date().toISOString() },
    { product_slug: 'singify', sensor_type: 'cost', status: 'warning', checked_at: new Date().toISOString() },
  ];

  for (const sensor of sensorData) {
    await rest('smart_sensors', { body: sensor });
  }
  console.log(`  └─ Smart Sensors: Seeded ${sensorData.length} readings`);

  console.log('\n✅ Test data seeded successfully!');
  console.log('\nRefresh /admin/pipeline/factory to see the results.');
}

seedData().catch(console.error);
