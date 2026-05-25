#!/usr/bin/env node
/**
 * qa-session.mjs (PORTABLE / canonical) — mint a REAL Supabase session for a
 * project's persistent QA account and emit the auth cookie(s) a /browse agent
 * can set to land authenticated WITHOUT driving the (flaky) login form.
 *
 * Portfolio canon: PRODUCT_STANDARDS.md §9 "Automated-tester auth — a real QA
 * account, never a backdoor." Consume THIS helper from a repo (copy or `node`
 * it with --root pointing at the repo); do not fork the logic per project.
 *
 * THIS IS NOT AN AUTH BYPASS. It performs a normal password grant for a real,
 * confirmed test account and reproduces the exact cookie @supabase/ssr would
 * have written after a successful form login. No production code is involved;
 * nothing here weakens auth. The account is a normal `owner` user under RLS.
 *
 * Two tester modes (see each repo's docs/TESTING.md):
 *   Mode A — test the auth PATH: type the creds into the real /login form.
 *   Mode B — get PAST auth fast (this script): inject the session cookie.
 *
 * Usage:
 *   QA_TEST_PASSWORD=... node qa-session.mjs --root /path/to/repo --origin https://app.example.com
 *   # --root defaults to cwd; --origin defaults to NEXT_PUBLIC_APP_URL or the Supabase URL host.
 *   # QA_TEST_EMAIL overrides the account email (no portfolio-wide default — pass it per repo).
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from <root>/.env.local
 * (falling back to process.env). Creds come from env, never hard-coded.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const root = arg("root", process.cwd());

function envFromFile(file) {
  try {
    const txt = readFileSync(join(root, file), "utf8");
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = envFromFile(".env.local");
const pick = (k) => process.env[k] || fileEnv[k];

const SUPA = pick("NEXT_PUBLIC_SUPABASE_URL");
const ANON = pick("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = process.env.QA_TEST_EMAIL;
const password = process.env.QA_TEST_PASSWORD;

if (!SUPA || !ANON) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (env or <root>/.env.local).");
  process.exit(2);
}
if (!email) {
  console.error("Set QA_TEST_EMAIL (the repo's persistent QA account email).");
  process.exit(2);
}
if (!password) {
  console.error("Set QA_TEST_PASSWORD (the QA account password, from your password manager). Never commit it.");
  process.exit(2);
}

const origin = arg("origin", pick("NEXT_PUBLIC_APP_URL") || `https://${new URL(SUPA).hostname}`);
const ref = new URL(SUPA).hostname.split(".")[0];
const cookieName = `sb-${ref}-auth-token`;
const MAX_CHUNK = 3180; // @supabase/ssr chunks values larger than this

const toBase64Url = (str) =>
  Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

(async () => {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await r.json();
  if (r.status !== 200 || !session.access_token) {
    console.error(`LOGIN FAILED (HTTP ${r.status}): ${JSON.stringify(session).slice(0, 200)}`);
    process.exit(1);
  }

  const encoded = "base64-" + toBase64Url(JSON.stringify(session));
  const chunks = [];
  for (let i = 0; i < encoded.length; i += MAX_CHUNK) chunks.push(encoded.slice(i, i + MAX_CHUNK));

  console.log(`✅ LOGIN OK — real session for ${session.user?.email} (confirmed: ${session.user?.confirmed_at ? "yes" : "no"})`);
  console.log(`   expires_at: ${new Date(session.expires_at * 1000).toISOString()}`);
  console.log("");
  console.log(`Set these cookie(s) on ${origin}, path=/, then navigate to a protected route:`);
  if (chunks.length === 1) {
    console.log(`   ${cookieName} = ${chunks[0]}`);
  } else {
    chunks.forEach((c, i) => console.log(`   ${cookieName}.${i} = ${c}`));
    console.log(`   (${chunks.length} chunks — set ALL; the server recombines .0/.1/...)`);
  }
  console.log("");
  console.log("Raw tokens (if a tool prefers setSession(access_token, refresh_token)):");
  console.log(`   access_token=${session.access_token}`);
  console.log(`   refresh_token=${session.refresh_token}`);
  console.log("");
  console.log("NOTE (best-effort): cookie encoding follows the current @supabase/ssr default");
  console.log("(base64url, `base64-` prefix). If a version bump changes it and the server rejects");
  console.log("the cookie, fall back to Mode A — type the creds into the real /login form.");
})();
