/**
 * @caistech/email-send — the portfolio's Resend transport.
 *
 * The missing middle piece between two packages that already existed: `@caistech/nudge-core`
 * defines an `EmailTransport` interface but ships no implementation, and
 * `@caistech/email-compliance` produces the Spam Act footer but does not send. Every product was
 * therefore writing its own Resend call — Kira via the SDK with three local templates,
 * raiseready-core via raw fetch deriving `noreply@<slug>` — with divergent from-domains and
 * divergent (or absent) footers. For a resold, white-label channel that is a deliverability and
 * compliance risk, not a tidiness one.
 *
 * This package owns SENDING and the FOOTER. Templates stay in the product — they are its voice.
 *
 * Zero dependencies: Resend is called over its REST API with native fetch, so this adds no SDK
 * weight and runs anywhere fetch does.
 */

import {
  complianceFooterHtml,
  complianceFooterText,
  listUnsubscribeHeaders,
  normaliseEmail,
  type ConsentBasis,
  type SenderIdentity,
  type SuppressionStore,
} from '@caistech/email-compliance'

/**
 * The only Resend-verified sending subdomain in the portfolio. The bare apex is NOT verified —
 * mail from it is rejected, which is exactly how Kira sent every transactional email to nowhere
 * for months before this was noticed. Override per product, but override to something VERIFIED.
 */
export const DEFAULT_FROM = 'noreply@updates.corporateaisolutions.com'

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  /** Plain-text alternative. Derived from the HTML when omitted. */
  text?: string
  /** Overrides the transport's configured `from`. */
  from?: string
  replyTo?: string
  /**
   * Commercial mail (campaign, newsletter, outreach) MUST carry the compliance footer; set this so
   * the transport appends it. Transactional mail (password reset, receipt, billing notice) is
   * recipient-initiated and may omit the unsubscribe — pass `{ transactional: true }` to get the
   * identification footer only.
   */
  compliance?: ComplianceOptions
}

export interface ComplianceOptions {
  /**
   * Transactional mail: identification footer, no unsubscribe. Anything commercial must instead
   * supply `unsubscribeUrl` + `reason` — `assertCompliant` in @caistech/email-compliance is the
   * guard that enforces that at the product's send path.
   */
  transactional?: boolean
  unsubscribeUrl?: string
  reason?: ConsentBasis
  /** Overrides the transport's configured sender identity for this send (white-label). */
  sender?: SenderIdentity
}

export interface SendResult {
  id: string | null
  /** True when the send was skipped because the recipient is suppressed. `id` is null. */
  suppressed?: boolean
}

export interface EmailSender {
  send(params: SendEmailParams): Promise<SendResult>
  /**
   * `@caistech/nudge-core`'s `EmailTransport` shape, so this can be handed straight to
   * `createEmailSender(transport, from, config)` without an adapter.
   */
  transport: { send(params: { from: string; to: string; subject: string; html: string }): Promise<void> }
}

export interface CreateEmailSenderOptions {
  /** Resend API key. Defaults to `RESEND_API_KEY`. */
  apiKey?: string
  /** Default From. Must be a VERIFIED sender. Defaults to `EMAIL_FROM` then `DEFAULT_FROM`. */
  from?: string
  /**
   * Sender identity for the compliance footer. A white-label / distributor product passes the
   * DISTRIBUTOR's identity + ABN here, never a CAS one — "whose brand travels" is the gate.
   */
  sender?: SenderIdentity
  /**
   * The opt-out list. When provided, every COMMERCIAL send checks it first and is skipped if the
   * recipient has unsubscribed.
   *
   * Wire this. An unsubscribe link that renders but isn't enforced is a documented promise you are
   * visibly not keeping — worse than no link at all. Transactional mail is exempt by design: a
   * receipt or a password reset is not something you opt out of.
   */
  suppressions?: SuppressionStore
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Strip tags for the plain-text alternative — every send should have one (deliverability). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Append the compliance footer to an HTML body, just before `</body>` when there is one. */
function appendHtmlFooter(html: string, footer: string): string {
  const closing = /<\/body>/i
  return closing.test(html) ? html.replace(closing, `${footer}</body>`) : `${html}${footer}`
}

export function createEmailSender(options: CreateEmailSenderOptions = {}): EmailSender {
  const resolveKey = () => {
    const key = options.apiKey ?? process.env.RESEND_API_KEY
    // Resolved at SEND time, not construction time: constructing at module scope with no key is
    // what broke Next.js build-time page-data collection in every product that used the SDK.
    if (!key) throw new Error('email-send: RESEND_API_KEY is not set')
    return key
  }
  const defaultFrom = options.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM
  const doFetch = options.fetchImpl ?? fetch

  async function send(params: SendEmailParams): Promise<SendResult> {
    const recipients = Array.isArray(params.to) ? params.to : [params.to]

    // Commercial mail to someone who opted out must not go. Transactional is exempt — you don't
    // unsubscribe from a receipt. Checked BEFORE anything else so a suppressed address never even
    // reaches the provider.
    const isCommercial = Boolean(params.compliance) && !params.compliance?.transactional
    if (isCommercial && options.suppressions) {
      const allowed: string[] = []
      for (const recipient of recipients) {
        // Throws on a store failure — see SuppressionStore: not being able to tell whether someone
        // opted out means you must not send, not that it's probably fine.
        if (!(await options.suppressions.isSuppressed(recipient))) allowed.push(recipient)
      }
      if (allowed.length === 0) return { id: null, suppressed: true }
      recipients.length = 0
      recipients.push(...allowed)
    }

    let html = params.html
    let text = params.text ?? htmlToText(params.html)

    const sender = params.compliance?.sender ?? options.sender
    if (params.compliance && sender) {
      const args = {
        sender,
        ...(params.compliance.unsubscribeUrl ? { unsubscribeUrl: params.compliance.unsubscribeUrl } : {}),
        ...(params.compliance.reason ? { reason: params.compliance.reason } : {}),
      }
      html = appendHtmlFooter(html, complianceFooterHtml(args))
      text = `${text}\n\n${complianceFooterText(args)}`
    }

    const response = await doFetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolveKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from ?? defaultFrom,
        to: recipients,
        subject: params.subject,
        html,
        text,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        // Gmail and Outlook surface a native unsubscribe control from these, and increasingly
        // penalise bulk senders that omit them — deliverability as much as compliance.
        ...(params.compliance?.unsubscribeUrl
          ? { headers: listUnsubscribeHeaders(params.compliance.unsubscribeUrl) }
          : {}),
      }),
    })

    if (!response.ok) {
      // Surface Resend's own message — "domain is not verified" is the single most common failure
      // and is unrecognisable behind a generic "send failed".
      const detail = await response.text().catch(() => '')
      throw new Error(`email-send: Resend responded ${response.status}: ${detail.slice(0, 500)}`)
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string }
    return { id: data.id ?? null }
  }

  return {
    send,
    transport: {
      async send(params) {
        await send(params)
      },
    },
  }
}

export type { ConsentBasis, SenderIdentity }
