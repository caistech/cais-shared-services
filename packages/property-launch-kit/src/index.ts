/**
 * @caistech/property-launch-kit
 *
 * Shared primitives for property-sale launch products. Used by
 * f2k-projects (Seafields, Branscombe, Hemp Homes) and any future
 * property estate built on the same conventions:
 *   - {product}_notify_recipients table for editable admin email lists
 *   - F2K-branded HTML email shell for admin notifications
 *   - Daily-digest cron route shape
 *
 * Subpath exports:
 *   /                    branded-email + notify-recipients + daily-digest
 *   /components          React UI (NotifyRecipientsCard, DesignGallery)
 *
 * Tailwind requirement for /components: add the package dist path
 * to your tailwind.config content array (see components/index.ts).
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

export {
  createDailyDigestHandler,
  NOTIFY_RECIPIENTS_MIGRATION_TEMPLATE,
  type DailyDigestCounts,
  type CreateDailyDigestHandlerOptions,
} from "./daily-digest.js";
