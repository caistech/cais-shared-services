import { describe, it, expect } from "vitest";
// @ts-expect-error pdf-parse ships CJS without types
import pdfParse from "pdf-parse";
import { renderPdf } from "../src/render";
import type { RenderOptions } from "../src/types";

const baseOpts = (overrides: Partial<RenderOptions> = {}): RenderOptions => ({
  markdown: "# Heading\n\nThis is a paragraph of body text.",
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
    recipient: "sarah@familyoffice.com.au",
  },
  ...overrides,
});

describe("renderPdf — end-to-end", () => {
  it("renders markdown into a parseable PDF with all key content present", async () => {
    const opts = baseOpts({
      markdown: [
        "# Executive Summary",
        "",
        "GREH Fund 1 targets **$100M** raise across Australian housing.",
        "",
        "## Key Figures",
        "",
        "- Target IRR: 18–25%",
        "- Token: F2K-GEH (ERC-3643)",
        "- Structure: Wholesale MIS",
      ].join("\n"),
    });

    const result = await renderPdf(opts);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(1000);

    const parsed = await pdfParse(result.buffer);
    // H1/H2 render uppercase with letterspacing, so pdf-parse extracts with spaces between letters
    expect(parsed.text).toMatch(/E\s*X\s*E\s*C\s*U\s*T\s*I\s*V\s*E\s*S\s*U\s*M\s*M\s*A\s*R\s*Y/i);
    expect(parsed.text).toContain("$100M");
    expect(parsed.text).toContain("F2K-GEH");
    expect(parsed.text).toContain("18");
    expect(result.truncated).toBe(false);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
  });
});

describe("renderPdf — brand", () => {
  it("uses brand product name in the header band", async () => {
    const parsed = await pdfParse(
      (await renderPdf(baseOpts({ brand: { productName: "AcmeFund", primaryColor: "#000066", accentColor: "#FF0066" } })))
        .buffer,
    );
    // productName renders uppercase + letterspacing, pdf-parse extracts with spaces between letters
    expect(parsed.text).toMatch(/A\s*C\s*M\s*E\s*F\s*U\s*N\s*D/i);
  });

  it("requires productName, primaryColor, accentColor", async () => {
    await expect(
      renderPdf(baseOpts({ brand: { productName: "", primaryColor: "#000", accentColor: "#fff" } })),
    ).rejects.toThrow(/productName is required/);
  });

  it("populates PDF metadata (title, author, subject, creator)", async () => {
    const result = await renderPdf(baseOpts());
    const parsed = await pdfParse(result.buffer);
    expect(parsed.info.Author).toBe("F2K Fund Tokenisation");
    expect(parsed.info.Subject).toBe("investor_deep_dive");
    expect(parsed.info.Creator).toBe("@caistech/report-generator");
  });
});

describe("renderPdf — watermark", () => {
  it("includes watermark text in rendered PDF when provided", async () => {
    const result = await renderPdf(baseOpts());
    const parsed = await pdfParse(result.buffer);
    expect(parsed.text).toContain("PRE-AFSL");
  });

  it("omits watermark when footer.watermark is undefined", async () => {
    const result = await renderPdf(
      baseOpts({
        footer: {
          disclaimer: "F2K · Wholesale Only",
          pageNumbers: true,
        },
      }),
    );
    const parsed = await pdfParse(result.buffer);
    expect(parsed.text).not.toContain("PRE-AFSL");
  });
});

describe("renderPdf — disclaimer on every page footer", () => {
  it("repeats the disclaimer on every page of a multi-page document", async () => {
    // Build a long markdown body that forces multiple pages
    const longBody = Array.from({ length: 60 }, (_, i) => `## Section ${i + 1}\n\n${"Body paragraph. ".repeat(30)}`).join(
      "\n\n",
    );
    const result = await renderPdf(baseOpts({ markdown: longBody }));
    const parsed = await pdfParse(result.buffer);

    expect(result.pageCount).toBeGreaterThanOrEqual(2);

    // The disclaimer text should appear at least once per page
    const disclaimerCount = (
      parsed.text.match(/Wholesale Investors Only/g) || []
    ).length;
    expect(disclaimerCount).toBeGreaterThanOrEqual(result.pageCount);
  });
});

describe("renderPdf — page numbers", () => {
  it("renders page numbers in format 'Page X of Y' when enabled", async () => {
    const longBody = Array.from({ length: 20 }, (_, i) => `## Section ${i + 1}\n\n${"Body paragraph. ".repeat(20)}`).join(
      "\n\n",
    );
    const result = await renderPdf(baseOpts({ markdown: longBody }));
    const parsed = await pdfParse(result.buffer);

    expect(parsed.text).toMatch(/Page\s+\d+\s+of\s+\d+/);
  });

  it("omits page numbers when disabled", async () => {
    const result = await renderPdf(
      baseOpts({
        footer: {
          disclaimer: "F2K · Wholesale Only",
          pageNumbers: false,
        },
      }),
    );
    const parsed = await pdfParse(result.buffer);
    expect(parsed.text).not.toMatch(/Page\s+\d+\s+of\s+\d+/);
  });
});

describe("renderPdf — oversize guard", () => {
  it("truncates markdown beyond maxBodyChars and flags truncated", async () => {
    const huge = "x".repeat(1500);
    const result = await renderPdf(baseOpts({ markdown: huge, maxBodyChars: 500 }));
    expect(result.truncated).toBe(true);
  });

  it("does not flag truncated when markdown fits", async () => {
    const result = await renderPdf(baseOpts({ markdown: "# ok\n\nshort", maxBodyChars: 10_000 }));
    expect(result.truncated).toBe(false);
  });
});
