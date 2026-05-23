// elevenlabs-convai/session.ts
// Ephemeral anonymous-session tokens for unauthenticated voice (e.g. a public concierge).
//
// A signed token identifies an anonymous session for the duration of a LIVE call only.
// By design there is NO cross-session anon memory: the token is not meant to be persisted
// client-side, and anon data is purged on a short TTL (purge_expired_anon_sessions in
// migration.sql). Authed users never use this path — their identity is auth.uid().
//
// The token is a compact `<payload>.<sig>` string (HMAC-SHA256). The payload carries the
// anon session id (used as user_id on convai_* rows), the agent id, and an expiry.

import crypto from 'crypto';

export interface AnonSessionClaims {
  sid: string;       // anon session id — used as user_id on this session's convai_* rows
  agentId: string;
  exp: number;       // expiry, epoch seconds
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export interface MintAnonSessionOptions {
  agentId: string;
  ttlSeconds?: number;   // default 24h
  sid?: string;          // override session id (default: random UUID)
}

/**
 * Mint a signed anonymous-session token. Returns the token plus the session id and
 * expiry so the caller can insert a matching convai_anon_sessions row (store token_hash,
 * expires_at) for server-side resolution + purge.
 */
export function mintAnonSessionToken(
  secret: string,
  opts: MintAnonSessionOptions
): { token: string; sid: string; expiresAt: Date } {
  if (!secret) throw new Error('mintAnonSessionToken: secret is required.');
  const sid = opts.sid || crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 24 * 3600);
  const payload = base64url(JSON.stringify({ sid, agentId: opts.agentId, exp }));
  const token = `${payload}.${sign(secret, payload)}`;
  return { token, sid, expiresAt: new Date(exp * 1000) };
}

/**
 * Verify a signed anonymous-session token. Returns the claims if the signature is valid
 * and the token has not expired; otherwise null. Constant-time signature comparison.
 */
export function verifyAnonSessionToken(secret: string, token: string): AnonSessionClaims | null {
  if (!secret || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (!safeEqual(sig, sign(secret, payload))) return null;

  let claims: AnonSessionClaims;
  try {
    claims = JSON.parse(base64urlDecode(payload));
  } catch {
    return null;
  }
  if (!claims?.sid || !claims?.exp) return null;
  if (claims.exp * 1000 < Date.now()) return null;   // expired

  return claims;
}

/** SHA-256 hash of a token, for storing in convai_anon_sessions.token_hash (not the token itself). */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
