import { describe, it, expect } from "vitest";
import { getDocumentProxy, extractText, getMeta } from "unpdf";
import { renderPdf } from "../src/render";
import type { RenderOptions } from "../src/types";

/**
 * Parse a rendered PDF the way the rest of the portfolio does.
 *
 * Shaped to return the same three things the suite used to read off pdf-parse
 * (`text`, `numpages`, `info`) so the assertions below are unchanged — the
 * parser was the defect, not what the tests were checking.
 */
async function parsePdf(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const [{ totalPages, text }, meta] = await Promise.all([
    extractText(pdf, { mergePages: true }),
    getMeta(pdf),
  ]);
  return { text, numpages: totalPages, info: meta.info as Record<string, unknown> };
}

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

/**
 * RESOLVED 2026-08-09. This suite used to be skipped in CI, on the conclusion
 * that `renderToBuffer` produced a CORRUPT PDF on Linux — "producing valid PDFs
 * is this package's entire job, and it does not do it on Linux."
 *
 * That was backwards. The renderer was never at fault. `pdf-parse@1.1.4` bundles
 * pdf.js **v1.10.100, from 2018**, and it rejects structurally-valid PDFs.
 *
 * The reason it took a while is worth keeping. Every check behind the original
 * diagnosis ran THROUGH pdf-parse, and a broken parser and a broken artifact
 * come back red identically — so no amount of that evidence could separate them.
 * Two checks that did not go through it settled it in one run:
 *
 *   1. A STRUCTURAL sweep, asserting the invariant pdf.js itself enforces (every
 *      in-use xref offset points at "<num> <gen> obj"). 57/57 documents valid on
 *      Linux, across three footer variants and nineteen sizes — and byte-for-byte
 *      the same sizes as Windows. Linux and Windows emit identical output.
 *   2. A CROSS-PARSE: Linux pdf-parse against a WINDOWS-generated PDF. Same
 *      bytes (sha256 a60310bf8289158…), Windows accepts, Linux threw
 *      `bad XRef entry`. Identical bytes cannot be corrupt on one OS, so the
 *      artifact was provably innocent and the parser was indicted.
 *
 * The same file parses cleanly under unpdf, which is what this suite now uses —
 * already the portfolio's parser (DealFindrs), so this is convergence, not a new
 * dependency. pdf-parse is gone.
 *
 * Also ruled out along the way, so nobody re-treads them: concurrency (260
 * renders up to 32-way parallel, byte-identical every time — the original note
 * ruled out a race inside one call, never between calls) and a platform newline
 * (an xref entry must be exactly 20 bytes, but _write appends a hardcoded '\n'
 * and there is no os.EOL anywhere in @react-pdf).
 *
 * The "Node 20 -> 24 made it worse" datum was not signal. It was a different
 * draw from an old parser that fails inconsistently.
 *
 * The diagnostic that produced all this is in test/diagnostics/ with its
 * fixture. Keep it: it is what makes this conclusion checkable rather than a
 * story, and it is cheap to re-run if the symptom ever returns.
 */
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

    const parsed = await parsePdf(result.buffer);
    // H1/H2 render uppercase with letterspacing, so the parser extracts with spaces between letters
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
    const parsed = await parsePdf(
      (await renderPdf(baseOpts({ brand: { productName: "AcmeFund", primaryColor: "#000066", accentColor: "#FF0066" } })))
        .buffer,
    );
    // productName renders uppercase + letterspacing, the parser extracts with spaces between letters
    expect(parsed.text).toMatch(/A\s*C\s*M\s*E\s*F\s*U\s*N\s*D/i);
  });

  it("requires productName, primaryColor, accentColor", async () => {
    await expect(
      renderPdf(baseOpts({ brand: { productName: "", primaryColor: "#000", accentColor: "#fff" } })),
    ).rejects.toThrow(/productName is required/);
  });

  it("populates PDF metadata (title, author, subject, creator)", async () => {
    const result = await renderPdf(baseOpts());
    const parsed = await parsePdf(result.buffer);
    expect(parsed.info.Author).toBe("F2K Fund Tokenisation");
    expect(parsed.info.Subject).toBe("investor_deep_dive");
    expect(parsed.info.Creator).toBe("@caistech/report-generator");
  });
});

describe("renderPdf — watermark", () => {
  it("includes watermark text in rendered PDF when provided", async () => {
    const result = await renderPdf(baseOpts());
    const parsed = await parsePdf(result.buffer);
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
    const parsed = await parsePdf(result.buffer);
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
    const parsed = await parsePdf(result.buffer);

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
    const parsed = await parsePdf(result.buffer);

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
    const parsed = await parsePdf(result.buffer);
    expect(parsed.text).not.toMatch(/Page\s+\d+\s+of\s+\d+/);
  });
});

describe("renderPdf — missing sections name themselves", () => {
  /**
   * These paths are unreachable from TypeScript (every section is required in
   * RenderOptions), so they are cast — which is exactly the point: they are the
   * JAVASCRIPT caller's experience, and that caller used to get a bare
   * `TypeError: Cannot read properties of undefined (reading 'author')` thrown
   * from inside the library. Found by omitting `metadata` while verifying the
   * published 0.1.2 package, and fixed for every section rather than the one
   * that happened to be hit.
   */
  const omitting = (key: keyof RenderOptions) => {
    const opts = { ...baseOpts() } as Record<string, unknown>;
    delete opts[key];
    return opts as unknown as RenderOptions;
  };

  it.each(["brand", "header", "footer", "metadata"] as const)(
    "names %s when it is missing entirely",
    async (section) => {
      await expect(renderPdf(omitting(section))).rejects.toThrow(`${section} is required`);
    },
  );

  it("names markdown when it is missing", async () => {
    await expect(renderPdf(omitting("markdown"))).rejects.toThrow("markdown is required");
  });

  it("rejects a missing options object without a TypeError", async () => {
    await expect(renderPdf(undefined as unknown as RenderOptions)).rejects.toThrow("options is required");
  });

  it("still accepts an empty markdown body — absence is the error, not emptiness", async () => {
    const result = await renderPdf(baseOpts({ markdown: "" }));
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("still names the FIELD when the section is present but incomplete", async () => {
    await expect(
      renderPdf(baseOpts({ metadata: { author: "", subject: "x" } })),
    ).rejects.toThrow("metadata.author is required");
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
