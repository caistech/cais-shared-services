// Spam Act pillar 3, made real: the runtime half of consent.
//
// The rest of this package RENDERS an unsubscribe link. That is the easy half. The hard half — the
// half that is actually the legal obligation — is that the link WORKS, that the opt-out is durable,
// and that the send path refuses to mail someone who has used it. A footer with a dead link is
// worse than no footer: it is a documented promise you are visibly not keeping.
//
// This is the canonical shape every product reuses instead of hand-rolling a fourth one:
//
//   1. `unsubscribeUrlFor()`  — a signed, self-contained opt-out link. No lookup table, no expiry,
//      nothing to leak: the token IS the proof, verified by HMAC.
//   2. `createUnsubscribeRoute()` — a framework-agnostic handler that honours it. Web-standard
//      Request/Response, so it mounts in Next, Hono, Deno or a plain server unchanged.
//   3. `SuppressionStore` — the durable record the SEND path must consult. Suppression is a state,
//      not a deletion: a list re-import must not resurrect someone who opted out.
//
// Web Crypto (not node:crypto) so this stays usable on every runtime the rest of the package is.

/** How the address was suppressed. `bounce`/`complaint` come from provider webhooks. */
export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual";

/**
 * The durable opt-out record.
 *
 * Deliberately keyed by EMAIL, not user id: someone who unsubscribes, deletes their account and
 * signs up again with the same address has still told you to stop. A user-scoped flag forgets that;
 * this does not.
 */
export interface SuppressionStore {
  /** Is this address suppressed? The send path calls this BEFORE every commercial send. */
  isSuppressed(email: string): Promise<boolean>;
  /** Record an opt-out. Must be idempotent — people click twice. */
  suppress(email: string, reason: SuppressionReason, detail?: string): Promise<void>;
  /** Deliberate re-subscribe. Only ever from an affirmative act by the recipient. */
  resubscribe?(email: string): Promise<void>;
}

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** Addresses are compared lower-cased and trimmed — `A@x.com` and `a@x.com` are one person. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A signed opt-out token for an address.
 *
 * Self-contained by design: no row to create at send time, nothing to expire, and nothing useful
 * to steal — the worst an attacker can do with someone else's token is unsubscribe them, which is
 * the one direction that is safe to get wrong.
 */
export async function signUnsubscribeToken(email: string, secret: string): Promise<string> {
  const body = base64url(encoder.encode(normaliseEmail(email)));
  return `${body}.${await hmac(body, secret)}`;
}

/** Verify a token and return the address it covers, or null if it is missing/tampered/malformed. */
export async function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmac(body, secret);

  // Length-check first, then compare every byte without early exit.
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const email = fromBase64url(body);
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

/** The link that goes in the footer. Give it to `complianceFooterHtml` as `unsubscribeUrl`. */
export async function unsubscribeUrlFor(
  baseUrl: string,
  email: string,
  secret: string,
  path = "/unsubscribe",
): Promise<string> {
  const token = await signUnsubscribeToken(email, secret);
  return `${baseUrl.replace(/\/$/, "")}${path}?t=${encodeURIComponent(token)}`;
}

export interface UnsubscribeRouteOptions {
  /** HMAC secret. Same value used to mint the links (typically UNSUBSCRIBE_SECRET). */
  secret: string;
  /** Where the opt-out is recorded. */
  store: SuppressionStore;
  /** Shown on the confirmation page. */
  brandName: string;
  /**
   * One-click mode. When true, a GET unsubscribes immediately instead of showing a confirm button.
   *
   * Defaults to FALSE: mail clients and security scanners pre-fetch links, and a GET that mutates
   * state will be triggered by a scanner nobody asked. The two-step keeps the opt-out honest —
   * RFC 8058 one-click uses POST for exactly this reason, which this handler supports natively.
   */
  oneClick?: boolean;
  /** Optional hook — e.g. mirror the opt-out onto your own users table. Never blocks the response. */
  onUnsubscribed?: (email: string) => Promise<void> | void;
}

function page(title: string, body: string, brandName: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${brandName}</title>
<style>
 body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;color:#333}
 main{max-width:34rem;margin:0 auto;padding:4rem 1.25rem}
 .card{background:#fff;border-radius:12px;padding:2rem}
 h1{font-size:1.5rem;margin:0 0 .75rem}
 p{margin:0 0 1rem;color:#555}
 button{min-height:44px;padding:.75rem 1.5rem;font-size:1rem;font-weight:600;color:#fff;background:#0f766e;border:0;border-radius:8px;cursor:pointer}
</style></head><body><main><div class="card">${body}</div></main></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * The unsubscribe endpoint, framework-agnostic.
 *
 * Mount at `/unsubscribe`:
 *   export const { GET, POST } = createUnsubscribeRoute({ secret, store, brandName: 'Kira' })
 *
 * An invalid token still returns 200 with a neutral page. Telling a visitor "that address isn't on
 * our list" turns the endpoint into an address oracle, and someone trying to leave should never be
 * shown an error either way.
 */
export function createUnsubscribeRoute(options: UnsubscribeRouteOptions) {
  const { secret, store, brandName, oneClick = false, onUnsubscribed } = options;

  async function doUnsubscribe(email: string): Promise<void> {
    await store.suppress(email, "unsubscribe");
    if (onUnsubscribed) {
      try {
        await onUnsubscribed(email);
      } catch (error) {
        // The suppression is already recorded — that is the obligation. A failing mirror must not
        // turn a successful opt-out into an error page.
        console.error("[email-compliance] onUnsubscribed hook failed:", error);
      }
    }
  }

  const done = () =>
    page(
      "Unsubscribed",
      `<h1>You're unsubscribed</h1><p>You won't receive further marketing emails from ${brandName}.</p>
       <p>You may still get essential messages about anything you're signed up to — a receipt, a
       password reset, or notice of a payment.</p>`,
      brandName,
    );

  return {
    async GET(request: Request): Promise<Response> {
      const token = new URL(request.url).searchParams.get("t");
      const email = await verifyUnsubscribeToken(token, secret);

      if (!email) {
        return page(
          "Unsubscribe",
          `<h1>That link isn't valid</h1><p>It may have been altered in transit. Reply to any
           message from ${brandName} and we'll take you off the list by hand.</p>`,
          brandName,
        );
      }

      if (oneClick) {
        await doUnsubscribe(email);
        return done();
      }

      return page(
        "Unsubscribe",
        `<h1>Unsubscribe</h1><p>Stop sending marketing emails to <strong>${email}</strong>?</p>
         <form method="post"><input type="hidden" name="t" value="${token}">
         <button type="submit">Yes, unsubscribe me</button></form>`,
        brandName,
      );
    },

    /** Also the RFC 8058 List-Unsubscribe-Post target. */
    async POST(request: Request): Promise<Response> {
      let token = new URL(request.url).searchParams.get("t");
      if (!token) {
        try {
          const form = await request.formData();
          token = String(form.get("t") ?? "");
        } catch {
          token = null;
        }
      }

      const email = await verifyUnsubscribeToken(token, secret);
      if (!email) return page("Unsubscribe", `<h1>That link isn't valid</h1>`, brandName);

      await doUnsubscribe(email);
      return done();
    },
  };
}

/**
 * `List-Unsubscribe` headers (RFC 2369 + RFC 8058).
 *
 * Gmail and Outlook surface a native unsubscribe control when these are present, and increasingly
 * penalise bulk senders that omit them — so this is deliverability as much as compliance.
 */
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
