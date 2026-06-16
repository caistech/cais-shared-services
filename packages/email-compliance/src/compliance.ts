// Australian Spam Act 2003 — email compliance primitives (brand-configurable).
//
// Every COMMERCIAL electronic message an Australian business sends must satisfy three
// pillars (Spam Act 2003, enforced by ACMA):
//
//   1. CONSENT      — express (the recipient opted in) or inferred (a conspicuously-published
//                     business address, messaged about a matter relevant to that business's
//                     role/function). The consent basis is stated to the reader on every message.
//   2. IDENTIFY     — clearly identify the sender with accurate contact details that stay valid
//                     for ≥30 days after sending. We carry name + ABN + postal + email + phone.
//   3. UNSUBSCRIBE  — a functional, low-friction opt-out, honoured within 5 business days.
//                     Rendered prominently on every commercial message.
//
// This package is BRAND-CONFIGURABLE: the consuming repo supplies the sender identity. For a
// white-label / distributor product the DISTRIBUTOR's identity + ABN travels (the "whose brand
// travels" gate) — never a hardcoded CAS/Factory2Key identity. Pass `sender` explicitly, or set
// the EMAIL_SENDER_* env vars and call `senderFromEnv()`.

/** The legally-identifying sender details (Spam Act pillar 2). */
export interface SenderIdentity {
  /** Trading / legal name shown to the recipient. */
  name: string;
  /** Australian Business Number, e.g. "51 700 805 298". Strongly recommended on every AU send. */
  abn?: string;
  /** A reply-capable postal address (PO box is acceptable). */
  postal?: string;
  /** A monitored contact email. */
  email: string;
  /** A contact phone number. */
  phone?: string;
}

/**
 * The consent basis for THIS message, surfaced to the reader:
 *  - "inferred"  — cold outreach to a conspicuously-published business address.
 *  - "express"   — the recipient opted in (e.g. ticked a box / registered interest).
 * Pass a full sentence to override the default wording.
 */
export type ConsentBasis = "inferred" | "express" | (string & {});

export interface ComplianceFooterArgs {
  /** Who is sending (Spam Act pillar 2). */
  sender: SenderIdentity;
  /**
   * The unsubscribe URL (Spam Act pillar 3). REQUIRED for commercial messages. Omit ONLY for a
   * transactional, recipient-initiated message (password reset, receipt) — those are not
   * "commercial electronic messages" and may carry identification without an opt-out.
   */
  unsubscribeUrl?: string;
  /** The consent basis shown to the reader (Spam Act pillar 1). */
  reason?: ConsentBasis;
}

/** Build a SenderIdentity from EMAIL_SENDER_* env vars (zero-code adoption). Throws if name/email missing. */
export function senderFromEnv(env: Record<string, string | undefined> = process.env): SenderIdentity {
  const name = env.EMAIL_SENDER_NAME;
  const email = env.EMAIL_SENDER_EMAIL;
  if (!name || !email) {
    throw new Error(
      "senderFromEnv: EMAIL_SENDER_NAME and EMAIL_SENDER_EMAIL are required for Spam Act sender identification.",
    );
  }
  return {
    name,
    email,
    abn: env.EMAIL_SENDER_ABN,
    postal: env.EMAIL_SENDER_POSTAL,
    phone: env.EMAIL_SENDER_PHONE,
  };
}

/** The single-line business identification (pillar 2), reused in HTML + text. */
export function identificationLine(sender: SenderIdentity): string {
  return [sender.name, sender.abn && `ABN ${sender.abn}`, sender.postal]
    .filter(Boolean)
    .join(" · ");
}

function reasonText(reason: ConsentBasis | undefined, senderName: string): string {
  if (reason === "inferred")
    return "You received this because your business is publicly listed and this message relates to your work.";
  if (reason === "express")
    return `You're receiving this because you registered your interest with ${senderName} and agreed to receive information about this offer.`;
  return reason ?? "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Compliance footer as HTML (identification + consent basis + a prominent unsubscribe). */
export function complianceFooterHtml(args: ComplianceFooterArgs): string {
  const { sender } = args;
  const reason = reasonText(args.reason, sender.name);
  const contact = [
    sender.postal && escapeHtml(sender.postal),
    `<a href="mailto:${encodeURIComponent(sender.email)}" style="color:#6b7280;">${escapeHtml(sender.email)}</a>`,
    sender.phone && escapeHtml(sender.phone),
  ]
    .filter(Boolean)
    .join(" · ");
  const unsubscribe = args.unsubscribeUrl
    ? `<p style="margin:0;font-size:13px;">
         <a href="${escapeHtml(args.unsubscribeUrl)}" style="color:#1B3A5B;font-weight:600;text-decoration:underline;">Unsubscribe</a>
         — opt out and we won't email you again.
       </p>`
    : "";
  return `<div style="background:#F5F3EE;padding:16px 28px;font-size:12px;color:#6b7280;line-height:1.55;border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 6px;"><strong>${escapeHtml(sender.name)}</strong>${sender.abn ? ` · ABN ${escapeHtml(sender.abn)}` : ""}</p>
    <p style="margin:0 0 6px;">${contact}</p>
    ${reason ? `<p style="margin:0 0 6px;">${escapeHtml(reason)}</p>` : ""}
    ${unsubscribe}
  </div>`;
}

/** Compliance footer as plain text (mirror of the HTML footer). */
export function complianceFooterText(args: ComplianceFooterArgs): string {
  const { sender } = args;
  const reason = reasonText(args.reason, sender.name);
  const lines = [
    "—",
    [sender.name, sender.abn && `ABN ${sender.abn}`].filter(Boolean).join(" · "),
    [sender.postal, sender.email, sender.phone].filter(Boolean).join(" · "),
  ];
  if (reason) lines.push(reason);
  if (args.unsubscribeUrl) lines.push(`Unsubscribe: ${args.unsubscribeUrl}`);
  return lines.join("\n");
}

export interface EmailBody {
  html?: string;
  text?: string;
}

/**
 * Append the compliance footer to a composed email body. The single call every external email
 * composer should make — keeps identification + opt-out consistent and non-bypassable.
 */
export function withComplianceFooter(body: EmailBody, args: ComplianceFooterArgs): EmailBody {
  return {
    html: body.html !== undefined ? `${body.html}\n${complianceFooterHtml(args)}` : undefined,
    text: body.text !== undefined ? `${body.text}\n\n${complianceFooterText(args)}` : undefined,
  };
}

// ── Jurisdiction guard ──────────────────────────────────────────────────────────────────────
//
// We are compliant for AUSTRALIA ONLY. Every other country has its own email-marketing law
// (US CAN-SPAM, Canada CASL — express consent, EU/UK GDPR + PECR — opt-in, etc.). Sending a
// commercial EMAIL to a non-AU contact before that country's compliance is set up is a legal
// exposure, so this guard BLOCKS it portfolio-wide until the jurisdiction is explicitly cleared.
//
// SCOPE: email outreach only. LinkedIn outreach (via @caistech/unipile-channels) is already
// within platform compliance and is NOT gated here.

/** Jurisdictions whose email-marketing compliance is configured + cleared to send. AU only today. */
export const SUPPORTED_OUTREACH_JURISDICTIONS = ["AU"] as const;

/** An ISO-3166 alpha-2 country code, e.g. "AU", "US", "GB". */
export type Jurisdiction = string;

/**
 * Block an EMAIL send to a recipient outside a cleared jurisdiction. Throws when the recipient's
 * country isn't in the supported list (default: AU only). A repo that starts emailing
 * international contacts MUST set that country's compliance up and add it to `supported` first —
 * until then this hard-stops the send. LinkedIn/other-channel outreach is out of scope (email only).
 */
export function assertJurisdictionAllowed(
  recipientCountry: Jurisdiction | undefined,
  opts: { supported?: readonly string[] } = {},
): void {
  const supported = (opts.supported ?? SUPPORTED_OUTREACH_JURISDICTIONS).map((c) => c.toUpperCase());
  const cc = (recipientCountry ?? "").trim().toUpperCase();
  if (!cc) {
    throw new Error(
      "Jurisdiction guard: the recipient's country is unknown, so email-marketing compliance " +
        "can't be verified. Tag each contact with an ISO country code before sending (AU contacts pass).",
    );
  }
  if (!supported.includes(cc)) {
    throw new Error(
      `Jurisdiction guard: email outreach to ${cc} contacts is BLOCKED — ${cc} email-marketing ` +
        `compliance is not set up. Only [${supported.join(", ")}] is cleared. Configure ${cc}'s ` +
        `consent/identification/unsubscribe rules and add it to SUPPORTED_OUTREACH_JURISDICTIONS ` +
        `before sending. (LinkedIn outreach is exempt — this guard applies to EMAIL only.)`,
    );
  }
}

/**
 * Guard a COMMERCIAL send. Throws if the message can't be Spam-Act-compliant — a missing
 * unsubscribe link or incomplete sender identity — OR if the recipient is outside a cleared
 * jurisdiction (when `recipientCountry` is supplied; pass it whenever the contact's country is
 * known so non-AU sends are blocked). Call this in the send path so a non-compliant commercial
 * email is impossible to ship (mark transactional, recipient-initiated messages with
 * `commercial: false` to skip the unsubscribe requirement; identity is always required).
 */
export function assertCompliant(
  args: ComplianceFooterArgs & {
    commercial?: boolean;
    /** The recipient's ISO country. When set, a non-supported country hard-blocks the send. */
    recipientCountry?: Jurisdiction;
    /** Override the cleared jurisdictions (default: AU only). */
    supportedJurisdictions?: readonly string[];
  },
): void {
  const { sender, unsubscribeUrl, commercial = true } = args;
  if (!sender?.name || !sender?.email) {
    throw new Error("Spam Act: sender identity must include at least a name and a contact email.");
  }
  if (!sender.abn) {
    throw new Error(
      "Spam Act: an ABN is required in the sender identity (set sender.abn / EMAIL_SENDER_ABN).",
    );
  }
  if (commercial && !unsubscribeUrl) {
    throw new Error(
      "Spam Act: a commercial email must carry a functional unsubscribe URL. Pass unsubscribeUrl, " +
        "or set commercial:false for a transactional, recipient-initiated message.",
    );
  }
  if (commercial && args.recipientCountry !== undefined) {
    assertJurisdictionAllowed(args.recipientCountry, { supported: args.supportedJurisdictions });
  }
}
