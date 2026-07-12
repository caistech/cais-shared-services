import type { RetrievedChunk } from "./types.js";

/**
 * Render tier-filtered chunks into a numbered, source-tagged context block for
 * the LLM. Pure — no deps. The numbering + `(Document, p.N)` tagging is what lets
 * the model cite inline as `[Document name, p.N]`.
 */
export function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => {
      const src = `${c.displayName}${c.page ? `, p.${c.page}` : ""}`;
      return `[${i + 1}] (${src})\n${c.content}`;
    })
    .join("\n\n");
}

/** De-duplicate chunks to one Citation per document, preserving retrieval order. */
export function citationsFromChunks(chunks: RetrievedChunk[]) {
  const seen = new Set<string>();
  const citations = [];
  for (const c of chunks) {
    if (seen.has(c.documentId)) continue;
    seen.add(c.documentId);
    citations.push({ documentId: c.documentId, displayName: c.displayName, page: c.page });
  }
  return citations;
}
