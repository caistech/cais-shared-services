/**
 * Corporate AI Solutions — Brand Color Palette
 *
 * Merge into your tailwind.config.js theme.extend.colors:
 *
 *   const { brandColors } = require('../packages/corporate-ai-common/tailwind-brand-colors');
 *   // or copy the object directly
 *
 *   module.exports = {
 *     theme: {
 *       extend: {
 *         colors: {
 *           ...brandColors,
 *           // your project-specific colors here
 *         }
 *       }
 *     }
 *   }
 */

const brandColors = {
  // Corporate AI Solutions green — used for header badge, footer accent, CTAs
  'corp-green': {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',  // Primary brand
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  // Dark palette for consistent dark themes
  dark: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
};

module.exports = { brandColors };
