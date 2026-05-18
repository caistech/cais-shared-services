import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAIS Interview",
  description: "Tell us what you're building so we can route you to the right next step.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
