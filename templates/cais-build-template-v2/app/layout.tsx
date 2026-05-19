import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Replace with product name',
  description: 'Replace with one-line product description.',
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
