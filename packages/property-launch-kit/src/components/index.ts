/**
 * @caistech/property-launch-kit/components
 *
 * React components for property-sale launch admin + public pages.
 * Import as:
 *   import { NotifyRecipientsCard, DesignGallery } from "@caistech/property-launch-kit/components";
 *
 * Tailwind: consumers must add the package's dist path to their
 * tailwind.config content array so the utility classes used here
 * get included in the compiled CSS:
 *
 *   content: [
 *     "./src/**\/*.{js,ts,jsx,tsx}",
 *     "./node_modules/@caistech/property-launch-kit/dist/components/**\/*.js",
 *   ]
 */

export { default as NotifyRecipientsCard } from "./NotifyRecipientsCard.js";
export { default as DesignGallery, type Design } from "./DesignGallery.js";
