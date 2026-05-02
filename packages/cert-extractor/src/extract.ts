/**
 * @caistech/cert-extractor — Main extraction orchestration.
 */

import type {
  CertExtractionOptions,
  CertExtractionResult,
  CertFields,
  CertType,
} from './types';
import {
  VISION_SYSTEM_PROMPT,
  buildVisionUserPrompt,
  TRANSLATION_SYSTEM_PROMPT,
  buildTranslationPrompt,
} from './prompts';

const KNOWN_CERT_TYPES: ReadonlySet<CertType> = new Set([
  'iso_9001',
  'iso_14001',
  'iso_45001',
  'iatf_16949',
  'as_nzs_iso_9001',
  'business_licence',
  'codemark',
  'jas_anz',
  'gb_50016',
  'gb_50204',
  'ce',
  'en_1090',
  'sgs_test_report',
  'tuv_test_report',
  'bureau_veritas_test_report',
  'mill_certificate',
  'jas_anz_timber',
  'fsc_timber',
  'unknown',
]);

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

export async function extractCert(opts: CertExtractionOptions): Promise<CertExtractionResult> {
  const userPrompt = buildVisionUserPrompt({
    expectedCertType: opts.expectedCertType,
    sourceLanguageHint: opts.sourceLanguage,
  });

  const visionCall = () =>
    opts.visionLlm({
      systemPrompt: VISION_SYSTEM_PROMPT,
      userPrompt,
      imageBase64: opts.document.imageBase64,
      mimeType: opts.document.mimeType,
    });

  const rawResponse = opts.securityGate
    ? await opts.securityGate.wrap(visionCall)
    : await visionCall();

  const parsed = parseVisionResponse(rawResponse);

  let translatedText: string | null = null;
  if (
    !opts.skipTranslation &&
    opts.translateLlm &&
    parsed.detected_language &&
    parsed.detected_language !== 'en' &&
    parsed.original_text
  ) {
    const translateCall = () =>
      opts.translateLlm!({
        systemPrompt: TRANSLATION_SYSTEM_PROMPT,
        userPrompt: buildTranslationPrompt(parsed.original_text, parsed.detected_language),
      });
    try {
      translatedText = opts.securityGate
        ? await opts.securityGate.wrap(translateCall)
        : await translateCall();
    } catch (err) {
      parsed.warnings.push(
        `Translation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const certType = normaliseCertType(parsed.detected_cert_type);
  const fields = normaliseFields(parsed.fields);
  const expiryWarnings = checkExpiryWarnings(fields);

  const allWarnings = [...parsed.warnings, ...expiryWarnings];

  const minFieldConfidence = Math.min(
    ...Object.values(parsed.field_confidence ?? {}).filter((v): v is number => typeof v === 'number'),
    parsed.cert_type_confidence ?? 0,
  );

  const highConfidence =
    parsed.authenticity?.appears_to_be_certificate === true &&
    parsed.authenticity?.detected_screen_photo !== true &&
    minFieldConfidence >= HIGH_CONFIDENCE_THRESHOLD &&
    certType !== 'unknown';

  return {
    detectedCertType: { type: certType, confidence: parsed.cert_type_confidence ?? 0 },
    authenticityFlags: {
      appears_to_be_certificate: parsed.authenticity?.appears_to_be_certificate ?? false,
      detected_watermark: parsed.authenticity?.detected_watermark ?? false,
      detected_screen_photo: parsed.authenticity?.detected_screen_photo ?? false,
      detected_seal_or_chop: parsed.authenticity?.detected_seal_or_chop ?? false,
      notes: parsed.authenticity?.notes ?? [],
    },
    fields,
    text: {
      detected_language: parsed.detected_language ?? 'unknown',
      original_text: parsed.original_text ?? '',
      translated_text_en: translatedText,
    },
    fieldConfidence: parsed.field_confidence as Partial<Record<keyof CertFields, number>>,
    warnings: allWarnings,
    highConfidence,
    rawResponse,
  };
}

interface ParsedVisionResponse {
  detected_cert_type: string;
  cert_type_confidence: number;
  detected_language: string;
  original_text: string;
  fields: Record<string, string | null>;
  field_confidence: Record<string, number>;
  authenticity: {
    appears_to_be_certificate: boolean;
    detected_watermark: boolean;
    detected_screen_photo: boolean;
    detected_seal_or_chop: boolean;
    notes: string[];
  };
  warnings: string[];
}

function parseVisionResponse(raw: string): ParsedVisionResponse {
  const jsonStr = extractJsonBlock(raw);
  let obj: unknown;
  try {
    obj = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `cert-extractor: vision model did not return valid JSON. ${err instanceof Error ? err.message : ''}`,
    );
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('cert-extractor: vision response is not an object');
  }
  const o = obj as Record<string, unknown>;
  return {
    detected_cert_type: typeof o.detected_cert_type === 'string' ? o.detected_cert_type : 'unknown',
    cert_type_confidence:
      typeof o.cert_type_confidence === 'number' ? o.cert_type_confidence : 0,
    detected_language: typeof o.detected_language === 'string' ? o.detected_language : 'unknown',
    original_text: typeof o.original_text === 'string' ? o.original_text : '',
    fields: (o.fields as Record<string, string | null>) ?? {},
    field_confidence: (o.field_confidence as Record<string, number>) ?? {},
    authenticity: {
      appears_to_be_certificate: Boolean(
        (o.authenticity as Record<string, unknown> | undefined)?.appears_to_be_certificate,
      ),
      detected_watermark: Boolean(
        (o.authenticity as Record<string, unknown> | undefined)?.detected_watermark,
      ),
      detected_screen_photo: Boolean(
        (o.authenticity as Record<string, unknown> | undefined)?.detected_screen_photo,
      ),
      detected_seal_or_chop: Boolean(
        (o.authenticity as Record<string, unknown> | undefined)?.detected_seal_or_chop,
      ),
      notes: Array.isArray((o.authenticity as Record<string, unknown> | undefined)?.notes)
        ? ((o.authenticity as Record<string, unknown>).notes as string[])
        : [],
    },
    warnings: Array.isArray(o.warnings) ? (o.warnings as string[]) : [],
  };
}

/**
 * Vision models sometimes wrap JSON in markdown code fences or add a trailing
 * sentence. Pull out the first {...} block.
 */
function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function normaliseCertType(raw: string): CertType {
  const lower = raw.toLowerCase().trim() as CertType;
  return KNOWN_CERT_TYPES.has(lower) ? lower : 'unknown';
}

function normaliseFields(raw: Record<string, string | null>): CertFields {
  const get = (k: string): string | null => {
    const v = raw[k];
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
  };
  return {
    cert_number: get('cert_number'),
    issuing_body: get('issuing_body'),
    issued_to: get('issued_to'),
    issued_to_native: get('issued_to_native'),
    issue_date: normaliseDate(get('issue_date')),
    expiry_date: normaliseDate(get('expiry_date')),
    scope_statement: get('scope_statement'),
    scope_summary_en: get('scope_summary_en'),
    certified_address: get('certified_address'),
    registration_number: get('registration_number'),
  };
}

function normaliseDate(raw: string | null): string | null {
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function checkExpiryWarnings(fields: CertFields): string[] {
  const warnings: string[] = [];
  if (fields.expiry_date) {
    const expiry = new Date(fields.expiry_date);
    const now = new Date();
    const daysToExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysToExpiry < 0) {
      warnings.push(`Certificate expired ${Math.abs(daysToExpiry)} days ago (${fields.expiry_date}).`);
    } else if (daysToExpiry < 90) {
      warnings.push(`Certificate expires in ${daysToExpiry} days (${fields.expiry_date}).`);
    }
  }
  return warnings;
}
