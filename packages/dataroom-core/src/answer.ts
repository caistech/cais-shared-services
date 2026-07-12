import type { AnswerConfig, AnswerResult, ChatFn, Retriever } from "./types.js";
import { buildContext, citationsFromChunks } from "./context.js";

/**
 * The Q&A core: retrieve tier-filtered chunks, then have the LLM answer ONLY from
 * them with inline citations (degrade-don't-fake on an empty corpus). Returns the
 * de-duped cited sources too, for UI chips + the audit trail.
 *
 * App-agnostic: the LLM (`chat`) and the DB (`retrieve`) are injected; the
 * consumer resolves `allowedTiers` from its server-side auth before calling.
 */
export async function answerQuestion(
  deps: { chat: ChatFn; retrieve: Retriever; config: AnswerConfig },
  question: string,
  allowedTiers: string[]
): Promise<AnswerResult> {
  const { chat, retrieve, config } = deps;
  const chunks = await retrieve(question, allowedTiers, config.matchCount ?? 12);
  if (chunks.length === 0) {
    return { answer: config.noAnswerText, citations: [], chunks: [] };
  }

  const text = await chat({
    system: config.systemPrompt,
    user: `Dataroom excerpts:\n\n${buildContext(chunks)}\n\n---\nQuestion: ${question}`,
    model: config.model,
    maxTokens: config.maxTokens ?? 1500,
  });

  const answer = text.trim();
  if (!answer) throw new Error("dataroom-core: answer model returned empty output");

  return { answer, citations: citationsFromChunks(chunks), chunks };
}
