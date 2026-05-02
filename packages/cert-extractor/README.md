# @caistech/cert-extractor

OCR + structured entity extraction for certificates and licences. Bilingual storage (original-language text + EN translation).

Used by F2K CMPP self-registration (Gates G2, G3) to ingest manufacturer-uploaded ISO certificates, business licences, CodeMark certificates, mill certificates, and test reports — including phone-photo'd Chinese paper certs with red chops.

## Install

```bash
pnpm add @caistech/cert-extractor --legacy-peer-deps
```

## Design

Framework-agnostic. The package supplies the prompt engineering, JSON parsing, normalisation, and authenticity heuristics. The consumer supplies:

1. A **vision-capable LLM caller** (Anthropic vision via Anthropic SDK, GPT-4 Vision via OpenAI/OpenRouter, Claude via OpenRouter, etc.)
2. *(Optional)* A **plain-text LLM caller** for translation. Cheaper than vision — usually a different model.
3. *(Optional)* A **`@caistech/security-gate` hook** to wrap LLM calls so prompt-injection embedded in the certificate text is contained.

PDF inputs are out of scope — the consumer pre-renders the relevant page to PNG/JPEG and passes the image. (PDF → image rendering varies wildly by environment; we don't pin a renderer.)

## Usage

```ts
import { extractCert } from '@caistech/cert-extractor';
import { chatCompletion } from '@caistech/openrouter-client';

// Wrap OpenRouter into the package's expected signatures
const visionLlm = async ({ systemPrompt, userPrompt, imageBase64, mimeType }) => {
  return chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ] as any,
      },
    ],
    process.env.OPENROUTER_API_KEY!,
    { model: 'anthropic/claude-sonnet-4.6' },
  );
};

const translateLlm = async ({ systemPrompt, userPrompt }) => {
  return chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    process.env.OPENROUTER_API_KEY!,
    { model: 'anthropic/claude-haiku-4.5' },  // cheaper for plain translation
  );
};

const result = await extractCert({
  document: { imageBase64: pageOneBase64, mimeType: 'image/png' },
  expectedCertType: 'iso_9001',
  sourceLanguage: 'zh',
  visionLlm,
  translateLlm,
});

// result.detectedCertType.type === 'iso_9001'
// result.fields.cert_number === '01 100 12345'
// result.fields.expiry_date === '2027-08-15'
// result.text.original_text === '<verbatim Chinese transcription>'
// result.text.translated_text_en === '<English translation>'
// result.warnings === ['Certificate expires in 47 days (2026-06-18).']
// result.highConfidence === true
```

## With security-gate

```ts
import { createSecurityGate } from '@caistech/security-gate';

const gate = createSecurityGate({
  projectId: process.env.F2K_PROJECT_ID!,
  agentId: 'cert-extractor',
  quarantineModel: ...,
  plannerModel: ...,
});

const result = await extractCert({
  document: { imageBase64, mimeType: 'image/png' },
  visionLlm,
  translateLlm,
  securityGate: { wrap: (fn) => gate.run(fn) },
});
```

## Supported cert types

- ISO 9001 / 14001 / 45001
- IATF 16949
- AS/NZS ISO 9001
- PRC business licence (with USCC)
- CodeMark Australia
- JAS-ANZ accreditation
- GB 50016 (fire), GB 50204 (concrete)
- CE marking, EN 1090 (steel)
- SGS / TÜV / Bureau Veritas test reports
- Mill test certificates (with heat number)
- JAS-ANZ + FSC timber chain-of-custody

Cert types not in the supported list are returned as `unknown` with a warning.

## Returns

`CertExtractionResult` (see `src/types.ts`) — includes:

- Detected cert type + confidence
- Authenticity flags (watermark / screen photo / seal / chop)
- Structured fields (cert#, issuing body, dates, scope)
- Bilingual text (original-language transcription + EN translation)
- Per-field confidence scores
- Warnings (expired / expiring soon / low confidence)
- `highConfidence` boolean — true when extraction is safe to use without manufacturer confirmation

## Versioning

Pre-1.0 — break freely on minor bumps. Lock to exact version in consumers until 1.0.
