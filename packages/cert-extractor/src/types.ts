/**
 * @caistech/cert-extractor — Types.
 */

export type CertType =
  | 'iso_9001'
  | 'iso_14001'
  | 'iso_45001'
  | 'iatf_16949'
  | 'as_nzs_iso_9001'
  | 'business_licence'
  | 'codemark'
  | 'jas_anz'
  | 'gb_50016'
  | 'gb_50204'
  | 'ce'
  | 'en_1090'
  | 'sgs_test_report'
  | 'tuv_test_report'
  | 'bureau_veritas_test_report'
  | 'mill_certificate'
  | 'jas_anz_timber'
  | 'fsc_timber'
  | 'unknown';

export type SupportedSourceLanguage =
  | 'en'
  | 'zh'
  | 'zh-TW'
  | 'vi'
  | 'ms'
  | 'id'
  | 'tl'
  | 'ja'
  | 'ko'
  | 'auto';

/**
 * Vision-capable LLM caller. The package supplies the prompts; the caller
 * supplies the transport (Anthropic SDK, OpenRouter, OpenAI vision, etc.).
 *
 * imageBase64 is the document image (or first page if PDF) base64-encoded
 * without the data:URI prefix. mimeType is e.g. 'image/png' or 'image/jpeg'.
 */
export type VisionLlmCaller = (params: {
  systemPrompt: string;
  userPrompt: string;
  imageBase64: string;
  mimeType: string;
}) => Promise<string>;

/**
 * Plain-text LLM caller used for translation. Separate from VisionLlmCaller
 * so the consumer can use a cheaper model for translation than for vision.
 */
export type TextLlmCaller = (params: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<string>;

/**
 * Optional security gate hook — wraps an LLM call so that prompt-injection
 * attempts in the document text are filtered. Compatible with @caistech/security-gate.
 */
export interface SecurityGateHook {
  wrap<T>(fn: () => Promise<T>): Promise<T>;
}

export interface CertExtractionOptions {
  /**
   * Document as base64-encoded image bytes + mime type.
   * For multi-page PDFs the consumer should pre-render and pass the page
   * containing the certificate (typically page 1).
   */
  document: {
    imageBase64: string;
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic';
  };
  /** Hint at expected cert type. Extractor still verifies. */
  expectedCertType?: CertType;
  /** Source language hint. Default: 'auto'. */
  sourceLanguage?: SupportedSourceLanguage;
  /** Vision-capable LLM caller (mandatory). */
  visionLlm: VisionLlmCaller;
  /** Plain-text LLM caller for translation (optional — if absent, translation is skipped). */
  translateLlm?: TextLlmCaller;
  /** Skip translation even if translateLlm is provided. */
  skipTranslation?: boolean;
  /** Security gate. Recommended for production. */
  securityGate?: SecurityGateHook;
}

export interface CertFields {
  cert_number: string | null;
  issuing_body: string | null;
  /** Entity name on the certificate (the manufacturer being certified). */
  issued_to: string | null;
  /** Entity name on cert in original-language script (e.g. simplified Chinese). */
  issued_to_native: string | null;
  /** ISO 8601 date strings, or null. */
  issue_date: string | null;
  expiry_date: string | null;
  /** Verbatim scope clause as printed on the cert. */
  scope_statement: string | null;
  /** One-line plain-English summary of the scope. */
  scope_summary_en: string | null;
  /** Address of the certified site/entity, if printed on cert. */
  certified_address: string | null;
  /** For business licences: registration number / Unified Social Credit Code etc. */
  registration_number: string | null;
}

export interface CertExtractionResult {
  /** Detected cert type with confidence 0-1. */
  detectedCertType: { type: CertType; confidence: number };
  /** Whether the document appears authentic (not a watermark, photo of screen, etc.). */
  authenticityFlags: {
    appears_to_be_certificate: boolean;
    detected_watermark: boolean;
    detected_screen_photo: boolean;
    detected_seal_or_chop: boolean;
    notes: string[];
  };
  /** Extracted structured fields (nullable per field). */
  fields: CertFields;
  /** Bilingual text. */
  text: {
    detected_language: string;
    original_text: string;
    translated_text_en: string | null;
  };
  /** Per-field confidence 0-1. */
  fieldConfidence: Partial<Record<keyof CertFields, number>>;
  /** Warnings (low confidence, missing required fields, scope ambiguity). */
  warnings: string[];
  /** True when extraction is confident enough to use without manufacturer confirmation. */
  highConfidence: boolean;
  /** Raw vision-model response for audit / debugging. */
  rawResponse?: string;
}
