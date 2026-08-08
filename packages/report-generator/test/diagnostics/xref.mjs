/**
 * The xref invariant pdf.js enforces in fetchUncompressed(): every in-use xref
 * offset must point at "<num> <gen> obj". Failing it is what raises
 * "bad XRef entry" — meaning the offsets drifted, NOT that the table is merely
 * syntactically odd.
 *
 * This is deliberately independent of pdf-parse. The open question about this
 * package is whether the Linux artifact is genuinely corrupt or whether
 * pdf-parse (which bundles a 2018 build of pdf.js) is what fails — and a check
 * written on top of pdf-parse could never tell those apart.
 */
export function validate(buf) {
  const s = buf.toString("latin1");
  const res = { bytes: buf.length, bad: [], checked: 0, notes: [] };

  const sxIdx = s.lastIndexOf("startxref");
  if (sxIdx === -1) { res.notes.push("no startxref"); return res; }
  const startxref = parseInt(s.slice(sxIdx + 9).trim(), 10);
  res.startxref = startxref;
  if (!(startxref >= 0 && startxref < buf.length)) { res.notes.push("startxref out of range"); return res; }

  let p = startxref;
  if (s.slice(p, p + 4) !== "xref") {
    res.notes.push(`xref stream / unrecognised at offset: ${JSON.stringify(s.slice(p, p + 16))}`);
    return res;
  }
  p += 4;

  for (;;) {
    while (p < s.length && /\s/.test(s[p])) p++;
    if (s.startsWith("trailer", p)) break;
    const hdr = /^(\d+)\s+(\d+)/.exec(s.slice(p, p + 40));
    if (!hdr) { res.notes.push(`unparseable subsection header at ${p}: ${JSON.stringify(s.slice(p, p + 20))}`); return res; }
    const first = parseInt(hdr[1], 10);
    const count = parseInt(hdr[2], 10);
    p += hdr[0].length;
    while (p < s.length && /[\r\n\s]/.test(s[p])) p++;

    for (let i = 0; i < count; i++) {
      const entry = s.slice(p, p + 20);
      const em = /^(\d{10})\s(\d{5})\s([nf])/.exec(entry);
      if (!em) { res.bad.push({ obj: first + i, reason: `malformed entry ${JSON.stringify(entry)}` }); p += 20; continue; }
      p += 20;
      if (em[3] === "f") continue;
      const off = parseInt(em[1], 10);
      const gen = parseInt(em[2], 10);
      const num = first + i;
      res.checked++;
      const head = s.slice(off, off + 40);
      if (!new RegExp(`^\\s*${num}\\s+${gen}\\s+obj`).test(head)) {
        res.bad.push({ obj: num, gen, offset: off, found: JSON.stringify(head.slice(0, 30)) });
      }
    }
  }
  res.ok = res.bad.length === 0;
  return res;
}

/** Shared document inputs, so every diagnostic renders the same thing. */
export const brand = { productName: "F2K Fund Tokenisation", primaryColor: "#1A2744", accentColor: "#22C55E" };
export const header = { title: "GREH Fund 1 - Investor Deep-Dive", subtitle: "Wholesale investor report", dateLine: "20 April 2026" };
export const metadata = { author: "F2K Fund Tokenisation", subject: "investor_deep_dive" };
export const footer = { disclaimer: "F2K Fund Tokenisation - Wholesale Investors Only", watermark: "PRE-AFSL", pageNumbers: true };

export function body(sections) {
  if (sections === 0) return "# Heading\n\nShort body.";
  return Array.from({ length: sections }, (_, i) => `## Section ${i + 1}\n\n${"Body paragraph. ".repeat(30)}`).join("\n\n");
}
