/**
 * Branded, watermarked PDF renderers (pdf-lib), extracted from the LingoPure
 * investor dataroom.
 *   - renderReportPdf: markdown → a fresh A4 PDF (report delivery).
 *   - stampPdf: overlay a confidential watermark on an EXISTING PDF (a downloaded
 *     source doc), degrade-don't-deny if it can't be loaded.
 * Watermark + footer name who a copy was prepared for + when, so every export is
 * traceable to the recipient. Brand colours/labels are injectable (defaults keep
 * the navy/gold look).
 */

import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import type { PdfBrand, PdfMeta, RgbTuple } from "./types.js";

const DEFAULT_NAVY: RgbTuple = [0.06, 0.09, 0.16];
const DEFAULT_ACCENT: RgbTuple = [0.72, 0.55, 0.2];
const DEFAULT_GREY: RgbTuple = [0.45, 0.45, 0.5];
const DEFAULT_WATERMARK = "CONFIDENTIAL";
const defaultFooter = (m: PdfMeta) => `Confidential - prepared for ${m.firm}  -  ${m.date}`;

// Keep text within Helvetica's WinAnsi range — map common smart punctuation and
// drop anything pdf-lib can't encode (rare in synthesised English reports).
function winAnsi(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[•●]/g, "-")
    .replace(/…/g, "...")
    .replace(/[→➔]/g, "->")
    .replace(/ /g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

/** Render report markdown (# title, ## heading, "- " bullets, paragraphs) to a watermarked A4 PDF. */
export async function renderReportPdf(
  markdown: string,
  meta: PdfMeta,
  brand: PdfBrand = {}
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE: [number, number] = [595.28, 841.89]; // A4
  const margin = 56;
  const contentW = PAGE[0] - margin * 2;
  const navy = rgb(...(brand.navy ?? DEFAULT_NAVY));
  const gold = rgb(...(brand.accent ?? DEFAULT_ACCENT));
  const grey = rgb(...(brand.grey ?? DEFAULT_GREY));
  const watermarkLabel = brand.watermarkLabel ?? DEFAULT_WATERMARK;
  const footer = brand.footer ?? defaultFooter;

  let page = pdf.addPage(PAGE);
  let y = PAGE[1] - margin;

  const newPage = () => {
    page = pdf.addPage(PAGE);
    y = PAGE[1] - margin;
  };
  const ensure = (h: number) => {
    if (y - h < margin + 36) newPage();
  };

  const wrap = (text: string, f: typeof font, size: number): string[] => {
    const out: string[] = [];
    for (const rawLine of winAnsi(text).split("\n")) {
      if (rawLine.trim() === "") {
        out.push("");
        continue;
      }
      const words = rawLine.split(/\s+/);
      let line = "";
      for (const w of words) {
        const trial = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(trial, size) > contentW && line) {
          out.push(line);
          line = w;
        } else {
          line = trial;
        }
      }
      if (line) out.push(line);
    }
    return out;
  };

  const draw = (text: string, f: typeof font, size: number, color = navy, after = 4) => {
    for (const line of wrap(text, f, size)) {
      if (line === "") {
        y -= size * 0.6;
        continue;
      }
      ensure(size * 1.35);
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size * 1.35;
    }
    y -= after;
  };

  for (const block of markdown.split("\n")) {
    const line = block.trimEnd();
    if (line.startsWith("# ")) {
      draw(line.slice(2), bold, 20, navy, 10);
    } else if (line.startsWith("## ")) {
      ensure(40);
      y -= 6;
      draw(line.slice(3), bold, 13, gold, 6);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      draw(`-  ${line.slice(2).replace(/\*\*/g, "")}`, font, 10.5, navy, 2);
    } else if (line.trim() === "") {
      y -= 5;
    } else {
      draw(line.replace(/\*\*/g, ""), font, 10.5, navy, 4);
    }
  }

  const stamp = winAnsi(footer(meta));
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(watermarkLabel, {
      x: 90,
      y: 360,
      size: 64,
      font: bold,
      color: rgb(0.55, 0.58, 0.66),
      rotate: degrees(45),
      opacity: 0.1,
    });
    p.drawText(stamp, { x: margin, y: 30, size: 8, font, color: grey });
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: PAGE[0] - margin - 36,
      y: 30,
      size: 8,
      font,
      color: grey,
    });
  });

  return pdf.save();
}

/**
 * Stamp an EXISTING PDF with a per-recipient confidential watermark on every page.
 * Degrade-don't-deny: if the PDF can't be loaded (encrypted/malformed), log and
 * return the original bytes rather than block access.
 */
export async function stampPdf(
  bytes: Uint8Array,
  meta: PdfMeta,
  brand: PdfBrand = {}
): Promise<Uint8Array> {
  const watermarkLabel = brand.watermarkLabel ?? DEFAULT_WATERMARK;
  const footer = brand.footer ?? defaultFooter;
  const grey = rgb(...(brand.grey ?? [0.5, 0.5, 0.55]));
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const stamp = winAnsi(footer(meta));
    for (const p of pdf.getPages()) {
      p.drawText(watermarkLabel, {
        x: 80,
        y: 320,
        size: 58,
        font: bold,
        color: rgb(0.55, 0.58, 0.66),
        rotate: degrees(45),
        opacity: 0.1,
      });
      p.drawText(stamp, { x: 36, y: 18, size: 8, font, color: grey });
    }
    return await pdf.save();
  } catch (err) {
    console.warn(
      `[dataroom-core] could not stamp PDF, serving original: ${err instanceof Error ? err.message : err}`
    );
    return bytes;
  }
}
