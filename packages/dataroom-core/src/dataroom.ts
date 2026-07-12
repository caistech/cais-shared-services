import type {
  AnswerConfig,
  AnswerResult,
  BuiltReport,
  ChatFn,
  ReportConfig,
  ReportSpec,
  Retriever,
} from "./types.js";
import { answerQuestion } from "./answer.js";
import { buildReport } from "./report.js";

/** Everything a dataroom instance needs — the LLM, the retriever, and the prompts. */
export type DataroomDeps = {
  /** Inject any LLM (the consumer wires Anthropic/OpenAI/gateway). */
  chat: ChatFn;
  /** Inject the tier-filtered retriever (the consumer owns the DB/embeddings/RPC). */
  retrieve: Retriever;
  /** Product config for the Q&A path. */
  answer: AnswerConfig;
  /** Product config for the report path. */
  report: ReportConfig;
};

export type Dataroom = {
  /** Answer a question, cited, from the tiers the caller is entitled to. */
  answerQuestion(question: string, allowedTiers: string[]): Promise<AnswerResult>;
  /** Build a multi-section report from the tiers the caller is entitled to. */
  buildReport(spec: ReportSpec, allowedTiers: string[]): Promise<BuiltReport>;
};

/**
 * Bind the injected LLM + retriever + prompts once, and get back the two engine
 * operations. The consumer always passes server-derived `allowedTiers` (never a
 * client-supplied tier) — the tier filter stays inside the consumer's retriever.
 *
 * @example
 *   const dataroom = createDataroom({
 *     chat: myAnthropicChat,          // ChatFn
 *     retrieve: myTierFilteredRpc,    // Retriever
 *     answer: { systemPrompt: ASK_PROMPT, noAnswerText: "…" },
 *     report: { sectionSystemPrompt: SEC_PROMPT, notCoveredText: "…", titleFor },
 *   });
 *   const { answer, citations } = await dataroom.answerQuestion(q, allowedTiersFor(maxTier));
 */
export function createDataroom(deps: DataroomDeps): Dataroom {
  return {
    answerQuestion: (question, allowedTiers) =>
      answerQuestion({ chat: deps.chat, retrieve: deps.retrieve, config: deps.answer }, question, allowedTiers),
    buildReport: (spec, allowedTiers) =>
      buildReport({ chat: deps.chat, retrieve: deps.retrieve, config: deps.report }, spec, allowedTiers),
  };
}
