/**
 * Inspection scanner — reads a target repo and produces a list of `Gap`s
 * against the Portfolio Standard v0.1 migration surface.
 *
 * Each detector is small, self-contained, and conservative: if it can't
 * decide confidently, it emits a `warn` rather than a `fail`. Plan-mode
 * collapses warns + fails into proposed steps; status-mode reports them.
 *
 * Rules covered in v0.1:
 *   R1  — auth pattern compliance (raw <input type="password">)
 *   R3  — explanatory-header presence (heuristic)
 *   R6  — RESEND_FROM_EMAIL in .env.example
 *   R9  — USING (true) RLS patterns
 *   R11 — vendor-identity leak patterns
 *   R13 — routes.config.* + gate.yml + @caistech/portfolio-gate installed
 *   (corporate-components version floor for swap migration)
 *
 * Each detector returns Gap[] — multiple gaps per detector is fine when
 * the rule is violated in multiple files / multiple ways.
 */

import { resolve } from 'node:path';
import type {
  ComplianceSummary,
  Gap,
  InspectionReport,
  RuleId,
} from '../types.js';
import {
  exists,
  readFileOptional,
  toRepoRelative,
  walkFiles,
} from './fs.js';
import { meetsFloor } from './semver.js';

const CORPORATE_COMPONENTS_FLOOR = '0.2.0';

/**
 * Patterns that flag a vendor-identity leak. Mirrors the audit shipped in
 * `@caistech/portfolio-gate` so the migrator and the gate see the same
 * surface — but the migrator runs offline (no token required).
 */
const VENDOR_PATTERNS: Array<{ name: string; re: RegExp; envVar: string }> = [
  {
    name: 'operator-handle',
    re: /mcmdennis/i,
    envVar: 'NEXT_PUBLIC_VENDOR_HANDLE',
  },
  {
    name: 'operator-mobile',
    re: /\+?61\s?402\s?612\s?471/,
    envVar: 'NEXT_PUBLIC_VENDOR_PHONE',
  },
  {
    name: 'operator-calendly',
    re: /calendly\.com\/mcmdennis/i,
    envVar: 'NEXT_PUBLIC_VENDOR_CALENDLY',
  },
  {
    name: 'operator-email',
    re: /dennis@corporateaisolutions/i,
    envVar: 'NEXT_PUBLIC_VENDOR_EMAIL',
  },
  {
    name: 'operator-instagram',
    re: /karen\.engel2026/i,
    envVar: 'NEXT_PUBLIC_VENDOR_INSTAGRAM',
  },
];

const SCAN_EXTENSIONS_CODE = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.html',
  '.css',
];

const RULE_DESCRIPTIONS: Record<RuleId, string> = {
  R1: 'Auth pages use <AuthForm/> (no raw <input type="password">)',
  R2: 'UI is responsive (mobile + laptop) — placeholder until v0.2',
  R3: 'Every page has an explanatory header (WHAT / DO / MATTERS)',
  R6: 'RESEND_FROM_EMAIL is set in .env.example with verified subdomain',
  R9: 'No RLS policy uses USING (true) on data-bearing tables',
  R10: 'API routes use errorResponse() helper — placeholder until v0.2',
  R11: 'No hardcoded vendor identity (handle, mobile, Calendly, email)',
  R12: 'Public-API endpoints opt-in — placeholder until v0.2',
  R13: 'CI gate is wired (@caistech/portfolio-gate + gate.yml + routes.config.*)',
  R14: 'Public sample artefact reachable without signup — placeholder until v0.2',
  R15: 'TrustPanel present on REGULATED-tier products — placeholder until v0.2',
};

/**
 * Main entry: inspect a repo path, produce a structured InspectionReport.
 *
 * The `repoPath` MUST be the absolute repo root (the directory containing
 * `package.json`). All file paths in the resulting report are relative to
 * it for portable rendering.
 */
export async function inspectRepo(
  repoPath: string
): Promise<InspectionReport> {
  const pkg = await readPackageJson(repoPath);
  const framework = await detectFramework(repoPath, pkg);
  const gaps: Gap[] = [];

  // --- R13 — portfolio-gate wiring ---------------------------------------
  gaps.push(...(await detectPortfolioGateGaps(repoPath, pkg)));

  // --- corporate-components version (drives R1 swap-note feasibility) ----
  gaps.push(...detectCorporateComponentsGaps(pkg));

  // --- R1 — raw <input type="password"> outside AuthForm/PasswordInput ---
  gaps.push(...(await detectRawPasswordInputs(repoPath)));

  // --- R3 — explanatory-header heuristic ---------------------------------
  gaps.push(...(await detectMissingExplanatoryHeaders(repoPath)));

  // --- R6 — RESEND_FROM_EMAIL in .env.example ----------------------------
  gaps.push(...(await detectEmailEnvGap(repoPath)));

  // --- R9 — USING (true) RLS patterns ------------------------------------
  gaps.push(...(await detectRlsOpenPolicies(repoPath)));

  // --- R11 — vendor-identity leaks ---------------------------------------
  gaps.push(...(await detectVendorIdentityLeaks(repoPath)));

  return {
    repoPath,
    timestamp: new Date().toISOString(),
    packageName: pkg?.name,
    framework,
    gaps,
    compliance: summariseCompliance(gaps),
  };
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(
  repoPath: string
): Promise<PackageJson | null> {
  const raw = await readFileOptional(resolve(repoPath, 'package.json'));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

async function detectFramework(
  repoPath: string,
  pkg: PackageJson | null
): Promise<'next' | 'unknown'> {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if (deps.next) return 'next';
  for (const candidate of [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
  ]) {
    if (await exists(resolve(repoPath, candidate))) return 'next';
  }
  return 'unknown';
}

// --- R13 detector --------------------------------------------------------

async function detectPortfolioGateGaps(
  repoPath: string,
  pkg: PackageJson | null
): Promise<Gap[]> {
  const gaps: Gap[] = [];
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasPortfolioGate = '@caistech/portfolio-gate' in deps;

  if (!hasPortfolioGate) {
    gaps.push({
      rule: 'R13',
      migrationId: 'install-portfolio-gate',
      message: '@caistech/portfolio-gate is not installed',
      severity: 'fail',
      detail:
        'install via npm i -D @caistech/portfolio-gate (CI gate, smoke tests, errorResponse helper)',
    });
  }

  const gateWorkflow = resolve(repoPath, '.github/workflows/gate.yml');
  if (!(await exists(gateWorkflow))) {
    gaps.push({
      rule: 'R13',
      migrationId: 'scaffold-gate-workflow',
      message: '.github/workflows/gate.yml is missing',
      severity: 'fail',
      file: '.github/workflows/gate.yml',
      detail:
        'GitHub Action that runs typecheck + lint + build + route + auth smoke',
    });
  }

  const routesConfigJson = await exists(resolve(repoPath, 'routes.config.json'));
  const routesConfigTs = await exists(resolve(repoPath, 'routes.config.ts'));
  if (!routesConfigJson && !routesConfigTs) {
    gaps.push({
      rule: 'R13',
      migrationId: 'scaffold-routes-config',
      message: 'routes.config.json (or .ts) is missing',
      severity: 'fail',
      file: 'routes.config.json',
      detail:
        'per-product route list consumed by portfolio-gate-smoke-routes',
    });
  }

  const authConfigJson = await exists(resolve(repoPath, 'auth.config.json'));
  const authConfigTs = await exists(resolve(repoPath, 'auth.config.ts'));
  if (!authConfigJson && !authConfigTs) {
    gaps.push({
      rule: 'R1',
      migrationId: 'scaffold-auth-config',
      message: 'auth.config.json (or .ts) is missing',
      severity: 'fail',
      file: 'auth.config.json',
      detail: 'per-product auth path map consumed by portfolio-gate-smoke-auth',
    });
  }

  return gaps;
}

// --- corporate-components version detector -------------------------------

function detectCorporateComponentsGaps(pkg: PackageJson | null): Gap[] {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const installed = deps['@caistech/corporate-components'];
  if (!installed) {
    return [
      {
        rule: 'R1',
        migrationId: 'upgrade-corporate-components',
        message: '@caistech/corporate-components is not installed',
        severity: 'warn',
        detail:
          'install ^0.2.0 to get <AuthForm/> + <CorporateHeader vendor={false}/>',
      },
    ];
  }
  if (!meetsFloor(installed, CORPORATE_COMPONENTS_FLOOR)) {
    return [
      {
        rule: 'R1',
        migrationId: 'upgrade-corporate-components',
        message: `@caistech/corporate-components ${installed} is older than ${CORPORATE_COMPONENTS_FLOOR}`,
        severity: 'fail',
        detail: `AuthForm shipped in 0.2.0 — upgrade required for R1 compliance`,
      },
    ];
  }
  return [];
}

// --- R1 raw-password-input detector --------------------------------------

async function detectRawPasswordInputs(repoPath: string): Promise<Gap[]> {
  const gaps: Gap[] = [];
  // Scan only `app/`, `src/`, `pages/`, `components/` — the typical
  // Next/React surfaces. Keeps noise (e.g. test fixtures in node_modules)
  // away and makes the scan fast on big repos.
  const roots = ['app', 'src', 'pages', 'components'];
  for (const root of roots) {
    const dir = resolve(repoPath, root);
    if (!(await exists(dir))) continue;
    const files = await walkFiles(dir, {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    });
    for (const file of files) {
      const content = await readFileOptional(file);
      if (!content) continue;
      // Permit our own AuthForm + PasswordInput re-exports — the rule is
      // that consumers don't ship raw password inputs.
      if (/AuthForm|PasswordInput/.test(content)) {
        // It's plausible the consumer already uses these — but they may
        // also have a hand-rolled fallback below. Continue scanning;
        // matches surface independently.
      }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (/type=["']password["']/i.test(line)) {
          gaps.push({
            rule: 'R1',
            migrationId: 'swap-auth-pages-to-authform',
            message: 'raw <input type="password"> — should use <AuthForm/>',
            severity: 'fail',
            file: toRepoRelative(repoPath, file),
            line: i + 1,
            detail: line.trim(),
          });
        }
      }
    }
  }
  return gaps;
}

// --- R3 explanatory-header heuristic -------------------------------------

async function detectMissingExplanatoryHeaders(
  repoPath: string
): Promise<Gap[]> {
  const gaps: Gap[] = [];
  const appDir = resolve(repoPath, 'app');
  if (!(await exists(appDir))) return gaps;
  const files = await walkFiles(appDir, { extensions: ['.tsx'] });
  for (const file of files) {
    const baseName = file.split(/[\\/]/).pop() ?? '';
    if (baseName !== 'page.tsx') continue;
    const content = await readFileOptional(file);
    if (!content) continue;
    if (/@explanatory-header-exempt/.test(content)) continue;
    if (/ExplanatoryHeader/.test(content)) continue;
    gaps.push({
      rule: 'R3',
      migrationId: 'add-explanatory-header-note',
      message: 'page.tsx is missing <ExplanatoryHeader/>',
      severity: 'warn',
      file: toRepoRelative(repoPath, file),
      detail:
        'add // @explanatory-header-exempt comment if the page is intentionally headerless',
    });
  }
  return gaps;
}

// --- R6 detector ---------------------------------------------------------

async function detectEmailEnvGap(repoPath: string): Promise<Gap[]> {
  const file = resolve(repoPath, '.env.example');
  const content = await readFileOptional(file);
  if (content === null) {
    return [
      {
        rule: 'R6',
        migrationId: 'add-resend-from-email-example',
        message: '.env.example is missing — RESEND_FROM_EMAIL placeholder absent',
        severity: 'warn',
        file: '.env.example',
        detail:
          'create with RESEND_FROM_EMAIL=noreply@updates.corporateaisolutions.com',
      },
    ];
  }
  if (!/RESEND_FROM_EMAIL/.test(content)) {
    return [
      {
        rule: 'R6',
        migrationId: 'add-resend-from-email-example',
        message: 'RESEND_FROM_EMAIL is not declared in .env.example',
        severity: 'warn',
        file: '.env.example',
        detail:
          'add RESEND_FROM_EMAIL=noreply@updates.corporateaisolutions.com',
      },
    ];
  }
  return [];
}

// --- R9 USING (true) detector --------------------------------------------

async function detectRlsOpenPolicies(repoPath: string): Promise<Gap[]> {
  const gaps: Gap[] = [];
  const dir = resolve(repoPath, 'supabase/migrations');
  if (!(await exists(dir))) return gaps;
  const files = await walkFiles(dir, { extensions: ['.sql'] });
  for (const file of files) {
    const content = await readFileOptional(file);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (/USING\s*\(\s*true\s*\)/i.test(lines[i])) {
        gaps.push({
          rule: 'R9',
          migrationId: 'rls-using-true-note',
          message: 'RLS policy uses USING (true) — needs human review',
          severity: 'fail',
          file: toRepoRelative(repoPath, file),
          line: i + 1,
          detail: lines[i].trim(),
        });
      }
    }
  }
  return gaps;
}

// --- R11 vendor-identity leak detector -----------------------------------

async function detectVendorIdentityLeaks(
  repoPath: string
): Promise<Gap[]> {
  const gaps: Gap[] = [];
  const files = await walkFiles(repoPath, {
    extensions: SCAN_EXTENSIONS_CODE,
  });
  for (const file of files) {
    const rel = toRepoRelative(repoPath, file);
    // Skip the migrator's own output dir + lockfiles + anything the
    // operator marked as legitimate (.env.example may carry a placeholder).
    if (rel.startsWith('docs/MIGRATION_')) continue;
    if (rel === 'package-lock.json') continue;
    const content = await readFileOptional(file);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const { name, re, envVar } of VENDOR_PATTERNS) {
        const match = line.match(re);
        if (!match) continue;
        // Distinguish patch-able lines (string literal in a marketing file)
        // from note-only lines (component logic). Heuristic: if the line
        // is a literal string assignment OR sits in a `.md` / `.mdx` /
        // `.env.example` / config file, it's patch-able.
        const isLiteralContext =
          /\.(md|mdx|html|css|json|env\.example|yml|yaml)$/.test(rel) ||
          /(['"`])[^'"`]*['"`]/.test(line);
        gaps.push({
          rule: 'R11',
          migrationId: isLiteralContext
            ? 'vendor-identity-scrub'
            : 'vendor-identity-scrub',
          message: `vendor identity leak: ${name} (suggest env var ${envVar})`,
          severity: 'fail',
          file: rel,
          line: i + 1,
          detail: match[0],
        });
      }
    }
  }
  // De-dup against the env-default migration: if any vendor patterns
  // matched, also flag that the .env.example needs the vendor placeholders.
  if (gaps.length > 0) {
    gaps.push({
      rule: 'R11',
      migrationId: 'vendor-identity-env-defaults',
      message: '.env.example needs vendor placeholder defaults',
      severity: 'warn',
      file: '.env.example',
      detail:
        'add NEXT_PUBLIC_VENDOR_NAME, NEXT_PUBLIC_VENDOR_EMAIL, NEXT_PUBLIC_VENDOR_PHONE, NEXT_PUBLIC_VENDOR_CALENDLY placeholders',
    });
  }
  return gaps;
}

// --- compliance summary --------------------------------------------------

function summariseCompliance(gaps: Gap[]): ComplianceSummary {
  const allRules: RuleId[] = [
    'R1',
    'R3',
    'R6',
    'R9',
    'R11',
    'R13',
    // Rules v0.1 surface but doesn't actively fail on — included so the
    // perRule breakdown is honest about coverage.
    'R2',
    'R10',
    'R12',
    'R14',
    'R15',
  ];
  const perRule = allRules.map((rule) => {
    const gapsForRule = gaps.filter((g) => g.rule === rule);
    const hasFail = gapsForRule.some((g) => g.severity === 'fail');
    return {
      rule,
      passed: !hasFail,
      gapsCount: gapsForRule.length,
      description: RULE_DESCRIPTIONS[rule],
    };
  });
  const rulesChecked = perRule.length;
  const rulesPassed = perRule.filter((r) => r.passed).length;
  return {
    rulesChecked,
    rulesPassed,
    percentage: Math.round((rulesPassed / rulesChecked) * 100),
    perRule,
  };
}
