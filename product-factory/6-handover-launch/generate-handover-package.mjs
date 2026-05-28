#!/usr/bin/env node
/**
 * product-factory/6-handover-launch/generate-handover-package.mjs
 * 
 * HANDOVER PACKAGE GENERATOR — Stage 6: Handover & Launch
 * 
 * House-building analogy: Settlement day — keys, warranties, manuals 
 * handed to homeowner.
 * 
 * Generates a complete handover package for a product:
 *   - credentials.json (or references)
 *   - TESTING.md (user manual)
 *   - support-contacts.md
 *   - runbooks/common-issues.md
 *   - launch-checklist.md
 *   - certificate-of-occupancy.json (from Stage 5)
 * 
 * Usage:
 *   node generate-handover-package.mjs <slug> [--template default]
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, cpSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_FACTORY = resolve(dirname(fileURLToPath(import.meta.url)));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

function generateCredentials(slug) {
  return {
    product_slug: slug,
    generated_at: new Date().toISOString(),
    note: "Reference to secrets manager. Actual credentials stored in Vercel project env vars.",
    vercel_project: slug,
    supabase_ref: "${SUPABASE_REF}",
    admin_email: "${ADMIN_EMAIL}",
    deployment_url: `https://${slug}-corporate-ai-solutions.vercel.app`,
  };
}

function generateTestingDoc(slug) {
  return `# Testing Guide: ${slug}

> User manual for testing the product before handover.

## Getting Started

1. **Access the app**: Navigate to \`https://${slug}-corporate-ai-solutions.vercel.app\`
2. **Log in**: Use the admin credentials provided separately
3. **Verify core flows**: Complete each test case below

## Test Cases

### Authentication
- [ ] Sign up with new email
- [ ] Log in with existing account
- [ ] Use forgot password flow
- [ ] Use magic link login
- [ ] Sign out

### Core Features
- [ ] Primary user flow works end-to-end
- [ ] Settings page accessible
- [ ] Data persists correctly

### Responsive Design
- [ ] Works on mobile (375px)
- [ ] Works on tablet (768px)
- [ ] Works on laptop (1440px)

### Voice Agent (if applicable)
- [ ] Voice agent loads
- [ ] Voice agent responds to input

## Known Issues
_List any known issues here or delete section if none_

## Post-Launch Checks
- [ ] All env vars configured in Vercel
- [ ] Custom domain (if any) pointing correctly
- [ ] Email templates branded
- [ ] SSL certificate active

---
*Generated at handover time. Update this document as the product evolves.*
`;
}

function generateSupportContacts(slug) {
  return `# Support Contacts: ${slug}

> Who to call for what.

## Primary Contacts

| Role | Name | Email | Responsibility |
|------|------|-------|----------------|
| Product Owner | Dennis | dennis@corporateaisolutions.com | Decisions, roadmap |
| Tech Lead | — | — | Technical issues |
| Support | — | support@corporateaisolutions.com | User issues |

## Escalation Path

1. **User issue** → Support team
2. **Technical issue** → Tech Lead
3. **Strategic decision** → Product Owner

## External Resources

| Service | URL | Purpose |
|---------|-----|---------|
| Vercel Dashboard | https://vercel.com/corporate-ai-solutions | Deployments, logs |
| Supabase Dashboard | https://supabase.com/dashboard | Database, auth |
| Resend | https://resend.com | Email deliverability |

## Response Times

| Severity | Response Time | Example |
|----------|---------------|---------|
| Critical | 1 hour | Site down, data loss |
| High | 4 hours | Major feature broken |
| Medium | 24 hours | Minor issue |
| Low | 1 week | Feature request |

---
*Update this file when contacts change.*
`;
}

function generateRunbook() {
  return `# Common Issues Runbook

> Quick fixes for frequently encountered problems.

## Authentication Issues

### Magic link not arriving
1. Check spam/junk folder
2. Verify email address is correct
3. Check Resend dashboard for delivery status
4. Verify SUPABASE_URL and SMTP settings in Vercel

### "Invalid credentials" despite correct password
1. Clear browser cookies
2. Try incognito/private window
3. Check Supabase Auth users table for account existence

## Deployment Issues

### Build failing
1. Check Vercel build logs
2. Verify all env vars are set
3. Ensure dependencies are in package.json
4. Check for TypeScript errors

### 500 error on page load
1. Check Vercel function logs
2. Verify Supabase connection string
3. Check if middleware is blocking

## Email Issues

### Emails not sending
1. Verify Resend API key in Vercel
2. Check sender email is verified in Resend
3. Review Resend dashboard for rejected emails

### Wrong sender name
1. Update Supabase Auth email templates
2. Run \`configure-email-templates.sh\`

## Database Issues

### Data not saving
1. Check Supabase RLS policies
2. Verify service role key has write access
3. Check for constraint violations

---
*Add new issues and solutions as they are discovered.*
`;
}

function generateLaunchChecklist(slug) {
  return `# Launch Checklist: ${slug}

> Post-deploy verification before declaring launch complete.

## Pre-Launch (Day Before)
- [ ] All tests passing
- [ ] No critical errors in logs
- [ ] Env vars verified in Vercel
- [ ] Database migrations applied
- [ ] Backup strategy documented

## Launch Day
- [ ] Deploy to production successful
- [ ] Homepage loads correctly
- [ ] Auth flows work (signup, login, logout)
- [ ] Core feature verified
- [ ] Mobile responsive checked
- [ ] Email deliverability tested
- [ ] DNS resolving correctly (if custom domain)

## Post-Launch (24 hours)
- [ ] No error spikes in monitoring
- [ ] Users can sign up/log in
- [ ] Data persists correctly
- [ ] Performance acceptable
- [ ] Smart Sensors reporting green

## Ongoing
- [ ] Daily check: Smart Sensors dashboard
- [ ] Weekly: Review error logs
- [ ] Monthly: Certificate of Occupancy renewal check

---
*This checklist runs alongside Certificate of Occupancy auto-reset.*
`;
}

function copyCertificateOfOccupancy(slug) {
  const certPath = resolve(PRODUCT_FACTORY, "5-certification-signoff", "certificates", `${slug}.json`);
  
  if (existsSync(certPath)) {
    return readFileSync(certPath, "utf8");
  }
  
  return JSON.stringify({
    warning: "Certificate of Occupancy not found. Run Stage 5 certification first.",
    product_slug: slug,
    status: "not_certified"
  }, null, 2);
}

function generateHandoverPackage(slug) {
  const packageDir = resolve(PRODUCT_FACTORY, "6-handover-launch", "packages", slug);
  
  console.log(`\n📦 GENERATING HANDOVER PACKAGE: ${slug}`);
  console.log(`═`.repeat(50));
  
  mkdirSync(resolve(packageDir, "runbooks"), { recursive: true });
  
  const credentials = generateCredentials(slug);
  writeFileSync(
    resolve(packageDir, "credentials.json"),
    JSON.stringify(credentials, null, 2)
  );
  console.log(`✅ credentials.json`);
  
  writeFileSync(
    resolve(packageDir, "TESTING.md"),
    generateTestingDoc(slug)
  );
  console.log(`✅ TESTING.md`);
  
  writeFileSync(
    resolve(packageDir, "support-contacts.md"),
    generateSupportContacts(slug)
  );
  console.log(`✅ support-contacts.md`);
  
  writeFileSync(
    resolve(packageDir, "runbooks", "common-issues.md"),
    generateRunbook()
  );
  console.log(`✅ runbooks/common-issues.md`);
  
  writeFileSync(
    resolve(packageDir, "launch-checklist.md"),
    generateLaunchChecklist(slug)
  );
  console.log(`✅ launch-checklist.md`);
  
  writeFileSync(
    resolve(packageDir, "certificate-of-occupancy.json"),
    copyCertificateOfOccupancy(slug)
  );
  console.log(`✅ certificate-of-occupancy.json`);
  
  console.log(`\n📦 Handover package generated at:`);
  console.log(`   ${packageDir}`);
  console.log(`\n⚠️  IMPORTANT:`);
  console.log(`   1. Review credentials.json — replace \${VAR} placeholders`);
  console.log(`   2. Update support-contacts.md with actual team`);
  console.log(`   3. Run Certificate of Occupancy first (Stage 5)`);
  
  return packageDir;
}

async function main() {
  const slug = process.argv[2];
  
  if (!slug) {
    console.log(`Usage: node generate-handover-package.mjs <slug>`);
    process.exit(2);
  }

  generateHandoverPackage(slug);
}

main();
