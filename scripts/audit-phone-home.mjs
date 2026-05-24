#!/usr/bin/env node
/**
 * audit-phone-home.mjs
 *
 * Audits every @caistech/* package in this monorepo for "phone-home" behaviour —
 * network calls that target CAS-hosted infrastructure (corporateaisolutions.com,
 * corporate-ai-solutions.vercel.app, dennissolver-owned Vercel projects, or any
 * env var pointing at a CAS-owned endpoint).
 *
 * Why: the BYOK distribution model only works if a free user's deployed product
 * runs entirely on the user's own infra. If a shared-services package phones
 * home to a CAS-hosted endpoint at runtime, every free user generates load on
 * Dennis's infrastructure — and a CAS outage takes down every deployed product.
 *
 * Run:
 *   1. Copy this file to cais-shared-services/scripts/audit-phone-home.mjs
 *   2. From the cais-shared-services repo root: node scripts/audit-phone-home.mjs
 *   3. Read the console summary + AUDIT_PHONE_HOME_REPORT.md it writes
 *   4. JSON detail is in audit-phone-home-report.json
 *
 * Classifications (per package):
 *   PURE-CODE              No network calls, or only calls to allowlisted 3rd-party APIs.
 *                          Safe to publish on public npm as @caistech/* (BYOK runtime).
 *   PHONE-HOME             Hardcoded URL pointing at a CAS-owned endpoint. NOT safe to
 *                          ship as public; either refactor to remove the call or move
 *                          the package to @caistech-factory/* (paid/internal tier).
 *   NEEDS-REVIEW           Uses an env-var-driven URL we can't statically resolve. Read
 *                          the evidence and decide manually — env var might be set to a
 *                          CAS endpoint by default in production.
 *   DEPENDS-ON-PHONE-HOME  Imports another @caistech/* package that phones home.
 *                          Resolution: fix the dependency first.
 *
 * Exit code: 0 iff every package is PURE-CODE. Otherwise 1.
 *
 * Zero dependencies — runs on Node 18+ stdlib only.
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const PACKAGES_DIR = join(ROOT, 'packages');

// ─── Allowlisted third-party hosts ───
// Hostnames (or suffixes) that are well-known 3rd-party APIs. Calls to these
// are NOT phone-home — they consume the user's own credentials and land
// directly on the provider. Add to this list as new providers are integrated.
const ALLOWLISTED_HOSTS = [
  // LLM providers
  'api.anthropic.com',
  'api.openai.com',
  'api.openrouter.ai',
  'openrouter.ai',
  'api.cohere.ai',
  'api.cohere.com',
  // Voice / speech
  'api.elevenlabs.io',
  'api.elevenlabs.com',
  // Email / messaging
  'api.resend.com',
  'api.sendgrid.com',
  'api.postmarkapp.com',
  // Search / enrichment
  'api.search.brave.com',
  'api.brave.com',
  'api.hunter.io',
  // CRM / outreach
  'rest.gohighlevel.com',
  'services.gohighlevel.com',
  'api.gohighlevel.com',
  'api.unipile.com',
  'api.unipile.app',
  // Maps
  'api.mapbox.com',
  'api.maptiler.com',
  // Government / registry / sanctions
  'abr.business.gov.au',
  'abr.gov.au',
  'data.gov.au',
  'gov.au',
  'gov.uk',
  'sanctionssearch.ofac.treas.gov',
  'sanctionslist.ofac.treas.gov',
  'treasury.gov',
  'scsanctions.un.org',
  'main.un.org',
  'un.org',
  'consilium.europa.eu',
  'eeas.europa.eu',
  'europa.eu',
  // Platforms
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'vercel.com',
  'api.vercel.com',
  'supabase.co',          // user's own supabase project
  'supabase.in',
  'supabase.com',
  // Google
  'googleapis.com',
  'oauth2.googleapis.com',
  'accounts.google.com',
  'gmail.googleapis.com',
  'drive.googleapis.com',
  'sheets.googleapis.com',
  'calendar.googleapis.com',
  // Microsoft
  'login.microsoftonline.com',
  'graph.microsoft.com',
  // Payment
  'api.stripe.com',
  'js.stripe.com',
  // ML
  'huggingface.co',
  // AWS
  'amazonaws.com',
  // Common
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
];

// ─── CAS-owned host patterns ───
// URLs matching ANY of these are phone-home. Add patterns as new CAS-owned
// surfaces appear (new product deploys, new shared services, etc.).
const CAS_OWNED_PATTERNS = [
  /corporateaisolutions\.com/i,
  /corporate-ai-solutions[\w-]*\.vercel\.app/i,
  /platform-trust[\w-]*\.vercel\.app/i,
  /property-services[\w-]*\.vercel\.app/i,
  /preflight[\w-]*\.vercel\.app/i,
  /community-question-responder[\w-]*\.vercel\.app/i,
  /mmcbuild[\w-]*\.vercel\.app/i,
  /checkpoint[\w-]*\.vercel\.app/i,
  /investorpilot[\w-]*\.vercel\.app/i,
  /partner-pilot[\w-]*\.vercel\.app/i,
  /tenderwatch[\w-]*\.vercel\.app/i,
  /deal-findrs[\w-]*\.vercel\.app/i,
  /easy-claude-code[\w-]*\.vercel\.app/i,
  /raiseready[\w-]*\.vercel\.app/i,
  /connexions[\w-]*\.vercel\.app/i,
  /pubguard[\w-]*\.vercel\.app/i,
  /storefront-mcp[\w-]*\.vercel\.app/i,
  /f2k-[\w-]*\.vercel\.app/i,
  /ndissda[\w-]*\.vercel\.app/i,
  /disaster-support[\w-]*\.vercel\.app/i,
  /omq-outreach[\w-]*\.vercel\.app/i,
  /outreach-ready[\w-]*\.vercel\.app/i,
  /kira[\w-]*\.vercel\.app/i,
  /mova[\w-]*\.vercel\.app/i,
  // Anything explicitly under dennissolver's namespace
  /\/dennissolver\//i,
];

// ─── Suspicious env-var name patterns ───
// Env vars whose names suggest they point at a CAS-hosted endpoint. If found,
// the package is classified NEEDS-REVIEW until a human confirms what the env
// var's default/expected value actually is.
const SUSPICIOUS_ENV_VARS = [
  /^PLATFORM_TRUST.*(URL|ENDPOINT|HOST|API)$/,
  /^SECURITY_GATE.*(URL|ENDPOINT|HOST|API)$/,
  /^AGENT_TRUST.*(URL|ENDPOINT|HOST|API)$/,
  /^COORDINATION.*(URL|ENDPOINT|HOST|API)$/,
  /^PROPERTY_SERVICES.*(URL|ENDPOINT|HOST|API)$/,
  /^PROPERTY_LAUNCH.*(URL|ENDPOINT|HOST|API)$/,
  /^CAIS.*(URL|ENDPOINT|HOST|API)$/,
  /^BYOK.*(URL|ENDPOINT|HOST|API)$/,
  /^NUDGE.*(URL|ENDPOINT|HOST|API)$/,
];

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.turbo', '.git', 'coverage', '__tests__', 'test', 'tests', '__fixtures__']);

async function walkDir(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await walkDir(path)));
    } else if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      // Skip test files — they often have throwaway URLs for stubbing
      if (/\.(test|spec)\.[tj]sx?$/.test(entry.name)) continue;
      out.push(path);
    }
  }
  return out;
}

function extractUrls(content) {
  const urlRegex = /https?:\/\/[^\s'"`<>)\\,;]+/g;
  return [...content.matchAll(urlRegex)].map((m) => m[0].replace(/[.,;:'")\]]+$/, ''));
}

function extractEnvVars(content) {
  const envRegex = /process\.env(?:\.([A-Z_][A-Z0-9_]*)|\[['"]([A-Z_][A-Z0-9_]*)['"]\])/g;
  const vars = new Set();
  for (const match of content.matchAll(envRegex)) {
    vars.add(match[1] || match[2]);
  }
  return [...vars];
}

function extractFetchCallSites(content) {
  const calls = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(fetch|axios|got|undici|http\.(get|post|request)|https\.(get|post|request))\s*[(.]/.test(line)) {
      calls.push({ line: i + 1, text: line.trim().slice(0, 200) });
    }
  }
  return calls;
}

function isCasOwned(url) {
  return CAS_OWNED_PATTERNS.some((pat) => pat.test(url));
}

function isAllowlisted(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWLISTED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith('.' + allowed) || host.endsWith(allowed),
  );
}

function isSuspiciousEnvVar(name) {
  return SUSPICIOUS_ENV_VARS.some((pat) => pat.test(name));
}

async function readPackageJson(pkgDir) {
  try {
    return JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function auditPackage(pkgDir) {
  const pkgJson = await readPackageJson(pkgDir);
  const packageName = pkgJson?.name ?? `(unknown:${relative(PACKAGES_DIR, pkgDir)})`;
  const result = {
    package: packageName,
    dir: relative(ROOT, pkgDir),
    classification: 'PURE-CODE',
    evidence: {
      casOwnedUrls: [],
      unknownUrls: [],
      suspiciousEnvVars: [],
      caistechDeps: [],
      fetchCallSites: [],
    },
  };

  if (!pkgJson) {
    result.classification = 'SKIPPED';
    result.error = 'No package.json';
    return result;
  }

  const allDeps = {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.peerDependencies ?? {}),
  };
  for (const dep of Object.keys(allDeps)) {
    if (dep.startsWith('@caistech/') && dep !== pkgJson.name) {
      result.evidence.caistechDeps.push(dep);
    }
  }

  // Scan src/ first; fall back to package root if no src/
  let scanRoot = join(pkgDir, 'src');
  try {
    await stat(scanRoot);
  } catch {
    scanRoot = pkgDir;
  }
  const files = await walkDir(scanRoot);

  for (const file of files) {
    let content;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const relPath = relative(pkgDir, file);

    for (const url of extractUrls(content)) {
      if (isCasOwned(url)) {
        result.evidence.casOwnedUrls.push({ file: relPath, url });
      } else if (!isAllowlisted(url)) {
        result.evidence.unknownUrls.push({ file: relPath, url });
      }
    }

    for (const v of extractEnvVars(content)) {
      if (isSuspiciousEnvVar(v)) {
        result.evidence.suspiciousEnvVars.push({ file: relPath, var: v });
      }
    }

    for (const call of extractFetchCallSites(content)) {
      result.evidence.fetchCallSites.push({ file: relPath, ...call });
    }
  }

  // Classify (pass 1 — local evidence only; deps resolved in pass 2)
  if (result.evidence.casOwnedUrls.length > 0) {
    result.classification = 'PHONE-HOME';
  } else if (result.evidence.suspiciousEnvVars.length > 0) {
    result.classification = 'NEEDS-REVIEW';
  } else if (result.evidence.caistechDeps.length > 0) {
    result.classification = '_DEPENDS-ON-CAISTECH'; // placeholder, resolved below
  }

  return result;
}

function resolveTransitiveDeps(results) {
  const phoneHomeNames = new Set(
    results
      .filter((r) => r.classification === 'PHONE-HOME' || r.classification === 'NEEDS-REVIEW')
      .map((r) => r.package),
  );
  for (const r of results) {
    if (r.classification !== '_DEPENDS-ON-CAISTECH') continue;
    const offending = r.evidence.caistechDeps.filter((d) => phoneHomeNames.has(d));
    if (offending.length > 0) {
      r.classification = 'DEPENDS-ON-PHONE-HOME';
      r.transitivePhoneHomeDeps = offending;
    } else {
      r.classification = 'PURE-CODE';
    }
  }
}

function renderMarkdown(summary, results) {
  const lines = [];
  lines.push('# @caistech/* phone-home audit');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('|---|---|');
  for (const [k, v] of Object.entries(summary)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push(`| **TOTAL** | **${results.length}** |`);
  lines.push('');

  const groups = ['PHONE-HOME', 'NEEDS-REVIEW', 'DEPENDS-ON-PHONE-HOME', 'PURE-CODE', 'SKIPPED'];
  for (const group of groups) {
    const pkgs = results.filter((r) => r.classification === group);
    if (pkgs.length === 0) continue;
    lines.push(`## ${group} (${pkgs.length})`);
    lines.push('');
    for (const r of pkgs) {
      lines.push(`### ${r.package}`);
      lines.push(`Directory: \`${r.dir}\``);
      lines.push('');
      if (r.evidence.casOwnedUrls.length > 0) {
        lines.push('**CAS-owned URLs found:**');
        lines.push('');
        for (const e of r.evidence.casOwnedUrls) {
          lines.push(`- \`${e.file}\` → ${e.url}`);
        }
        lines.push('');
      }
      if (r.evidence.suspiciousEnvVars.length > 0) {
        lines.push('**Suspicious env vars:**');
        lines.push('');
        for (const e of r.evidence.suspiciousEnvVars) {
          lines.push(`- \`${e.file}\` → \`process.env.${e.var}\``);
        }
        lines.push('');
      }
      if (r.transitivePhoneHomeDeps?.length > 0) {
        lines.push('**Phone-home deps:**');
        lines.push('');
        for (const d of r.transitivePhoneHomeDeps) {
          lines.push(`- ${d}`);
        }
        lines.push('');
      }
      if (group !== 'PURE-CODE' && r.evidence.unknownUrls.length > 0) {
        lines.push('**Unclassified URLs (manual review):**');
        lines.push('');
        for (const e of r.evidence.unknownUrls.slice(0, 20)) {
          lines.push(`- \`${e.file}\` → ${e.url}`);
        }
        if (r.evidence.unknownUrls.length > 20) {
          lines.push(`- _...and ${r.evidence.unknownUrls.length - 20} more_`);
        }
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

async function main() {
  let pkgDirs;
  try {
    const entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
    pkgDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => join(PACKAGES_DIR, e.name))
      .sort();
  } catch (err) {
    console.error(`✘ Cannot read packages dir at ${PACKAGES_DIR}`);
    console.error(`  ${err.message}`);
    console.error(`  Run this script from the cais-shared-services repo root.`);
    process.exit(2);
  }

  console.log(`Auditing ${pkgDirs.length} packages in ${PACKAGES_DIR}…\n`);

  const results = [];
  for (const pkgDir of pkgDirs) {
    process.stdout.write(`  ${relative(PACKAGES_DIR, pkgDir).padEnd(40)} `);
    const r = await auditPackage(pkgDir);
    results.push(r);
    process.stdout.write(`${r.classification === '_DEPENDS-ON-CAISTECH' ? '(resolving deps…)' : r.classification}\n`);
  }

  resolveTransitiveDeps(results);

  const summary = {
    'PURE-CODE': 0,
    'PHONE-HOME': 0,
    'NEEDS-REVIEW': 0,
    'DEPENDS-ON-PHONE-HOME': 0,
    SKIPPED: 0,
  };
  for (const r of results) summary[r.classification] = (summary[r.classification] ?? 0) + 1;

  console.log('\n═══ AUDIT SUMMARY ═══\n');
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }
  console.log(`  ${'TOTAL'.padEnd(25)} ${results.length}\n`);

  const nonPure = results.filter((r) => r.classification !== 'PURE-CODE' && r.classification !== 'SKIPPED');
  if (nonPure.length > 0) {
    console.log('───────────────────────────────────────────────');
    for (const r of nonPure) {
      console.log(`\n▼ ${r.classification.padEnd(22)} ${r.package}`);
      if (r.evidence.casOwnedUrls.length > 0) {
        console.log('  CAS-OWNED URLs:');
        for (const e of r.evidence.casOwnedUrls.slice(0, 10)) {
          console.log(`    ${e.file}  →  ${e.url}`);
        }
      }
      if (r.evidence.suspiciousEnvVars.length > 0) {
        console.log('  SUSPICIOUS ENV VARS:');
        for (const e of r.evidence.suspiciousEnvVars) {
          console.log(`    ${e.file}  →  process.env.${e.var}`);
        }
      }
      if (r.transitivePhoneHomeDeps?.length > 0) {
        console.log('  PHONE-HOME DEPS:');
        for (const d of r.transitivePhoneHomeDeps) console.log(`    ${d}`);
      }
    }
    console.log();
  }

  // Write artifacts
  const jsonPath = join(ROOT, 'audit-phone-home-report.json');
  const mdPath = join(ROOT, 'AUDIT_PHONE_HOME_REPORT.md');
  await writeFile(jsonPath, JSON.stringify({ generated: new Date().toISOString(), summary, results }, null, 2));
  await writeFile(mdPath, renderMarkdown(summary, results));
  console.log(`📝 JSON report: ${jsonPath}`);
  console.log(`📝 Markdown:    ${mdPath}\n`);

  const hasIssues =
    (summary['PHONE-HOME'] ?? 0) +
      (summary['NEEDS-REVIEW'] ?? 0) +
      (summary['DEPENDS-ON-PHONE-HOME'] ?? 0) >
    0;
  process.exit(hasIssues ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
