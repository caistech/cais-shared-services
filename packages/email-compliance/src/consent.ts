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

import type { SenderIdentity } from "./compliance.js";

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

/**
 * How the opt-out page presents itself.
 *
 * This is not decoration. An unsubscribe page is reached from an email, by someone who is already
 * mildly annoyed, and it asks them to confirm an action — which is exactly the shape of a phishing
 * page. A bare white card with no logo, no name and no way back reads as one. Field feedback,
 * verbatim: *"my first thought is phishing and my second is I'll mark it as spam"* — which damages
 * deliverability more than the unsubscribe itself does.
 *
 * So the page identifies itself the same way the email did: same brand, same legal entity, a
 * contact address, and a link back to something real.
 */
export interface UnsubscribeBrand {
  /** Absolute URL of a logo/avatar. Rendered ~40px. Omit if there isn't one. */
  logoUrl?: string;
  /** Where "back to <brand>" goes. Absolute. */
  homeUrl?: string;
  /** Accent for the button + links. Any CSS colour. Defaults to a neutral teal. */
  accent?: string;
  /** Shown as the human fallback ("not what you wanted? email us"). */
  supportEmail?: string;
}

export interface UnsubscribeRouteOptions {
  /** HMAC secret. Same value used to mint the links (typically UNSUBSCRIBE_SECRET). */
  secret: string;
  /** Where the opt-out is recorded. */
  store: SuppressionStore;
  /** Shown on the confirmation page. */
  brandName: string;
  /** Visual identity, so the page doesn't read as a phishing form. See {@link UnsubscribeBrand}. */
  brand?: UnsubscribeBrand;
  /**
   * The legal entity behind the send (Spam Act pillar 2). Rendered as the page footer.
   *
   * The same identity the email itself carries — pass `senderFromEnv()`. A recipient who wants to
   * check who is actually emailing them should not have to go back to the email to find out.
   */
  sender?: SenderIdentity;
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

/** Minimal HTML escape — every interpolated value below is attacker-influenced (the token) or
 *  operator-supplied (brand/sender), and this page is rendered outside any framework's escaping. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface PageChrome {
  brandName: string;
  brand?: UnsubscribeBrand;
  sender?: SenderIdentity;
}

function page(title: string, body: string, chrome: PageChrome): Response {
  const { brandName, brand = {}, sender } = chrome;
  const accent = brand.accent ?? "#0f766e";

  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="" width="40" height="40">`
    : "";

  // Identity block: who this page belongs to, above the fold, before we ask for a click.
  const header = `<header class="brand">${logo}<span>${esc(brandName)}</span></header>`;

  // The Spam Act identification the email carried, repeated here so it is checkable in place.
  const identity = sender
    ? `<p class="who"><strong>${esc(sender.name)}</strong>${sender.abn ? ` · ABN ${esc(sender.abn)}` : ""}` +
      `${sender.postal ? `<br>${esc(sender.postal)}` : ""}` +
      `<br><a href="mailto:${esc(sender.email)}">${esc(sender.email)}</a>` +
      `${sender.phone ? ` · ${esc(sender.phone)}` : ""}</p>`
    : "";

  const support = brand.supportEmail
    ? `<p class="who">Not what you wanted? Email <a href="mailto:${esc(brand.supportEmail)}">${esc(brand.supportEmail)}</a>.</p>`
    : "";

  const back = brand.homeUrl
    ? `<p class="back"><a href="${esc(brand.homeUrl)}">← Back to ${esc(brandName)}</a></p>`
    : "";

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · ${esc(brandName)}</title>
<style>
 :root{color-scheme:light}
 body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;color:#333}
 main{max-width:34rem;margin:0 auto;padding:3rem 1.25rem}
 .brand{display:flex;align-items:center;gap:.65rem;margin:0 0 1.25rem;font-size:1.15rem;font-weight:700;color:#1c1917}
 .brand img{border-radius:50%;object-fit:cover;display:block}
 .card{background:#fff;border-radius:12px;padding:2rem;border:1px solid #e7e5e4}
 h1{font-size:1.5rem;margin:0 0 .75rem;color:#1c1917}
 p{margin:0 0 1rem;color:#555}
 a{color:${esc(accent)}}
 button{min-height:44px;padding:.75rem 1.5rem;font-size:1rem;font-weight:600;color:#fff;background:${esc(accent)};border:0;border-radius:8px;cursor:pointer}
 button:hover{filter:brightness(.94)}
 footer{margin:1.5rem .25rem 0}
 .who{font-size:.8125rem;line-height:1.55;color:#78716c;margin:0 0 .75rem}
 .back a{display:inline-flex;align-items:center;min-height:44px;font-size:.875rem;font-weight:500}
</style></head><body><main>${header}<div class="card">${body}</div>
<footer>${support}${identity}${back}</footer></main></body></html>`,
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
  const { secret, store, brandName, brand, sender, oneClick = false, onUnsubscribed } = options;
  const chrome: PageChrome = { brandName, brand, sender };

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
      chrome,
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
          chrome,
        );
      }

      if (oneClick) {
        await doUnsubscribe(email);
        return done();
      }

      return page(
        "Unsubscribe",
        `<h1>Unsubscribe</h1><p>Stop sending marketing emails to <strong>${email}</strong>?</p>
         <form method="post"><input type="hidden" name="t" value="${esc(token ?? "")}">
         <button type="submit">Yes, unsubscribe me</button></form>`,
        chrome,
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
      if (!email) return page("Unsubscribe", `<h1>That link isn't valid</h1>`, chrome);

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
