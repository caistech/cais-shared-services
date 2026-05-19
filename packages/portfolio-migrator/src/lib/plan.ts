/**
 * Plan synthesis — take a list of gaps from `inspect` and produce an
 * ordered MigrationStep list the user can review and `apply` can execute.
 *
 * Ordering matters: install the gate package BEFORE dropping the
 * workflow + config files (so consumers can `npx --no-install` cleanly);
 * scrub vendor identity BEFORE adding env-var placeholders (so the
 * placeholder additions land in a clean .env.example); leave note-only
 * steps last so the user sees them at the bottom of the plan.
 */

import { resolve } from 'node:path';
import type {
  Gap,
  InspectionReport,
  MigrationPlan,
  MigrationStep,
  MigrationId,
  ProposedFile,
  ProposedReplacement,
} from '../types.js';
import { readFileOptional } from './fs.js';
import {
  authConfigJson,
  authFormSwapNoteBody,
  gateWorkflowYml,
  resendFromEmailBlock,
  rlsUsingTrueNoteBody,
  routesConfigJson,
  vendorIdentityEnvBlock,
} from './templates.js';

/**
 * Convert a fully-formed InspectionReport into a MigrationPlan.
 *
 * The function never reads from `process.cwd()` — every input it needs
 * comes via the inspection. That keeps it pure-ish (the only side
 * effect is reading existing package.json content for patch generation).
 */
export async function buildPlan(
  inspection: InspectionReport
): Promise<MigrationPlan> {
  const steps: MigrationStep[] = [];
  const gapsByMigration = groupGapsByMigration(inspection.gaps);

  // 1+2. Package.json edits combined into a single step — apply rewrites
  //      the whole file per patch, so split steps would clobber each
  //      other's edits. One synthesised step keeps the result correct.
  const wantsGate = gapsByMigration.has('install-portfolio-gate');
  const wantsComponents = gapsByMigration.has('upgrade-corporate-components');
  if (wantsGate || wantsComponents) {
    const step = await buildPackageJsonStep(
      inspection.repoPath,
      wantsGate,
      wantsComponents
    );
    if (step) steps.push(step);
  }

  // 3. Scaffold routes.config.json.
  if (gapsByMigration.has('scaffold-routes-config')) {
    steps.push(buildScaffoldRoutesConfigStep(inspection));
  }

  // 4. Scaffold auth.config.json.
  if (gapsByMigration.has('scaffold-auth-config')) {
    steps.push(buildScaffoldAuthConfigStep());
  }

  // 5. Scaffold gate.yml.
  if (gapsByMigration.has('scaffold-gate-workflow')) {
    steps.push(buildScaffoldGateWorkflowStep());
  }

  // 6. Vendor-identity scrub (patch) — emits replacements for the
  //    occurrences inspect found.
  if (gapsByMigration.has('vendor-identity-scrub')) {
    const step = await buildVendorScrubStep(
      inspection.repoPath,
      gapsByMigration.get('vendor-identity-scrub') ?? []
    );
    if (step) steps.push(step);
  }

  // 7+8. .env.example edits combined into a single step — same reasoning
  //      as the package.json merge above (sequential whole-file rewrites
  //      would clobber each other's blocks).
  const wantsVendorEnv = gapsByMigration.has('vendor-identity-env-defaults');
  const wantsResend = gapsByMigration.has('add-resend-from-email-example');
  if (wantsVendorEnv || wantsResend) {
    const step = await buildEnvExampleStep(
      inspection.repoPath,
      wantsVendorEnv,
      wantsResend
    );
    steps.push(step);
  }

  // 9. Note: swap auth pages to AuthForm.
  if (gapsByMigration.has('swap-auth-pages-to-authform')) {
    steps.push(
      buildAuthFormSwapNoteStep(
        inspection.packageName ?? 'your-product',
        gapsByMigration.get('swap-auth-pages-to-authform') ?? []
      )
    );
  }

  // 10. Note: explanatory header missing.
  if (gapsByMigration.has('add-explanatory-header-note')) {
    steps.push(
      buildExplanatoryHeaderNoteStep(
        gapsByMigration.get('add-explanatory-header-note') ?? []
      )
    );
  }

  // 11. Note: RLS USING (true).
  if (gapsByMigration.has('rls-using-true-note')) {
    steps.push(
      buildRlsNoteStep(gapsByMigration.get('rls-using-true-note') ?? [])
    );
  }

  return {
    repoPath: inspection.repoPath,
    timestamp: new Date().toISOString(),
    inspection,
    steps,
  };
}

function groupGapsByMigration(gaps: Gap[]): Map<MigrationId, Gap[]> {
  const map = new Map<MigrationId, Gap[]>();
  for (const gap of gaps) {
    const existing = map.get(gap.migrationId) ?? [];
    existing.push(gap);
    map.set(gap.migrationId, existing);
  }
  return map;
}

// --- 1+2. combined package.json edits ----------------------------------

async function buildPackageJsonStep(
  repoPath: string,
  installGate: boolean,
  upgradeComponents: boolean
): Promise<MigrationStep | null> {
  const pkgPath = resolve(repoPath, 'package.json');
  const raw = await readFileOptional(pkgPath);
  if (!raw) return null;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  const deps = (pkg.dependencies as Record<string, string>) ?? {};
  const newDevDeps = installGate
    ? { ...devDeps, '@caistech/portfolio-gate': '^0.2.0' }
    : devDeps;
  const newDeps = upgradeComponents
    ? { ...deps, '@caistech/corporate-components': '^0.2.0' }
    : deps;
  const sortedDevDeps = Object.fromEntries(
    Object.entries(newDevDeps).sort(([a], [b]) => a.localeCompare(b))
  );
  const sortedDeps = Object.fromEntries(
    Object.entries(newDeps).sort(([a], [b]) => a.localeCompare(b))
  );
  const newPkg: Record<string, unknown> = { ...pkg };
  if (Object.keys(sortedDeps).length > 0) newPkg.dependencies = sortedDeps;
  if (Object.keys(sortedDevDeps).length > 0)
    newPkg.devDependencies = sortedDevDeps;
  const newContent = `${JSON.stringify(newPkg, null, 2)}\n`;
  const parts: string[] = [];
  if (installGate)
    parts.push('add @caistech/portfolio-gate ^0.2.0 (devDependencies)');
  if (upgradeComponents)
    parts.push('add / upgrade @caistech/corporate-components to ^0.2.0 (dependencies)');
  return {
    kind: 'patch',
    id: installGate ? 'install-portfolio-gate' : 'upgrade-corporate-components',
    rule: installGate ? 'R13' : 'R1',
    title: `Update package.json — ${parts.join(' + ')}`,
    description: `Single package.json rewrite. ${parts.join('. ')}.\n\nPortfolio-gate (R13) brings the CI smoke tests, errorResponse helper, and static audits. Corporate-components (R1) ships <AuthForm/> in 0.2.0 — required for the R1 swap migration.`,
    files: [
      {
        path: 'package.json',
        content: newContent,
      },
    ],
    followUpCommand: 'npm install',
  };
}

// --- 3. scaffold routes.config.json ------------------------------------

function buildScaffoldRoutesConfigStep(
  inspection: InspectionReport
): MigrationStep {
  const slug = inspection.packageName?.replace(/^@.+?\//, '') ?? 'your-product';
  const content = routesConfigJson(slug);
  return {
    kind: 'patch',
    id: 'scaffold-routes-config',
    rule: 'R13',
    title: 'Scaffold routes.config.json',
    description:
      'Default top-level route list (homepage, /pricing, /about, /contact, /login, /signup, /forgot-password, /privacy, /terms, /api/health). Edit to match your product\'s actual routes before running the smoke test.',
    files: [
      {
        path: 'routes.config.json',
        content,
        ifMissing: true,
      },
    ],
  };
}

// --- 4. scaffold auth.config.json --------------------------------------

function buildScaffoldAuthConfigStep(): MigrationStep {
  return {
    kind: 'patch',
    id: 'scaffold-auth-config',
    rule: 'R1',
    title: 'Scaffold auth.config.json',
    description:
      'Per-product auth path map used by portfolio-gate-smoke-auth. The four legs are wired against the conventional paths (/login, /signup, /forgot-password, /api/auth/*) — edit if your product diverges.',
    files: [
      {
        path: 'auth.config.json',
        content: authConfigJson(),
        ifMissing: true,
      },
    ],
  };
}

// --- 5. scaffold gate.yml ----------------------------------------------

function buildScaffoldGateWorkflowStep(): MigrationStep {
  return {
    kind: 'patch',
    id: 'scaffold-gate-workflow',
    rule: 'R13',
    title: 'Scaffold .github/workflows/gate.yml',
    description:
      'GitHub Action template — runs typecheck + lint + build + route + auth smoke tests on PR + push to main. Requires CAISTECH_PACKAGES_TOKEN secret and PORTFOLIO_GATE_PREVIEW_URL repo variable.',
    files: [
      {
        path: '.github/workflows/gate.yml',
        content: gateWorkflowYml(),
        ifMissing: true,
      },
    ],
  };
}

// --- 6. vendor-identity scrub ------------------------------------------

async function buildVendorScrubStep(
  repoPath: string,
  gaps: Gap[]
): Promise<MigrationStep | null> {
  // Each gap is one line where a vendor pattern matched. We surface the
  // pre-computed env var mapping in the message. Replacements happen
  // per-file: read the existing file, replace the literal substring with
  // the env-var reference.
  if (gaps.length === 0) return null;
  const replacements: ProposedReplacement[] = [];
  for (const gap of gaps) {
    if (!gap.file || !gap.detail) continue;
    const envVar = extractEnvVarFromMessage(gap.message);
    if (!envVar) continue;
    // Pre-emptive de-dup: same file + same detail = one replacement.
    if (
      replacements.some(
        (r) => r.path === gap.file && r.find === gap.detail
      )
    ) {
      continue;
    }
    replacements.push({
      path: gap.file,
      find: gap.detail,
      replace: `\${process.env.${envVar} ?? ''}`,
      description: `replace ${gap.detail} with process.env.${envVar} reference`,
      replaceAll: true,
    });
  }
  if (replacements.length === 0) return null;
  return {
    kind: 'note',
    id: 'vendor-identity-scrub',
    rule: 'R11',
    title: 'Scrub vendor identity references',
    description:
      'Replace literal references to operator handle / mobile / Calendly / email with process.env.NEXT_PUBLIC_VENDOR_* references. Marked NOTE because the exact substitution depends on the call site — string template vs JSX text vs prop value all need slightly different syntax. Review each before applying.',
    body: buildVendorScrubNoteBody(replacements),
    suggestedFiles: replacements.map((r) => ({
      path: r.path,
      content: `// Suggested replacement for line:\n// ${r.find}\n// ↓\n// ${r.replace}\n`,
    })),
  };
}

function buildVendorScrubNoteBody(
  replacements: ProposedReplacement[]
): string {
  const lines: string[] = [
    `${replacements.length} occurrence${
      replacements.length === 1 ? '' : 's'
    } of vendor identity strings were detected. Replace each with a process.env reference and add the placeholder to .env.example.`,
    '',
    '| File | Find | Replace with |',
    '|---|---|---|',
  ];
  for (const r of replacements) {
    lines.push(
      `| \`${r.path}\` | \`${r.find}\` | \`${r.replace}\` |`
    );
  }
  lines.push(
    '',
    'These are NOT auto-applied because the exact substitution depends on the call site:',
    '- Inside a string template: `\\${process.env.NEXT_PUBLIC_VENDOR_EMAIL ?? \'\'}`',
    '- Inside JSX text: `{process.env.NEXT_PUBLIC_VENDOR_EMAIL}`',
    '- Inside a prop value: `vendorEmail={process.env.NEXT_PUBLIC_VENDOR_EMAIL}`',
    '',
    'Apply by hand, verify with `npx portfolio-gate-audit-vendor-leak`, then commit.'
  );
  return lines.join('\n');
}

function extractEnvVarFromMessage(message: string): string | null {
  const m = message.match(/suggest env var (\w+)/);
  return m ? m[1] : null;
}

// --- 7+8. combined .env.example edits ----------------------------------

async function buildEnvExampleStep(
  repoPath: string,
  addVendor: boolean,
  addResend: boolean
): Promise<MigrationStep> {
  const envExamplePath = resolve(repoPath, '.env.example');
  const existing = (await readFileOptional(envExamplePath)) ?? '';
  let next = existing;
  const parts: string[] = [];
  if (addVendor && !/NEXT_PUBLIC_VENDOR_NAME/.test(next)) {
    next += vendorIdentityEnvBlock();
    parts.push('NEXT_PUBLIC_VENDOR_* placeholders (R11)');
  }
  if (addResend && !/RESEND_FROM_EMAIL/.test(next)) {
    next += resendFromEmailBlock();
    parts.push('RESEND_FROM_EMAIL (R6)');
  }
  return {
    kind: 'patch',
    id: addResend ? 'add-resend-from-email-example' : 'vendor-identity-env-defaults',
    rule: addResend ? 'R6' : 'R11',
    title: `Update .env.example — add ${parts.join(' + ')}`,
    description: `Single .env.example rewrite. ${parts.join('. ')}.`,
    files: [
      {
        path: '.env.example',
        content: next,
      },
    ],
  };
}

// --- 9. AuthForm swap note ---------------------------------------------

function buildAuthFormSwapNoteStep(
  productSlug: string,
  gaps: Gap[]
): MigrationStep {
  const fileList = Array.from(
    new Set(gaps.map((g) => g.file).filter(Boolean))
  ) as string[];
  const body =
    authFormSwapNoteBody(productSlug.replace(/^@.+?\//, '')) +
    '\n\n### Files containing raw password inputs\n\n' +
    fileList.map((f) => `- \`${f}\``).join('\n');
  const suggestedFiles: ProposedFile[] = fileList.map((path) => ({
    path,
    content: `// Suggested swap: replace this file's contents with <AuthForm/>.\n// See plan markdown for the canonical pattern.\n`,
  }));
  return {
    kind: 'note',
    id: 'swap-auth-pages-to-authform',
    rule: 'R1',
    title: 'Swap raw auth pages to <AuthForm/>',
    description:
      'Raw <input type="password"> was found in the repo. The Portfolio Standard requires <AuthForm/> for R1 compliance. Marked NOTE because the swap surface depends on per-product branding / redirect URLs / analytics hooks.',
    body,
    suggestedFiles,
  };
}

// --- 10. explanatory header note ----------------------------------------

function buildExplanatoryHeaderNoteStep(gaps: Gap[]): MigrationStep {
  const files = Array.from(
    new Set(gaps.map((g) => g.file).filter(Boolean))
  ) as string[];
  const body = [
    `The following \`page.tsx\` files are missing \`<ExplanatoryHeader/>\` and have no \`// @explanatory-header-exempt\` comment:`,
    '',
    ...files.map((f) => `- \`${f}\``),
    '',
    'For each one, either:',
    '',
    '1. Add the header — install `@caistech/corporate-components@^0.2.0`, then:',
    '',
    '   ```tsx',
    "   import { ExplanatoryHeader } from '@caistech/corporate-components';",
    '   ',
    '   export default function Page() {',
    '     return (',
    '       <>',
    '         <ExplanatoryHeader',
    '           what="Watchdog panel"',
    '           do="Add what other parties owe you against a deadline"',
    '           matters="Anything overdue here is what\'s blocking your project"',
    '         />',
    '         {/* …rest of page */}',
    '       </>',
    '     );',
    '   }',
    '   ```',
    '',
    '2. OR mark intentionally headerless — add this comment to the top of the file:',
    '   ',
    '   ```tsx',
    '   // @explanatory-header-exempt — reason: ...',
    '   ```',
    '',
    'Note: `<ExplanatoryHeader/>` is planned for `@caistech/corporate-components` 0.3.0 (not yet shipped). Until then, hand-roll an inline header component with the three-slot pattern.',
  ].join('\n');
  return {
    kind: 'note',
    id: 'add-explanatory-header-note',
    rule: 'R3',
    title: 'Add explanatory header to page-level files',
    description:
      'Heuristic flagged page.tsx files without an explanatory header. NOTE-only — the content of each header depends on what the page does.',
    body,
  };
}

// --- 11. RLS USING (true) note -----------------------------------------

function buildRlsNoteStep(gaps: Gap[]): MigrationStep {
  const files = Array.from(
    new Set(
      gaps
        .map((g) => (g.file ? `${g.file}:${g.line ?? '?'}` : null))
        .filter(Boolean) as string[]
    )
  );
  const body = [
    rlsUsingTrueNoteBody(),
    '',
    '### Locations',
    '',
    ...files.map((f) => `- \`${f}\``),
  ].join('\n');
  return {
    kind: 'note',
    id: 'rls-using-true-note',
    rule: 'R9',
    title: 'Replace USING (true) RLS policies',
    description:
      'Migrations contain USING (true) on data-bearing tables. NOTE-only — the replacement owner column depends on the table\'s tenancy model.',
    body,
  };
}
