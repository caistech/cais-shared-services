/**
 * Core domain types for @caistech/dataroom-core — the contract every consumer
 * and every engine function agrees on. Extracted from the LingoPure investor
 * dataroom; `tier` is generalised from a product union to a string so any
 * product's tier taxonomy fits.
 */

/** A retrieved dataroom passage (the RAG unit). */
export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  displayName: string;
  page: number | null;
  content: string;
  isVisionCaption: boolean;
  /** The confidentiality tier this chunk belongs to (product-defined string). */
  tier: string;
  similarity: number;
};

/** A source-document reference for a cited answer / report. */
export type Citation = {
  documentId: string;
  displayName: string;
  page: number | null;
};

/** The result of a Q&A answer: the text, the de-duped sources, and the raw chunks. */
export type AnswerResult = {
  answer: string;
  citations: Citation[];
  chunks: RetrievedChunk[];
};

/**
 * The injected retriever — the app-agnostic seam. The consumer owns the DB /
 * embeddings / RPC; the engine only ever calls this with the tiers the
 * consumer's auth already resolved. Returning fewer tiers can only narrow, never
 * widen, what a caller sees (the tier filter stays inside the consumer's
 * SECURITY DEFINER RPC).
 */
export type Retriever = (
  query: string,
  allowedTiers: string[],
  matchCount: number
) => Promise<RetrievedChunk[]>;

/**
 * The injected chat function — "inject any LLM". The consumer wires its own
 * Anthropic/OpenAI/gateway client; the engine stays model-SDK-free. Must return
 * the assistant's text (empty string if the model produced none).
 */
export type ChatFn = (args: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}) => Promise<string>;

/**
 * The tier lattice: given a subject's maximum tier, which tiers may retrieval
 * search? (e.g. a `restricted` investor may search `['main','restricted']`.)
 */
export type TierPolicy<T extends string = string> = {
  tiers: readonly T[];
  allowedTiersFor: (maxTier: T) => T[];
};

/** Generic report spec shape (the schema factory produces a matching Zod type). */
export type ReportSpec = {
  reportType: string;
  title: string | null;
  topic: string | null;
  sections: string[];
  format: "pdf" | "markdown";
};

/** A report-type capability the product offers (the catalogue is injected). */
export type ReportCapability = {
  key: string;
  label: string;
  defaultSections: string[];
  /** Human note on what this report draws from, for the LLM manifest + UI. */
  draws: string;
};

export type BuiltSection = { heading: string; body: string; sourceCount: number };

export type BuiltReport = {
  title: string;
  markdown: string;
  sections: BuiltSection[];
  citations: Citation[];
};

/** Product config for the Q&A path. */
export type AnswerConfig = {
  /** The analyst system prompt (product persona + answer-only-from-excerpts rules). */
  systemPrompt: string;
  /** Returned verbatim when nothing is retrieved (degrade-don't-fake). */
  noAnswerText: string;
  model?: string;
  /** How many chunks to retrieve per question (default 12). */
  matchCount?: number;
  /** Max output tokens (default 1500). */
  maxTokens?: number;
};

/** Product config for the report path. */
export type ReportConfig = {
  /** The per-section system prompt (should embed the product's notCoveredText rule). */
  sectionSystemPrompt: string;
  /** Marker for a section with no coverage (also the empty-output fallback). */
  notCoveredText: string;
  /** Resolve a spec to its report title (e.g. brand prefix + label + topic). */
  titleFor: (spec: ReportSpec) => string;
  model?: string;
  /** Chunks retrieved per section (default 8). */
  matchCount?: number;
  /** Max output tokens per section (default 1200). */
  maxTokens?: number;
};

/** An RGB colour as a 0..1 triple (pdf-lib shape, dependency-free at the type level). */
export type RgbTuple = [number, number, number];

/** Who a PDF was prepared for + when — stamped into the watermark/footer. */
export type PdfMeta = { firm: string; date: string };

/** Optional brand overrides for the PDF renderers (defaults preserve a navy/gold look). */
export type PdfBrand = {
  navy?: RgbTuple;
  accent?: RgbTuple;
  grey?: RgbTuple;
  /** Diagonal watermark label (default "CONFIDENTIAL"). */
  watermarkLabel?: string;
  /** Footer line template (default "Confidential - prepared for {firm}  -  {date}"). */
  footer?: (meta: PdfMeta) => string;
};
