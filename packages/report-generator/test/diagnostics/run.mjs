/**
 * Is a `bad XRef entry`-style failure the RENDERER or the PARSER?
 *
 * Written to settle exactly that question once, and kept to settle it again
 * cheaply. The recorded diagnosis in 2026-08 was "the artifact is corrupt on
 * Linux — producing valid PDFs is this package's entire job and it does not do
 * it", and it was backwards. Every check behind it went through pdf-parse, and
 * a broken PARSER and a broken ARTIFACT produce the identical red, so none of
 * that evidence could ever have separated them.
 *
 * Three sections, in the order that narrows it:
 *
 *   1. STRUCTURAL SWEEP  — validate locally-generated PDFs against the
 *      invariant pdf.js enforces, through NO parser at all. Clean here means
 *      the renderer is fine and any red is the parser's.
 *   2. CROSS-PARSE       — parse a committed WINDOWS-generated PDF. This is the
 *      decisive one, because the bytes are fixed and travel unchanged: a throw
 *      on a file another platform accepts cannot be the artifact's fault.
 *   3. SELF-PARSE        — parse a locally-generated PDF, i.e. the original
 *      failing condition, for the record.
 *
 * How it came out (2026-08-09, ubuntu-latest / Node 24): section 1 clean 57/57
 * with byte-for-byte the same sizes as Windows, and section 2 threw `bad XRef
 * entry` under pdf-parse on bytes Windows pdf-parse accepts. pdf-parse@1.1.4
 * bundles pdf.js v1.10.100 (2018); it was replaced with unpdf.
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
// A package with an `exports` map need not expose ./package.json — unpdf does
// not — so a failed version read is NOT evidence of absence, and reporting it as
// "absent" next to a line where that same package parses a PDF is how a
// diagnostic sends the next reader somewhere wrong. Resolution is what settles
// presence; the version is a nice-to-have on top of it.
const ver = (name) => {
  let version = null;
  try {
    version = require(`${name}/package.json`).version;
  } catch { /* exports map may withhold it */ }
  if (version) return version;
  try {
    import.meta.resolve(name);
    return "present (version not exposed)";
  } catch {
    return "absent";
  }
};
console.log(`@react-pdf/renderer=${ver("@react-pdf/renderer")} unpdf=${ver("unpdf")} pdf-parse=${ver("pdf-parse")}`);

// The import itself is a result: extensionless relative specifiers in an ESM
// package make dist/ unimportable from plain Node, which is the other defect
// this branch fixes. If this throws, that regressed.
const { renderPdf } = await import(pathToFileURL(path.join(pkgDir, "dist", "render.js")).href);

const outDir = process.env.RUNNER_TEMP || os.tmpdir();
let localPdf = null;

/* ------------------------------------------------------------------ 1 */
console.log("\n########## 1. STRUCTURAL SWEEP (no parser involved) ##########");
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
        localPdf = path.join(outDir, "local.pdf");
        fs.writeFileSync(localPdf, result.buffer);
      }
    } catch (e) {
      structuralFailures++;
      console.log(`${v.name.padEnd(21)} ${String(size).padStart(4)}  RENDER THREW: ${e.message}`);
    }
  }
}
console.log(structuralFailures ? `\nSTRUCTURAL FAILURES: ${structuralFailures}` : "\nSTRUCTURAL: ALL CLEAN — xref offsets are valid");

/* ------------------------------------------------------------------ 2/3 */
// unpdf is the parser the suite now uses. pdf-parse is OPTIONAL and no longer a
// dependency — it is the one that was found defective. If someone reinstalls it
// to reproduce the original finding, this reports both side by side.
const { getDocumentProxy, extractText } = await import("unpdf");
let pdfParse = null;
try {
  pdfParse = require("pdf-parse");
} catch {
  console.log("\n(pdf-parse not installed — it was removed as the defect. unpdf only.)");
}

async function tryParse(label, file) {
  if (!file || !fs.existsSync(file)) {
    console.log(`${label}: SKIPPED (missing ${file})`);
    return;
  }
  const buf = fs.readFileSync(file);
  const structural = validate(buf);
  console.log(`${label}: ${buf.length} bytes, sha256=${(await import("node:crypto")).createHash("sha256").update(buf).digest("hex").slice(0, 16)}`);
  console.log(`  structural: checked=${structural.checked} bad=${structural.bad.length} notes=${JSON.stringify(structural.notes)}`);
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const parsed = await extractText(pdf, { mergePages: true });
    console.log(`  unpdf: OK — ${parsed.totalPages} pages, ${parsed.text.length} chars of text`);
  } catch (e) {
    console.log(`  unpdf: THREW — ${e.name}: ${e.message}`);
  }
  if (pdfParse) {
    try {
      const parsed = await pdfParse(buf);
      console.log(`  pdf-parse: OK — ${parsed.numpages} pages, ${parsed.text.length} chars of text`);
    } catch (e) {
      console.log(`  pdf-parse: THREW — ${e.name}: ${e.message}`);
    }
  }
}

console.log("\n########## 2. CROSS-PARSE — parse a WINDOWS-generated PDF here ##########");
console.log("This exact file, byte for byte, on whatever platform this run is.");
console.log("A throw here indicts the PARSER, not the renderer: the bytes did not change.\n");
await tryParse("windows-fixture", path.join(here, "fixtures", "windows-generated.pdf"));

console.log("\n########## 3. SELF-PARSE — parse a locally-generated PDF ##########");
await tryParse("locally-generated", localPdf);

console.log("\n########## WHAT THIS ESTABLISHED (2026-08-09) ##########");
console.log("Section 1 came back clean on Linux, with byte-for-byte the same sizes as Windows.");
console.log("Section 2 threw `bad XRef entry` under pdf-parse on a WINDOWS-generated file that");
console.log("Windows pdf-parse accepts — identical bytes, so the artifact could not be the fault.");
console.log("pdf-parse@1.1.4 bundles pdf.js v1.10.100 (2018). It was replaced with unpdf and the");
console.log("suite un-skipped. Section 1 dirtying again would be a REAL renderer regression.");
