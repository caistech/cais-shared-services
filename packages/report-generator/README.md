# @caistech/report-generator

Markdown → branded PDF renderer for factory products. Brand, disclaimer, watermark, and page numbers are first-class.

## Install

```bash
npm install @caistech/report-generator --legacy-peer-deps
```

Requires `react >= 18` in the consumer.

## Usage

```ts
import { renderPdf } from "@caistech/report-generator";

const result = await renderPdf({
  markdown: "# Executive Summary\n\nBody text.",
  brand: {
    productName: "F2K Fund Tokenisation",
    primaryColor: "#1A2744",
    accentColor: "#22C55E",
  },
  header: {
    title: "GREH Fund 1 — Investor Deep-Dive",
    subtitle: "Wholesale investor report",
    preparedFor: "Sarah Chen, Family Office Partners Pty Ltd",
    dateLine: "20 April 2026",
  },
  footer: {
    disclaimer: "F2K Fund Tokenisation · Wholesale Investors Only",
    watermark: "PRE-AFSL — WHOLESALE INVESTORS ONLY",
    pageNumbers: true,
  },
  metadata: {
    author: "F2K Fund Tokenisation",
    subject: "investor_deep_dive",
  },
});

// result.buffer is a PDF Buffer ready to upload or stream
// result.truncated is true if markdown exceeded maxBodyChars
// result.pageCount is total pages rendered
```

## Design decisions

- Typography carries the hierarchy. No card chrome, no rounded pills, no decorative blobs.
- Watermark is a fixed diagonal rendered on every page at the brand's primary color at ~8% opacity.
- Footer runs on every page with the disclaimer left-aligned and "Page X of Y" right-aligned.
- Default page size is A4 portrait with generous margins (56pt horizontal, 56/64 vertical).

## Next.js serverless note

`@react-pdf/renderer` works in Node runtime. If you use it on Vercel, set:

```ts
export const runtime = "nodejs";
export const maxDuration = 60;
```

In the consumer's `next.config.js`, transpile this package:

```js
module.exports = {
  transpilePackages: ["@caistech/report-generator"],
};
```

## Test

```bash
npm test
```

Six acceptance tests cover end-to-end render, brand override + metadata, watermark toggle, disclaimer-on-every-page, page number format, and oversize guard.
