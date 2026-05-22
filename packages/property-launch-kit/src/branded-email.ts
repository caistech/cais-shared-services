/**
 * Generic branded admin-email renderer for property launch products.
 *
 * Originally extracted from f2k-projects lib/seafields/notify.ts +
 * lib/branscombe/notify.ts where the same render logic was duplicated
 * with only product name / admin URL differences.
 */

export interface Branding {
  /** Product display name shown in the email header (e.g. "Seafields Estate"). */
  productName: string;
  /** URL the "Open admin" CTA + footer link point at. */
  adminUrl: string;
  /** Tag line under the productName in the email header. Defaults to "Admin". */
  badge?: string;
  /** Optional brand palette overrides. Falls back to F2K's deep-blue + teal. */
  palette?: Partial<Palette>;
}

interface Palette {
  primary: string;
  accent: string;
  ink: string;
  muted: string;
  surface: string;
}

const DEFAULT_PALETTE: Palette = {
  primary: "#1A2744",
  accent: "#00B5AD",
  ink: "#0F172A",
  muted: "#64748B",
  surface: "#F8FAFC",
};

export interface RenderArgs {
  preheader: string;
  heading: string;
  intro?: string;
  rows: Array<{ label: string; value: string }>;
  footer?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

/**
 * Renders a branded admin notification email body. Returns the full
 * `<!doctype html>...</html>` string ready to pass to
 * `resend.emails.send()` (or any other transport).
 */
export function renderBrandedEmail(
  args: RenderArgs,
  branding: Branding,
): string {
  const palette = { ...DEFAULT_PALETTE, ...(branding.palette ?? {}) };
  const { primary, accent, ink, muted, surface } = palette;
  const { productName, adminUrl, badge = "Admin" } = branding;

  const safeRows = args.rows
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 16px;color:${muted};font-size:12px;width:160px;vertical-align:top;font-family:Arial,sans-serif">${escapeHtml(r.label)}</td>
        <td style="padding:6px 16px;color:${ink};font-size:14px;vertical-align:top;font-family:Arial,sans-serif">${r.value}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${surface};font-family:Arial,sans-serif;color:${ink}">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent">${escapeHtml(args.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${surface};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:6px;overflow:hidden">
        <tr>
          <td style="background:${primary};color:#FFFFFF;padding:18px 24px;font-family:Arial,sans-serif">
            <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#94A3B8">${escapeHtml(productName)} · ${escapeHtml(badge)}</div>
            <div style="font-size:20px;font-weight:700;margin-top:4px;color:#FFFFFF">${escapeHtml(args.heading)}</div>
          </td>
        </tr>
        ${
          args.intro
            ? `<tr><td style="padding:18px 24px 0;font-size:14px;color:${ink};line-height:1.5;font-family:Arial,sans-serif">${args.intro}</td></tr>`
            : ""
        }
        <tr><td style="padding:14px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${safeRows}</table>
        </td></tr>
        ${
          args.ctaLabel && args.ctaHref
            ? `<tr><td align="left" style="padding:8px 24px 24px"><a href="${args.ctaHref}" style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:4px;font-size:14px;font-family:Arial,sans-serif">${escapeHtml(args.ctaLabel)}</a></td></tr>`
            : ""
        }
        ${
          args.footer
            ? `<tr><td style="padding:16px 24px;border-top:1px solid #E2E8F0;font-size:12px;color:${muted};line-height:1.5;font-family:Arial,sans-serif">${args.footer}</td></tr>`
            : ""
        }
      </table>
      <div style="margin-top:14px;color:${muted};font-size:11px;font-family:Arial,sans-serif">
        You receive these because you are on the ${escapeHtml(productName)} notification list. Manage at
        <a href="${adminUrl}" style="color:${muted}">${adminUrl}</a>.
      </div>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}
