#!/usr/bin/env node
/**
 * cais-build-template-v2 setup — one-shot bootstrap.
 *
 * 1. Verifies the @caistech registry token is on the host so `npm install`
 *    can resolve private packages.
 * 2. Copies `.env.example` to `.env.local` if absent.
 * 3. Prints the post-clone checklist (route map, env vars to populate, the
 *    GitHub repo secret + variable to set, the canonical Resend sender).
 *
 * Run it once after cloning a fresh product from this template.
 */
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const npmrc = resolve(root, '.npmrc');
const envExample = resolve(root, '.env.example');
const envLocal = resolve(root, '.env.local');

const ok = (s) => console.log(`✓ ${s}`);
const warn = (s) => console.log(`⚠ ${s}`);
const info = (s) => console.log(`→ ${s}`);

console.log('\ncais-build-template-v2 setup');
console.log('============================\n');

// 1. registry token
if (!process.env.GITHUB_PACKAGES_TOKEN) {
  warn('GITHUB_PACKAGES_TOKEN is not set in this shell.');
  info('Set it before running `npm install`:');
  info('  export GITHUB_PACKAGES_TOKEN=<your-ghp-or-pat>');
} else {
  ok('GITHUB_PACKAGES_TOKEN is set');
}

if (existsSync(npmrc)) {
  const contents = readFileSync(npmrc, 'utf8');
  if (contents.includes('@caistech:registry=https://npm.pkg.github.com')) {
    ok('.npmrc points @caistech to GitHub Packages');
  } else {
    warn('.npmrc exists but does not point @caistech to GitHub Packages');
  }
}

// 2. env scaffold
if (existsSync(envLocal)) {
  ok('.env.local already exists');
} else if (existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  ok('Created .env.local from .env.example');
  info('Open .env.local and replace the placeholders.');
} else {
  warn('.env.example is missing — repo is broken, expected this file');
}

console.log('\nNext steps:');
console.log('-----------');
console.log('1. npm install');
console.log('2. Populate .env.local (Supabase URL+anon+service-role, RESEND_API_KEY, vendor identity if any).');
console.log('3. Configure GitHub repo:');
console.log('   - Secret: CAISTECH_PACKAGES_TOKEN (must NOT start with GITHUB_)');
console.log('   - Variable: PORTFOLIO_GATE_PREVIEW_URL (Vercel preview / production URL)');
console.log('4. Edit routes.config.json + auth.config.json to match your actual routes.');
console.log('5. Run `npm run dev` and confirm /, /login, /signup, /privacy, /terms all render.');
console.log('6. Add your tables to supabase/migrations/0001_init_rls.sql and `supabase db push`.');
console.log('7. First push to main runs the portfolio-gate workflow — review the result.');
console.log('');
