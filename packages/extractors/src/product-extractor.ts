/**
 * AI-powered PRODUCT-for-support extractor.
 *
 * Turns a product's own repo files (README, package.json, its route/page tree, key components) into
 * a concise, PLAIN-LANGUAGE briefing for a NON-TECHNICAL support agent — "what this product does and
 * its main user-facing screens/features, in the words a user would use." NOT an implementation
 * summary: the support agent never discusses code, it recognises what users mean and asks sharper
 * questions.
 *
 * Source-agnostic: the caller gathers the file contents however it likes (local FS, the GitHub
 * contents API, a monorepo path) and passes them in — this extractor never touches the network or a
 * filesystem. LLM-agnostic, like `extractProfile`: pass any `(system, prompt) => Promise<string>`.
 *
 * Primary consumer: SayFix — bakes the returned `blurb` into each repo's dedicated voice-agent
 * (Morgan) system prompt via `repos.product_context`, so the support coach is product-aware. Any
 * product-aware agent across the portfolio can reuse it.
 */

// ============================================================
// Types
// ============================================================

export interface ProductKeyFeature {
  name: string;
  description: string | null;
}

export interface ProductSupportProfile {
  product_name: string | null;
  /** One sentence: what the product is. */
  one_liner: string | null;
  /** 1-2 plain-language sentences: what a user does with it. */
  what_it_does: string | null;
  /** The main user-facing screens / areas, named as a user would (e.g. "Business valuation"). */
  main_screens: string[];
  /** Key features a user might report a problem about. */
  key_features: ProductKeyFeature[];
  /** Domain vocabulary users say out loud (e.g. "valuation multiple", "scenario"). */
  user_terms: string[];
  /** Raw LLM confidence 0-1 for the overall extraction. */
  confidence: number;
  /**
   * READY-TO-INJECT plain-text briefing (a few sentences) — this is what a consumer stores as the
   * agent's product context. Assembled by the LLM so it reads naturally, never a field dump.
   */
  blurb: string;
}

export interface ProductFile {
  /** Repo-relative path (used only to help the model weight the file, e.g. README over a util). */
  path: string;
  content: string;
}

export interface ProductExtractorInput {
  /** The product's name/slug, so the briefing is anchored even if the files don't state it. */
  productName: string;
  /** The gathered repo files. Order README/package.json/routes first for best results. */
  files: ProductFile[];
}

export interface ProductExtractorOptions {
  /** Function that calls your LLM. Receives (system, userPrompt) and returns the response text. */
  llm: (system: string, prompt: string) => Promise<string>;
  /** Max chars of concatenated file content to send to the LLM (default: 24000). */
  maxChars?: number;
}

export interface ExtractionError {
  error: string;
  partial?: Partial<ProductSupportProfile>;
}

export function isProductExtractionError(
  v: ProductSupportProfile | ExtractionError,
): v is ExtractionError {
  return (v as ExtractionError).error !== undefined;
}

// ============================================================
// Core extraction
// ============================================================

/**
 * Build a support-oriented product profile from a product's repo files.
 * Pure: no fetch, no fs — the caller supplies `files`.
 */
export async function describeProductForSupport(
  input: ProductExtractorInput,
  options: ProductExtractorOptions,
): Promise<ProductSupportProfile | ExtractionError> {
  const { llm, maxChars = 24000 } = options;
  const name = (input.productName || "").trim();

  const corpus = packFiles(input.files, maxChars);
  if (!corpus.trim()) return { error: "No file content provided to describe the product." };

  const prompt = `PRODUCT NAME: ${name || "(unknown — infer from the files)"}

REPO FILES (truncated):
${corpus}

Write the support briefing for this product as JSON per the schema. Describe only what a USER sees and does; ignore build tooling, config, and implementation. If the files don't reveal a field, use null or an empty array — never guess.`;

  let response: string;
  try {
    response = await llm(SYSTEM_PROMPT, prompt);
  } catch (err) {
    return { error: `LLM call failed: ${err instanceof Error ? err.message : "unknown"}` };
  }

  const parsed = parseJsonResponse(response);
  if (!parsed) return { error: "LLM returned unparseable response" };

  const main_screens = toStringArray(parsed.main_screens);
  const user_terms = toStringArray(parsed.user_terms);
  const key_features: ProductKeyFeature[] = Array.isArray(parsed.key_features)
    ? parsed.key_features
        .map((f: any) => ({
          name: typeof f?.name === "string" ? f.name : String(f ?? "").trim(),
          description: typeof f?.description === "string" ? f.description : null,
        }))
        .filter((f: ProductKeyFeature) => f.name)
    : [];

  const blurb = typeof parsed.blurb === "string" && parsed.blurb.trim()
    ? parsed.blurb.trim()
    : assembleBlurb(name || parsed.product_name, parsed.what_it_does, main_screens, key_features);

  return {
    product_name: typeof parsed.product_name === "string" ? parsed.product_name : name || null,
    one_liner: typeof parsed.one_liner === "string" ? parsed.one_liner : null,
    what_it_does: typeof parsed.what_it_does === "string" ? parsed.what_it_does : null,
    main_screens,
    key_features,
    user_terms,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    blurb,
  };
}

// ============================================================
// Helpers
// ============================================================

function packFiles(files: ProductFile[], maxChars: number): string {
  let out = "";
  for (const f of files || []) {
    if (!f?.content) continue;
    const block = `\n--- FILE: ${f.path} ---\n${f.content}\n`;
    if (out.length + block.length > maxChars) {
      out += block.slice(0, Math.max(0, maxChars - out.length));
      break;
    }
    out += block;
  }
  return out;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : String(x ?? ""))).map((s) => s.trim()).filter(Boolean);
}

function assembleBlurb(
  name: string | null,
  whatItDoes: unknown,
  screens: string[],
  features: ProductKeyFeature[],
): string {
  const parts: string[] = [];
  if (typeof whatItDoes === "string" && whatItDoes.trim()) parts.push(whatItDoes.trim());
  if (screens.length) parts.push(`Its main areas: ${screens.join(", ")}.`);
  else if (features.length) parts.push(`Key features: ${features.map((f) => f.name).join(", ")}.`);
  return parts.join(" ") || `${name || "This product"} — a web product users can report problems about.`;
}

function parseJsonResponse(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch { /* continue */ }
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]);
    } catch { /* continue */ }
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch { /* continue */ }
  }
  return null;
}

// ============================================================
// System prompt
// ============================================================

const SYSTEM_PROMPT = `You brief a NON-TECHNICAL support agent named Morgan who talks to everyday users of a web product and helps them report problems. From the product's own repo files, produce a short, plain-language description of WHAT THE PRODUCT DOES and its MAIN USER-FACING SCREENS AND FEATURES — the way a user would describe them.

Hard rules:
- USER language only. Never mention code, files, frameworks, APIs, databases, endpoints, components, or how anything is built. Morgan does not know or touch the code.
- Ground everything in the files. Do NOT invent features. If the files don't show it, leave it out (null / empty array).
- Prefer the README and the app's page/route names for the user-facing surface. Ignore build config, CI, tests, and tooling.
- Capture the product's real vocabulary (the nouns users would say, e.g. "valuation multiple", "scenario", "backing track") so Morgan recognises them.
- Keep "blurb" to 2-5 sentences — a natural briefing paragraph Morgan can act on, not a bullet dump.

Return ONLY JSON (no prose, no code fence) with exactly this shape:
{
  "product_name": string|null,
  "one_liner": string|null,
  "what_it_does": string|null,
  "main_screens": string[],
  "key_features": [{ "name": string, "description": string|null }],
  "user_terms": string[],
  "confidence": number,
  "blurb": string
}

confidence: 0.0-1.0 by how much the files actually revealed (0.9+ if the README + routes clearly describe the product; 0.3 if you had little to go on).`;
