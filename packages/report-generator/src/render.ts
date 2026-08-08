import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { RenderOptions, RenderResult, ReportBrand, ReportFooter, ReportHeader, ReportMetadata } from "./types";
import { ReportDocument } from "./components/ReportDocument.js";

const DEFAULT_MAX_BODY_CHARS = 200_000;

/**
 * Every validator below reads fields off its argument, so a missing SECTION
 * threw a bare `TypeError: Cannot read properties of undefined` from inside the
 * library — while a missing FIELD on a present section threw a clear
 * "x.y is required". The caller who omitted the whole thing got the worse
 * message of the two, which is backwards: they made the larger mistake and were
 * told less about it.
 *
 * TypeScript callers never saw this — all four sections are required in
 * `RenderOptions` — so it only ever surfaced for JavaScript callers, which is
 * why it survived. Fixed as a class rather than for the one section that
 * happened to be hit.
 */
function requireSection<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null) throw new Error(`${name} is required`);
  if (typeof value !== "object") throw new Error(`${name} must be an object`);
  return value;
}

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
  requireSection(opts, "options");
  // Presence, not truthiness: an empty body is a legitimate document, and
  // rejecting "" here would turn a working call into an error.
  if (typeof opts.markdown !== "string") throw new Error("markdown is required");

  validateBrand(requireSection(opts.brand, "brand"));
  validateHeader(requireSection(opts.header, "header"));
  validateFooter(requireSection(opts.footer, "footer"));
  validateMetadata(requireSection(opts.metadata, "metadata"));

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
