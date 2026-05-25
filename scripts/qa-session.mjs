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
 * THIS IS NOT AN AUTH BYPASS. Both modes produce a normal session for a real,
 * confirmed test account and reproduce the exact cookie @supabase/ssr would have
 * written after a successful login. No production code is involved; nothing here
 * weakens auth. The account is a normal `owner` user under RLS.
 *
 * TWO GRANT MODES (pick by the product's login UI):
 *
 *   password   (default) — products with a password field. A normal
 *              grant_type=password token exchange via the public anon endpoint.
 *              Needs QA_TEST_EMAIL + QA_TEST_PASSWORD.
 *
 *   --magic-link        — products whose login is MAGIC-LINK ONLY (signInWithOtp,
 *              no password field — e.g. corporate-ai-solutions /pipeline/login).
 *              The password grant cannot serve these. This mode mints the same
 *              real session via the service-role Admin API:
 *                1. POST /auth/v1/admin/generate_link {type:'magiclink', email}
 *                   → returns a non-PKCE `hashed_token` (no email is sent, no
 *                     mailbox to read, no redirect-allowlist / PKCE dependency).
 *                2. POST /auth/v1/verify {type:'magiclink', token_hash}
 *                   → returns the real session (access_token + refresh_token).
 *              Needs QA_TEST_EMAIL + SUPABASE_SERVICE_ROLE_KEY. This is the
 *              automation-grade default for magic-link products. (To ALSO exercise
 *              email delivery, request the link from the real form and read it from
 *              a dedicated, API-readable QA mailbox — never the operator's personal
 *              inbox — then navigate it in the same browser context. Documented in
 *              the repo's docs/TESTING.md.)
 *
 * Two tester modes (orthogonal to the grant mode; see each repo's docs/TESTING.md):
 *   Mode A — test the auth PATH: drive the real /login form.
 *   Mode B — get PAST auth fast (this script): inject the session cookie.
 *
 * Usage:
 *   # password product
 *   QA_TEST_EMAIL=qa@… QA_TEST_PASSWORD=… node qa-session.mjs --root /path/to/repo --origin https://app.example.com
 *   # magic-link-only product
 *   QA_TEST_EMAIL=qa@… SUPABASE_SERVICE_ROLE_KEY=… node qa-session.mjs --magic-link --root /path/to/repo --origin https://app.example.com
 *   # --root defaults to cwd; --origin defaults to NEXT_PUBLIC_APP_URL or the Supabase URL host.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (+ SUPABASE_SERVICE_ROLE_KEY
 * for --magic-link) from <root>/.env.local (falling back to process.env). Creds come from
 * env, never hard-coded.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes("--" + name);

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

const MODE = hasFlag("magic-link") ? "magic-link" : "password";
const SUPA = pick("NEXT_PUBLIC_SUPABASE_URL");
const ANON = pick("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = pick("SUPABASE_SERVICE_ROLE_KEY");
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
if (MODE === "password" && !password) {
  console.error("password mode: set QA_TEST_PASSWORD (the QA account password, from your password manager). Never commit it. (For a magic-link-only product, pass --magic-link instead.)");
  process.exit(2);
}
if (MODE === "magic-link" && !SERVICE) {
  console.error("--magic-link mode: set SUPABASE_SERVICE_ROLE_KEY (used to mint the real session via the Admin generate_link API). Never commit it.");
  process.exit(2);
}

const origin = arg("origin", pick("NEXT_PUBLIC_APP_URL") || `https://${new URL(SUPA).hostname}`);
const ref = new URL(SUPA).hostname.split(".")[0];
const cookieName = `sb-${ref}-auth-token`;
const MAX_CHUNK = 3180; // @supabase/ssr chunks values larger than this

const toBase64Url = (str) =>
  Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Password grant via the public anon endpoint — products with a password field. */
async function passwordGrant() {
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
  return session;
}

/**
 * Magic-link grant via the service-role Admin API — magic-link-only products.
 * generate_link mints a non-PKCE hashed_token (no email sent); verify exchanges
 * it for a real session. Same end result as a user clicking the emailed link.
 */
async function magicLinkGrant() {
  const gen = await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const linkData = await gen.json();
  if (gen.status !== 200) {
    console.error(`generate_link FAILED (HTTP ${gen.status}): ${JSON.stringify(linkData).slice(0, 300)}`);
    console.error("(Does the QA account exist + is it email-confirmed? Create it with admin.createUser({email, password, email_confirm:true}) and add its email to ADMIN_EMAILS.)");
    process.exit(1);
  }
  const tokenHash = linkData.hashed_token || linkData.properties?.hashed_token;
  if (!tokenHash) {
    console.error(`generate_link returned no hashed_token: ${JSON.stringify(linkData).slice(0, 300)}`);
    process.exit(1);
  }
  const ver = await fetch(`${SUPA}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await ver.json();
  if (ver.status !== 200 || !session.access_token) {
    console.error(`verify FAILED (HTTP ${ver.status}): ${JSON.stringify(session).slice(0, 200)}`);
    process.exit(1);
  }
  return session;
}

function emitSession(session) {
  const encoded = "base64-" + toBase64Url(JSON.stringify(session));
  const chunks = [];
  for (let i = 0; i < encoded.length; i += MAX_CHUNK) chunks.push(encoded.slice(i, i + MAX_CHUNK));

  console.log(`✅ ${MODE.toUpperCase()} OK — real session for ${session.user?.email} (confirmed: ${session.user?.confirmed_at ? "yes" : "no"})`);
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
  console.log("the cookie, fall back to Mode A — drive the creds/link through the real /login form.");
}

(async () => {
  const session = MODE === "magic-link" ? await magicLinkGrant() : await passwordGrant();
  emitSession(session);
})();
