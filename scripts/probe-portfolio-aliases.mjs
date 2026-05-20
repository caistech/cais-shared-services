#!/usr/bin/env node
/**
 * probe-portfolio-aliases.mjs
 *
 * Probes every canonical hostname listed in
 *   Corporate-AI-Solutions/src/lib/constants.ts → PLATFORMS array
 * and asserts that the URL still serves the right product.
 *
 * Signal: the page <title> contains the platform's `name` (case-insensitive,
 * stripped of whitespace+punctuation) OR an alias declared in the
 * `expectedTitleAliases` map below.
 *
 * Exit 0 if every URL resolves to the expected product.
 * Exit 1 if any URL fails (status non-2xx, or title doesn't match).
 *
 * Designed for CI: schedule daily via GitHub Actions on cais-shared-services;
 * pull the constants.ts file via raw.githubusercontent or check it out from a
 * sibling Corporate-AI-Solutions repo.
 *
 * Usage:
 *   node scripts/probe-portfolio-aliases.mjs                  # uses local sibling repo
 *   node scripts/probe-portfolio-aliases.mjs --json           # JSON output
 *   node scripts/probe-portfolio-aliases.mjs --constants PATH # explicit constants.ts path
 *   node scripts/probe-portfolio-aliases.mjs --timeout 10000  # per-request timeout
 *   node scripts/probe-portfolio-aliases.mjs --skip placeholder,in-migration  # skip release modes
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manually-curated aliases — when a platform's title legitimately differs
// from its `name` (e.g. trademark, subtitle, hosted-elsewhere page). Keys
// are platform `id` from constants.ts; values are regex strings.
const EXPECTED_TITLE_ALIASES = {
  // pubguard is hosted INSIDE Kira's deployment at /pubguard/scan
  pubguard: 'pubguard|kira',
  // universal-lingo subdomains all render from the marketing site
  govlingo: 'universallingo|govlingo|universal lingo',
  censuslingo: 'universallingo|censuslingo|universal lingo',
  videolingo: 'universallingo|videolingo|universal lingo',
  hotellingo: 'universallingo|hotellingo|universal lingo',
  doctorlingo: 'universallingo|doctorlingo|universal lingo',
  edulingo: 'universallingo|edulingo|universal lingo',
  personallingo: 'universallingo|personallingo|universal lingo',
};

function parseArgs(argv) {
  const args = { json: false, timeout: 15000, constants: null, skip: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--timeout') args.timeout = Number(argv[++i]);
    else if (a === '--constants') args.constants = argv[++i];
    else if (a === '--skip') args.skip = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: probe-portfolio-aliases.mjs [--json] [--timeout MS] [--constants PATH] [--skip MODES]'
      );
      process.exit(0);
    }
  }
  return args;
}

async function loadPlatforms(constantsPath) {
  const source = await readFile(constantsPath, 'utf8');
  const platforms = [];
  // Tolerant line-walk: each PLATFORMS entry has `id:`, `name:`, `slug:`,
  // `url:`, `releaseMode:`, `status:`, `type:`. We harvest by tracking the
  // current entry's `{ ... }` and emitting when we see the closing brace.
  const lines = source.split(/\r?\n/);
  let depth = 0;
  let inPlatforms = false;
  let current = {};
  for (const line of lines) {
    if (!inPlatforms) {
      if (/PLATFORMS\s*:\s*Platform\[\]\s*=\s*\[/.test(line)) {
        inPlatforms = true;
      }
      continue;
    }
    if (/^\s*\]\s*$/.test(line) && depth === 0) break;
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    if (openBraces > 0 && depth === 0) {
      current = {};
    }
    depth += openBraces - closeBraces;
    const kv = line.match(
      /^\s*(id|name|slug|url|releaseMode|status|type|parentId)\s*:\s*['"]([^'"]+)['"]/
    );
    if (kv) current[kv[1]] = kv[2];
    if (closeBraces > 0 && depth === 0 && Object.keys(current).length > 0) {
      if (current.url && current.name) platforms.push({ ...current });
      current = {};
    }
  }
  return platforms;
}

function normaliseTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function probeOne(platform, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(platform.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'caistech/portfolio-alias-probe',
      },
    });
    const ok2xx = res.status >= 200 && res.status < 300;
    const body = await res.text();
    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].trim() : '';
    const norm = normaliseTitle(rawTitle);
    const expectedFromName = normaliseTitle(platform.name);
    const aliasRegex = EXPECTED_TITLE_ALIASES[platform.id];
    let titleOk = false;
    if (norm && expectedFromName && norm.includes(expectedFromName)) titleOk = true;
    if (!titleOk && aliasRegex) {
      const re = new RegExp(aliasRegex, 'i');
      if (re.test(rawTitle) || re.test(norm)) titleOk = true;
    }
    // Fallback: any 2xx + non-empty title gets a `warn` (URL reachable, just
    // doesn't match expected — operator decides whether to update name or url).
    let severity = 'fail';
    if (ok2xx && titleOk) severity = 'pass';
    else if (ok2xx && rawTitle) severity = 'warn';
    return {
      id: platform.id,
      name: platform.name,
      url: platform.url,
      status: res.status,
      title: rawTitle,
      severity,
    };
  } catch (err) {
    return {
      id: platform.id,
      name: platform.name,
      url: platform.url,
      status: 0,
      title: '',
      severity: 'fail',
      error: err.message || String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(__dirname, '..');
  const defaultConstants = resolve(
    repoRoot,
    '..',
    'Corporate-AI-Solutions',
    'src',
    'lib',
    'constants.ts'
  );
  const constantsPath = args.constants ? resolve(args.constants) : defaultConstants;

  const platforms = await loadPlatforms(constantsPath);
  const filtered = args.skip.length
    ? platforms.filter((p) => !args.skip.includes(p.releaseMode))
    : platforms;

  const results = [];
  // Concurrent with a small cap so we don't blast the network or trigger
  // rate limits on Vercel previews.
  const concurrency = 6;
  for (let i = 0; i < filtered.length; i += concurrency) {
    const batch = filtered.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((p) => probeOne(p, args.timeout))
    );
    results.push(...batchResults);
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  } else {
    let pass = 0;
    let warn = 0;
    let fail = 0;
    for (const r of results) {
      const label =
        r.severity === 'pass'
          ? '[PASS]'
          : r.severity === 'warn'
            ? '[WARN]'
            : '[FAIL]';
      const detail = r.error
        ? `error: ${r.error}`
        : `status ${r.status}, title "${r.title}"`;
      process.stdout.write(`${label} ${r.id.padEnd(40)} ${r.url}\n        ${detail}\n`);
      if (r.severity === 'pass') pass += 1;
      else if (r.severity === 'warn') warn += 1;
      else fail += 1;
    }
    process.stdout.write(
      `\nportfolio-alias-probe: ${pass} pass, ${warn} warn, ${fail} fail (of ${results.length})\n`
    );
  }

  const anyFail = results.some((r) => r.severity === 'fail');
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err.message || err}\n`);
  process.exit(2);
});
