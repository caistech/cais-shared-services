import type { Config } from 'tailwindcss';
import brand from '@caistech/corporate-components/tailwind-brand-colors';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@caistech/corporate-components/dist/**/*.{js,mjs}',
  ],
  theme: {
    extend: {
      colors: brand,
    },
  },
  plugins: [],
};

export default config;
