# Corporate AI Solutions — Unified Styling Guide

## Brand Identity

All projects built by Corporate AI Solutions must include:
1. **CorporateHeader** — sticky header with green badge, "by Corporate AI Solutions" text
2. **CorporateFooter** — footer with contact links and branding
3. **Consistent typography and color foundations** as defined below

---

## Typography

| Element | Size | Weight | Tailwind Class |
|---------|------|--------|---------------|
| H1 | 36px (2.25rem) | Bold | `text-4xl font-bold tracking-tight` |
| H2 | 30px (1.875rem) | Semibold | `text-3xl font-semibold tracking-tight` |
| H3 | 24px (1.5rem) | Semibold | `text-2xl font-semibold` |
| H4 | 20px (1.25rem) | Semibold | `text-xl font-semibold` |
| H5 | 18px (1.125rem) | Medium | `text-lg font-medium` |
| H6 | 16px (1rem) | Medium | `text-base font-medium` |
| Body | 16px (1rem) | Normal | `text-base leading-relaxed` |
| Small/Detail | 14px (0.875rem) | Normal | `text-sm` |
| Caption | 12px (0.75rem) | Normal | `text-xs` |

**Font stack:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

For Next.js projects using `next/font`:
```tsx
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });
// Apply: <body className={inter.className}>
```

---

## Colors

### Corporate Brand (always green)
- Primary: `#22c55e` (green-500)
- Hover: `#16a34a` (green-600)
- Light accent: `#4ade80` (green-400)
- Glow/shadow: `#22c55e` at 25% opacity

### Dark Theme Palette
| Token | Hex | Usage |
|-------|-----|-------|
| dark-950 | `#020617` | Body background |
| dark-900 | `#0f172a` | Card backgrounds |
| dark-800 | `#1e293b` | Borders, secondary bg |
| dark-700 | `#334155` | Card borders |
| dark-400 | `#94a3b8` | Muted text |
| dark-300 | `#cbd5e1` | Body text |

### Light Theme Palette
Use Tailwind's built-in `slate-*` classes — they match the dark palette values.

### Project-Specific Colors
Each project may define its own accent/theme colors (e.g., MMCBuild=teal, Slyds=violet). These sit **alongside** the corporate brand colors, never replacing them. The header and footer always use corporate green.

---

## Components

### Header Usage
```tsx
import { CorporateHeader } from '@/components/corporate/CorporateHeader';
import Link from 'next/link';

<CorporateHeader
  productName="MyProduct"
  productAcronym="MP"
  navItems={[
    { href: '/', label: 'Home' },
    { href: '/features', label: 'Features' },
  ]}
  activePath={pathname}
  theme="dark"
  LinkComponent={Link}
  rightContent={<button className="btn-primary text-sm">Get Started</button>}
/>
```

### Footer Usage
```tsx
import { CorporateFooter } from '@/components/corporate/CorporateFooter';

<CorporateFooter
  productName="MyProduct"
  theme="dark"
  extraLinks={[
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
  ]}
/>
```

---

## Integration Steps (per project)

1. **Copy components** into `src/components/corporate/` (or `components/corporate/`):
   - `CorporateHeader.tsx`
   - `CorporateFooter.tsx`

2. **Update font** — ensure Inter is loaded via `next/font` or CSS import

3. **Add brand colors** to `tailwind.config` if using `corp-green` or `dark` tokens

4. **Replace/wrap existing layout** with CorporateHeader + CorporateFooter

5. **Apply typography** — use the scale above for all headings and body text

---

## Footer Contact Details

- Website: https://www.corporateaisolutions.com
- Book a call: https://www.calendly.com/mcmdennis
- Phone: +61 402 612 471
- Email: dennis@corporateaisolutions.com
