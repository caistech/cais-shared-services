/**
 * Certificate extraction — thin adapter over @caistech/cert-extractor.
 *
 * 2 tools:
 *   - list_supported_cert_types  (enum of known cert types)
 *   - extract_cert               (OCR + structured extraction; BYOK Anthropic key required)
 *
 * The cert-extractor package is framework-agnostic — it accepts a
 * VisionLlmCaller closure. v1 wires Anthropic Claude via direct HTTPS
 * (no Anthropic SDK dep added here — keeps the MCP package light).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { extractCert } from "@caistech/cert-extractor";
import type { CertType, VisionLlmCaller } from "@caistech/cert-extractor";

import type { ToolContext } from "./types.js";
import { buildToolResult, buildErrorResult } from "./result.js";

const CERT_TYPES: CertType[] = [
  "iso_9001",
  "iso_14001",
  "iso_45001",
  "iatf_16949",
  "as_nzs_iso_9001",
  "business_licence",
  "codemark",
  "jas_anz",
  "gb_50016",
  "gb_50204",
  "ce",
  "en_1090",
  "sgs_test_report",
  "tuv_test_report",
  "bureau_veritas_test_report",
  "mill_certificate",
  "jas_anz_timber",
  "fsc_timber",
  "unknown",
];

const SOURCE_LANGUAGES = [
  "en",
  "zh",
  "zh-TW",
  "vi",
  "ms",
  "id",
  "tl",
  "ja",
  "ko",
  "auto",
] as const;

const MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic"] as const;

export function registerCertTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_supported_cert_types",
    {
      title: "List supported certificate types",
      description:
        "Return the enum of certificate types this MCP's extract_cert tool can identify and extract. Useful for picking the right 'expected_cert_type' hint.",
      inputSchema: {},
    },
    async () => {
      const start = Date.now();
      await ctx.telemetry.recordCall({
        toolName: "list_supported_cert_types",
        status: "ok",
        durationMs: Date.now() - start,
        credentialSource: ctx.credentials.source,
      });
      return buildToolResult(ctx, "list_supported_cert_types", {
        cert_types: CERT_TYPES,
      });
    },
  );

  server.registerTool(
    "extract_cert",
    {
      title: "Extract structured fields from a certificate image",
      description:
        "OCR + structured entity extraction for compliance certificates (ISO 9001, business licences, CodeMark, JAS-ANZ, mill certs, etc.). Bilingual output (original + English translation). Requires an Anthropic API key in the MCP session (vision LLM). The key is used per-call and never persisted.",
      inputSchema: {
        image_base64: z
          .string()
          .min(1)
          .describe("Base64-encoded image bytes (no data:URI prefix)."),
        mime_type: z
          .enum(MIME_TYPES)
          .describe("MIME type of the image."),
        expected_cert_type: z
          .enum(CERT_TYPES as [CertType, ...CertType[]])
          .optional()
          .describe("Hint at expected cert type. Extractor still verifies."),
        source_language: z
          .enum(SOURCE_LANGUAGES)
          .optional()
          .describe("Source language hint. Default: 'auto'."),
        skip_translation: z
          .boolean()
          .optional()
          .describe("Skip English translation step."),
      },
    },
    async ({ image_base64, mime_type, expected_cert_type, source_language, skip_translation }) => {
      const start = Date.now();
      const anthropicKey = ctx.credentials.anthropicApiKey;
      if (!anthropicKey) {
        await ctx.telemetry.recordCall({
          toolName: "extract_cert",
          status: "error",
          durationMs: Date.now() - start,
          credentialSource: ctx.credentials.source,
        });
        return buildErrorResult(
          "extract_cert requires an Anthropic API key. Send it as the 'X-Anthropic-Api-Key' HTTP header (hosted MCP) or set ANTHROPIC_API_KEY in the environment (stdio / local dev). Your key runs vision LLM calls on your own credit and is never logged or persisted.",
        );
      }
      const visionLlm = makeAnthropicVisionCaller(anthropicKey);
      try {
        const result = await extractCert({
          document: { imageBase64: image_base64, mimeType: mime_type },
          expectedCertType: expected_cert_type,
          sourceLanguage: source_language,
          skipTranslation: skip_translation,
          visionLlm,
          translateLlm: skip_translation ? undefined : makeAnthropicTextCaller(anthropicKey),
        });
        await ctx.telemetry.recordCall({
          toolName: "extract_cert",
          status: "ok",
          durationMs: Date.now() - start,
          credentialSource: ctx.credentials.source,
        });
        return buildToolResult(ctx, "extract_cert", result);
      } catch (err) {
        await ctx.telemetry.recordCall({
          toolName: "extract_cert",
          status: "error",
          durationMs: Date.now() - start,
          credentialSource: ctx.credentials.source,
        });
        const message = err instanceof Error ? err.message : String(err);
        return buildErrorResult(`extract_cert failed: ${message}`);
      }
    },
  );
}

/**
 * Anthropic vision caller wired to claude-3-5-sonnet via direct HTTPS.
 * Kept inline to avoid pulling the Anthropic SDK as a heavyweight dep.
 */
function makeAnthropicVisionCaller(apiKey: string): VisionLlmCaller {
  return async ({ systemPrompt, userPrompt, imageBase64, mimeType }) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-7",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: imageBase64,
                },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic vision call failed: ${res.status} ${errText}`);
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const firstText = data.content?.find((c) => c.type === "text")?.text ?? "";
    return firstText;
  };
}

function makeAnthropicTextCaller(apiKey: string): (params: { systemPrompt: string; userPrompt: string }) => Promise<string> {
  return async ({ systemPrompt, userPrompt }) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic text call failed: ${res.status} ${errText}`);
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return data.content?.find((c) => c.type === "text")?.text ?? "";
  };
}
