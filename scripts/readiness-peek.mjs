#!/usr/bin/env node
/**
 * scripts/readiness-peek.mjs — read-only dump of readiness_results for a slug.
 * Used to measure before/after movement when the validation orchestrator runs.
 *
 *   node scripts/readiness-peek.mjs <slug> [--source <s>] [--deployment <id>]
 *
 * Resolves cockpit creds the same way gate-check does (CAIS_GATES_* / ~/.cais-gates.json /
 * Corporate-AI-Solutions/.env.local). Read-only — never writes.
 */
import { resolveGatesCreds } from "./gate-check.mjs";

const slug = process.argv[2];
if (!slug || slug.startsWith("--")) {
  console.error("usage: node scripts/readiness-peek.mjs <slug> [--source <s>] [--deployment <id>]");
  process.exit(1);
}
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const srcFilter = arg("source");
const deployFilter = arg("deployment");

const { url, key } = resolveGatesCreds();
let q = `${url}/rest/v1/readiness_results?product_slug=eq.${encodeURIComponent(slug)}` +
  `&select=check_code,status,source,deployment_id,scored_at&order=scored_at.desc`;
if (srcFilter) q += `&source=eq.${encodeURIComponent(srcFilter)}`;
if (deployFilter) q += `&deployment_id=eq.${encodeURIComponent(deployFilter)}`;

const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!res.ok) { console.error(`query failed ${res.status}: ${await res.text()}`); process.exit(1); }
const rows = await res.json();

const bySource = {};
for (const r of rows) {
  bySource[r.source] = bySource[r.source] || { pass: 0, fail: 0, na: 0, codes: [] };
  bySource[r.source][r.status] = (bySource[r.source][r.status] || 0) + 1;
  bySource[r.source].codes.push(`${r.check_code}=${r.status}`);
}
console.log(`\n=== readiness_results for ${slug} (${rows.length} rows) ===`);
for (const [src, s] of Object.entries(bySource)) {
  console.log(`\n[${src}]  pass:${s.pass||0} fail:${s.fail||0} na:${s.na||0}`);
  console.log("  " + s.codes.join(", "));
}
// Latest verdict per code (what the scorer effectively sees)
const latest = {};
for (const r of rows) if (!(r.check_code in latest)) latest[r.check_code] = r;
const codes = Object.keys(latest).sort((a, b) => Number(a) - Number(b));
console.log(`\n=== latest verdict per code (${codes.length} distinct) ===`);
console.log("  " + codes.map((c) => `#${c}=${latest[c].status}(${latest[c].source})`).join(", "));
const deploys = [...new Set(rows.map((r) => r.deployment_id).filter(Boolean))];
console.log(`\n=== deployments seen: ${deploys.length ? deploys.join(", ") : "(none bound)"}`);
