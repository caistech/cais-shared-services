/** @type {import('next').NextConfig} */

// ── Security headers (Class-A compliance default) ──────────────────────────────
// Promoted into the template 2026-06-03 so every new product passes the "Security Headers"
// compliance check on its first survey instead of failing it (X-Frame-Options / CSP / HSTS).
//
// ⚠️ CSP CAUTION: a CSP that is too strict silently breaks images, fonts, the Supabase
// connection, or inline/eval scripts Next sometimes needs. The baseline below is permissive
// enough to work with Next + Supabase + common vendor assets, while still satisfying the check.
// VERIFY against a real product build (open the deployed site, check the console for CSP
// violations) before treating it as locked. Tighten per product as needed — do not loosen to
// the point the check fails, and do not tighten to the point the app breaks (that would just
// trade one recurring failure for another).
//
// Supabase: replace/extend the supabase.co origins if a product uses a custom domain.
const SUPABASE = 'https://*.supabase.co wss://*.supabase.co';

const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js requires 'unsafe-inline'/'unsafe-eval' for its runtime in many setups; scoped to scripts.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${SUPABASE} https:`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@caistech/corporate-components'],
  async headers() {
    return [
      {
        // Apply to every route.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
