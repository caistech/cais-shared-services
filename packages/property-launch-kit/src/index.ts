/**
 * @caistech/property-launch-kit
 *
 * Shared primitives for property-sale launch products. Used by
 * f2k-projects (Seafields, Branscombe) and any future property estate
 * built on the same conventions:
 *   - {product}_notify_recipients table for editable admin email lists
 *   - F2K-branded HTML email shell for admin notifications
 *
 * Consume from a product:
 *
 *   import {
 *     renderBrandedEmail,
 *     getActiveRecipients,
 *     type Branding,
 *   } from "@caistech/property-launch-kit";
 *
 *   const branding: Branding = {
 *     productName: "Seafields Estate",
 *     adminUrl: "https://f2k-projects.vercel.app/admin/seafields-registrations",
 *   };
 *
 *   const recipients = await getActiveRecipients({
 *     supabase: createSupabaseService(),
 *     table: "seafields_notify_recipients",
 *     fallback: ["dennis@factory2key.com.au"],
 *   });
 *
 *   const html = renderBrandedEmail(
 *     { preheader, heading, rows, ... },
 *     branding,
 *   );
 */

export {
  renderBrandedEmail,
  escapeHtml,
  formatCurrency,
  type Branding,
  type RenderArgs,
} from "./branded-email.js";

export {
  getActiveRecipients,
  type GetActiveRecipientsOptions,
} from "./notify-recipients.js";
