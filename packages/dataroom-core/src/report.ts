import type {
  BuiltReport,
  BuiltSection,
  ChatFn,
  Citation,
  ReportConfig,
  ReportSpec,
  Retriever,
  RetrievedChunk,
} from "./types.js";
import { buildContext } from "./context.js";

/**
 * Report executor: for each requested section, run a tier-filtered retrieval and
 * synthesise the section ONLY from those chunks (degrade-don't-fake — a section
 * with no coverage is marked, never invented). Assembles markdown + the union of
 * cited sources. Sections run in parallel (independent retrievals).
 *
 * App-agnostic: `chat` + `retrieve` injected; the per-section prompt, the
 * "not covered" marker, and the title strategy come from {@link ReportConfig}.
 */
async function synthSection(
  deps: { chat: ChatFn; retrieve: Retriever; config: ReportConfig },
  heading: string,
  topic: string | null,
  allowedTiers: string[]
): Promise<{ section: BuiltSection; chunks: RetrievedChunk[] }> {
  const { chat, retrieve, config } = deps;
  const query = topic ? `${heading} — ${topic}` : heading;
  const chunks = await retrieve(query, allowedTiers, config.matchCount ?? 8);
  if (chunks.length === 0) {
    return { section: { heading, body: config.notCoveredText, sourceCount: 0 }, chunks: [] };
  }
  const text = await chat({
    system: config.sectionSystemPrompt,
    user: `Report section: ${heading}\n${topic ? `Report focus: ${topic}\n` : ""}\nDataroom excerpts:\n\n${buildContext(chunks)}\n\n---\nWrite the "${heading}" section now.`,
    model: config.model,
    maxTokens: config.maxTokens ?? 1200,
  });
  const body = text.trim() || config.notCoveredText;
  return { section: { heading, body, sourceCount: chunks.length }, chunks };
}

export async function buildReport(
  deps: { chat: ChatFn; retrieve: Retriever; config: ReportConfig },
  spec: ReportSpec,
  allowedTiers: string[]
): Promise<BuiltReport> {
  const results = await Promise.all(
    spec.sections.map((h) => synthSection(deps, h, spec.topic ?? null, allowedTiers))
  );

  const title = deps.config.titleFor(spec);
  let md = `# ${title}\n\n`;
  for (const { section } of results) {
    md += `## ${section.heading}\n\n${section.body}\n\n`;
  }

  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const { chunks } of results) {
    for (const c of chunks) {
      if (seen.has(c.documentId)) continue;
      seen.add(c.documentId);
      citations.push({ documentId: c.documentId, displayName: c.displayName, page: c.page });
    }
  }

  return { title, markdown: md.trim(), sections: results.map((r) => r.section), citations };
}
