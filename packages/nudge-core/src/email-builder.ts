import type { NudgeEmailConfig, NudgeEmailParams, EmailTransport } from "./types.js";

// ---------------------------------------------------------------------------
// Generic HTML email builder
// ---------------------------------------------------------------------------

const DEFAULT_BRAND_COLOR = "#2D8B57";
const DEFAULT_LOGO_CHAR = "N";
const DEFAULT_PREFS_PATH = "/settings/notifications";

/**
 * Build the HTML body for a nudge email.
 *
 * The template is intentionally simple inline-CSS — works in all email clients.
 * Brand colour, logo, and footer are configurable via `config`.
 */
export function buildNudgeEmailHtml(
  params: Omit<NudgeEmailParams, "to" | "subject">,
  config: NudgeEmailConfig,
): string {
  const brandColor = config.brandColor ?? DEFAULT_BRAND_COLOR;
  const logoChar = config.logoChar ?? DEFAULT_LOGO_CHAR;
  const prefsPath = config.prefsPath ?? DEFAULT_PREFS_PATH;
  const footerText = config.footerText ?? "";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; width: 40px; height: 40px; background: ${brandColor}; border-radius: 8px; line-height: 40px; color: white; font-weight: bold; font-size: 18px;">${logoChar}</div>
      </div>

      <p style="color: #334155; font-size: 16px; line-height: 1.6;">${params.greeting}</p>

      <div style="color: #334155; font-size: 16px; line-height: 1.6;">
        ${params.bodyHtml}
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${params.ctaUrl}" style="display: inline-block; background: ${brandColor}; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          ${params.ctaText}
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />

      <p style="color: #94a3b8; font-size: 12px; text-align: center;">
        <a href="${config.appUrl}${prefsPath}" style="color: #64748b;">Manage notification preferences</a>
        &nbsp;|&nbsp;
        <a href="${config.appUrl}${prefsPath}?unsubscribe=true" style="color: #64748b;">Unsubscribe</a>
      </p>

      ${footerText ? `<p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 16px;">${footerText}</p>` : ""}
    </div>
  `;
}

/**
 * Create a send function that wraps an EmailTransport.
 *
 * Returns an async function matching the shape expected by `CronHandlerConfig.sendEmail`.
 */
export function createEmailSender(
  transport: EmailTransport,
  fromAddress: string,
  emailConfig: NudgeEmailConfig,
): (params: NudgeEmailParams) => Promise<void> {
  return async (params: NudgeEmailParams) => {
    const html = buildNudgeEmailHtml(params, emailConfig);
    await transport.send({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      html,
    });
  };
}

/**
 * Helper: build a full URL from a base appUrl and a path.
 */
export function appUrl(base: string, path: string): string {
  return `${base}${path}`;
}
