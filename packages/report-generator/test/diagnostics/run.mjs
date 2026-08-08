/**
 * Linux diagnosis for the `bad XRef entry` defect.
 *
 * THE QUESTION THIS ANSWERS. The recorded diagnosis is "the artifact is corrupt
 * on Linux — producing valid PDFs is this package's entire job and it does not
 * do it." That may be backwards, and every check written so far was incapable of
 * telling: they all went through pdf-parse, so a broken PARSER and a broken
 * ARTIFACT produce the identical red.
 *
 * Three sections, in the order that narrows it:
 *
 *   1. STRUCTURAL SWEEP  — validate Linux-generated PDFs against the invariant
 *      pdf.js enforces, WITHOUT pdf-parse. If these are clean, the artifact is
 *      fine and the parser is the problem.
 *   2. CROSS-PARSE       — run Linux pdf-parse against a committed
 *      WINDOWS-generated PDF. This is the decisive one. Windows pdf-parse
 *      accepts that exact file; if Linux pdf-parse rejects the same bytes, the
 *      artifact is provably innocent, because the bytes never changed.
 *   3. SELF-PARSE        — Linux pdf-parse against a Linux-generated PDF, i.e.
 *      the original failing condition, for the record.
 *
 * Always exits 0. This is a diagnostic that reports, not a gate that blocks.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { validate, brand, header, metadata, footer, body } from "./xref.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, "..", "..");
const require = createRequire(import.meta.url);

console.log(`platform=${process.platform} arch=${process.arch} node=${process.version} cpus=${os.cpus().length}`);
try {
  console.log(`@react-pdf/renderer=${require("@react-pdf/renderer/package.json").version} pdf-parse=${require("pdf-parse/package.json").version}`);
} catch (e) {
  console.log(`version probe failed: ${e.message}`);
}

// The import itself is a result: extensionless relative specifiers in an ESM
// package make dist/ unimportable from plain Node, which is the other defect
// this branch fixes. If this throws, that regressed.
const { renderPdf } = await import(pathToFileURL(path.join(pkgDir, "dist", "render.js")).href);

const outDir = process.env.RUNNER_TEMP || os.tmpdir();
let linuxPdf = null;

/* ------------------------------------------------------------------ 1 */
console.log("\n########## 1. STRUCTURAL SWEEP (no pdf-parse involved) ##########");
console.log("variant                size  pages  bytes    checked  bad  verdict");
let structuralFailures = 0;
const variants = [
  { name: "pageNums+watermark", footer: { ...footer } },
  { name: "pageNums-only", footer: { disclaimer: footer.disclaimer, pageNumbers: true } },
  { name: "no-pageNums", footer: { disclaimer: footer.disclaimer, pageNumbers: false } },
];
for (const v of variants) {
  for (const size of [0, 1, 2, 4, 6, 8, 10, 14, 18, 22, 26, 30, 36, 42, 48, 54, 60, 70, 80]) {
    try {
      const result = await renderPdf({ markdown: body(size), brand, header, metadata, footer: v.footer });
      const r = validate(result.buffer);
      const bad = r.bad.length;
      if (bad > 0 || r.notes.length) structuralFailures++;
      const verdict = r.notes.length ? `NOTE:${r.notes[0]}` : bad ? "BAD_XREF" : "ok";
      console.log(
        `${v.name.padEnd(21)} ${String(size).padStart(4)} ${String(result.pageCount).padStart(6)} ${String(r.bytes).padStart(8)} ${String(r.checked).padStart(8)} ${String(bad).padStart(4)}  ${verdict}`,
      );
      if (bad > 0) {
        console.log("   first bad entries:", JSON.stringify(r.bad.slice(0, 3)));
        fs.writeFileSync(path.join(outDir, `bad-${v.name}-${size}.pdf`), result.buffer);
      }
      if (v.name === "pageNums+watermark" && size === 30) {
        linuxPdf = path.join(outDir, "linux.pdf");
        fs.writeFileSync(linuxPdf, result.buffer);
      }
    } catch (e) {
      structuralFailures++;
      console.log(`${v.name.padEnd(21)} ${String(size).padStart(4)}  RENDER THREW: ${e.message}`);
    }
  }
}
console.log(structuralFailures ? `\nSTRUCTURAL FAILURES: ${structuralFailures}` : "\nSTRUCTURAL: ALL CLEAN — Linux xref offsets are valid");

/* ------------------------------------------------------------------ 2/3 */
let pdfParse = null;
try {
  pdfParse = require("pdf-parse");
} catch (e) {
  console.log(`\npdf-parse unavailable: ${e.message}`);
}

async function tryParse(label, file) {
  if (!pdfParse || !file || !fs.existsSync(file)) {
    console.log(`${label}: SKIPPED (missing ${file || "pdf-parse"})`);
    return;
  }
  const buf = fs.readFileSync(file);
  const structural = validate(buf);
  console.log(`${label}: ${buf.length} bytes, sha256=${(await import("node:crypto")).createHash("sha256").update(buf).digest("hex").slice(0, 16)}`);
  console.log(`  structural: checked=${structural.checked} bad=${structural.bad.length} notes=${JSON.stringify(structural.notes)}`);
  try {
    const parsed = await pdfParse(buf);
    console.log(`  pdf-parse: OK — ${parsed.numpages} pages, ${parsed.text.length} chars of text`);
  } catch (e) {
    console.log(`  pdf-parse: THREW — ${e.name}: ${e.message}`);
  }
}

console.log("\n########## 2. CROSS-PARSE — Linux pdf-parse vs a WINDOWS-generated PDF ##########");
console.log("Windows pdf-parse accepts this exact file. Same bytes here.");
console.log("A throw means the parser is at fault, because the artifact did not change.\n");
await tryParse("windows-fixture", path.join(here, "fixtures", "windows-generated.pdf"));

console.log("\n########## 3. SELF-PARSE — Linux pdf-parse vs a LINUX-generated PDF ##########");
await tryParse("linux-generated", linuxPdf);

console.log("\n########## READING THIS ##########");
console.log("1 clean + 2 throws  -> artifact innocent, pdf-parse is the defect (un-skip the suite, replace the parser)");
console.log("1 clean + 2 ok + 3 throws -> Linux artifact differs in a way the sweep does not cover; compare against the fixture");
console.log("1 dirty             -> artifact genuinely corrupt on Linux; the recorded diagnosis stands");
