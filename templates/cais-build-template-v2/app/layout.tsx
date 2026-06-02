import type { Metadata } from 'next';
import './globals.css';

// Base URL for absolute OG/Twitter image + canonical URLs. Set NEXT_PUBLIC_SITE_URL per product
// (e.g. https://my-product.vercel.app). Falls back to '/' so the build never breaks if unset.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || undefined;

export const metadata: Metadata = {
  // Replace title/description per product (or wire to NEXT_PUBLIC_VENDOR_* if you prefer env-driven).
  title: 'Replace with product name',
  description: 'Replace with one-line product description.',
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  openGraph: {
    title: 'Replace with product name',
    description: 'Replace with one-line product description.',
    type: 'website',
    ...(SITE_URL ? { url: SITE_URL } : {}),
    // og-image.png MUST exist in /public (1200x630 recommended). Ships in the template so the
    // Metadata compliance check passes on first survey — replace the art per product.
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Replace with product name',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Replace with product name',
    description: 'Replace with one-line product description.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}