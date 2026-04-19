import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { RenderOptions, RenderResult, ReportBrand, ReportFooter, ReportHeader, ReportMetadata } from "./types";
import { ReportDocument } from "./components/ReportDocument";

const DEFAULT_MAX_BODY_CHARS = 200_000;

function validateBrand(brand: ReportBrand): void {
  if (!brand.productName) throw new Error("brand.productName is required");
  if (!brand.primaryColor) throw new Error("brand.primaryColor is required");
  if (!brand.accentColor) throw new Error("brand.accentColor is required");
}

function validateHeader(header: ReportHeader): void {
  if (!header.title) throw new Error("header.title is required");
}

function validateFooter(footer: ReportFooter): void {
  if (!footer.disclaimer) throw new Error("footer.disclaimer is required");
}

function validateMetadata(metadata: ReportMetadata): void {
  if (!metadata.author) throw new Error("metadata.author is required");
  if (!metadata.subject) throw new Error("metadata.subject is required");
}

export async function renderPdf(opts: RenderOptions): Promise<RenderResult> {
  validateBrand(opts.brand);
  validateHeader(opts.header);
  validateFooter(opts.footer);
  validateMetadata(opts.metadata);

  const limit = opts.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;
  const truncated = opts.markdown.length > limit;
  const bodyMarkdown = truncated ? opts.markdown.slice(0, limit) : opts.markdown;

  const element = React.createElement(ReportDocument, { ...opts, bodyMarkdown }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return {
    buffer,
    truncated,
    pageCount: countPages(buffer),
  };
}

function countPages(buffer: Buffer): number {
  const s = buffer.toString("latin1");
  const matches = s.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}
