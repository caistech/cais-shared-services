/**
 * @caistech/dataroom-core — the tier-gated RAG-over-documents engine extracted
 * from the LingoPure investor dataroom.
 *
 * Ingest → embed → tier-filtered retrieve → cited answer / multi-section report →
 * branded, watermarked PDF. App-agnostic per the @caistech rule: the LLM (`chat`)
 * and the DB (`retrieve`) are INJECTED — the package never touches a DB, never
 * pins a model SDK, and the tier filter stays inside the consumer's SECURITY
 * DEFINER RPC. Prompts, the report catalogue, brand, and persistence are the
 * consumer's; the RAG orchestration + PDF renderers + tier-lattice are the engine.
 *
 * First consumer: LingoPureAI (investor dataroom). See the package README for the
 * generic Postgres retriever contract (the `match_*_chunks` RPC template) and the
 * wiring example.
 *
 * NOTE: the ingestion PIPELINE (extract→chunk→embed→persist, Node-only, pulls
 * mammoth/xlsx/pdf-parse) is a planned `/ingest` subpath — not in v0.1.0. v0.1.0
 * is the runtime engine (retrieve/answer/report/pdf/tier).
 */

export { createDataroom, type DataroomDeps, type Dataroom } from "./dataroom.js";
export { answerQuestion } from "./answer.js";
export { buildReport } from "./report.js";
export { buildContext, citationsFromChunks } from "./context.js";
export { makeTierPolicy } from "./tier.js";
export {
  makeReportSpecSchema,
  capabilityFor,
  makeDefaultTitleFor,
  capabilityManifestForLLM,
} from "./report-spec.js";
export { renderReportPdf, stampPdf } from "./pdf.js";

export type {
  RetrievedChunk,
  Citation,
  AnswerResult,
  Retriever,
  ChatFn,
  TierPolicy,
  ReportSpec,
  ReportCapability,
  BuiltSection,
  BuiltReport,
  AnswerConfig,
  ReportConfig,
  RgbTuple,
  PdfMeta,
  PdfBrand,
} from "./types.js";
