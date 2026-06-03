// checks/security-headers.ts — the Security Headers compliance check, emitting the new CheckResult.
//
// Class A (deterministic config). Fetches the live site, inspects response headers, and returns a
// plain-language CheckResult. On fail, the fix routes to the 'security-headers' codemod (which adds
// the headers() block to next.config.js — the SAME block now shipped in cais-build-template-v2, so
// new products pass this on first survey; the codemod exists to fix products built before that).
//
// Place at: product-factory/pipeline-cockpit/src/lib/checks/security-headers.ts
// Wire into the existing runner: in run-test/validation route, replace the old prose finding for
// checkId 'security-headers' with `return await checkSecurityHeaders(liveUrl, recurrence)`.
//
// NOTE — this check inspects RESPONSE HEADERS, not browser-console output, so it is unaffected by
// the expected `vercel.live` CSP console warning. That warning (Vercel's feedback widget being
// blocked by a strict script-src) is EXPECTED and HARMLESS on Vercel deployments — do NOT add any
// check that flags it as a finding, and do NOT loosen the template CSP to silence it. See the
// template README and bug-knowledge id `cais-csp-blocks-vercel-live-expected`.

import type { CheckResult, FixOption } from './check-result';

/** The headers we require, with a plain-language name for each (used in the explanation). */
const REQUIRED_HEADERS: { header: string; plainName: string }[] = [
  { header: 'x-frame-options', plainName: 'clickjacking protection' },
  { header: 'content-security-policy', plainName: 'a content security policy' },
  { header: 'strict-transport-security', plainName: 'forced-HTTPS (HSTS)' },
  { header: 'x-content-type-options', plainName: 'MIME-sniffing protection' },
  { header: 'referrer-policy', plainName: 'a referrer policy' },
];

export async function checkSecurityHeaders(
  liveUrl: string,
  recurrence?: number,
): Promise<CheckResult> {
  const checkId = 'security-headers';
  const title = 'Security Headers';

  let present: Set<string>;
  try {
    // force-no-store so a fix re-check reads the CURRENT live headers, not a cached read.
    const res = await fetch(liveUrl, { method: 'GET', cache: 'no-store' as RequestCache });
    present = new Set(Array.from(res.headers.keys()).map((k) => k.toLowerCase()));
  } catch (err) {
    // Couldn't reach the site — report as fail with a clear, non-technical explanation.
    return {
      checkId,
      title,
      status: 'fail',
      plain: {
        whatWeChecked: 'whether your site is reachable and sends standard browser-safety settings',
        whatWeFound: "we couldn't load your site to check it",
        implication: 'we need the site to be live before we can verify or fix its safety settings',
      },
      raw: { error: err instanceof Error ? err.message : String(err), liveUrl },
    };
  }

  const missing = REQUIRED_HEADERS.filter((h) => !present.has(h.header));

  if (missing.length === 0) {
    return {
      checkId,
      title,
      status: 'pass',
      plain: {
        whatWeChecked: 'how your site protects visitors from common web attacks',
        whatWeFound: 'your site sends all the standard browser-safety settings',
        implication: 'no action needed — this is what professional sites are expected to do',
      },
      raw: { present: Array.from(present) },
    };
  }

  // Build the plain-language finding from the missing items, without header jargon up front.
  const missingPlain = missing.map((m) => m.plainName);
  const missingList =
    missingPlain.length === 1
      ? missingPlain[0]
      : `${missingPlain.slice(0, -1).join(', ')} and ${missingPlain[missingPlain.length - 1]}`;

  const options: FixOption[] = [
    {
      id: 'apply',
      label: 'Apply the fix',
      consequence: 'passes the check; standard and safe; no visible change to your site',
      recommended: true,
      route: 'codemod',
      payload: { codemodId: 'security-headers' },
    },
    {
      id: 'skip',
      label: 'Skip for now',
      consequence: 'the check stays red; you can come back to it anytime',
      route: 'human-ack',
      payload: { ack: 'skipped', checkId },
    },
  ];

  return {
    checkId,
    title,
    status: 'fail',
    plain: {
      whatWeChecked: 'how your site protects visitors from common web attacks',
      whatWeFound: `your site is missing ${missingList} — standard safety settings that tell browsers how to handle your pages securely`,
      implication:
        'most professional sites send these, and some partners and investors check for them; adding them has no downside and no visible change',
    },
    fix: {
      fixClass: 'A',
      proposed: 'add the standard security settings to your site’s configuration (a one-time config change)',
      options,
      technical: {
        summary: `Missing response headers: ${missing.map((m) => m.header).join(', ')}. Fix adds a headers() block to next.config.js (X-Frame-Options, CSP, HSTS, X-Content-Type-Options, Referrer-Policy).`,
        files: ['next.config.js'],
      },
    },
    recurrence,
    raw: { present: Array.from(present), missing: missing.map((m) => m.header) },
  };
}