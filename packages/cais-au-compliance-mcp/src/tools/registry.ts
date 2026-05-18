/**
 * Business registry tools — thin adapters over @caistech/business-registry.
 *
 * 2 tools:
 *   - validate_registration_number  (deterministic format check per country)
 *   - lookup_business               (live registry lookup; provider-dependent)
 *
 * v1 wires the built-in stub providers for non-CN countries (returns
 * NOT_IMPLEMENTED gracefully). CN routes to Tianyancha when the user
 * supplies a Tianyancha key via session config (deferred to v1.1).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createRegistry,
  validateRegistrationNumber,
  createStubProvider,
} from "@caistech/business-registry";
import type { CountryCode } from "@caistech/business-registry";

import type { ToolContext } from "./types.js";
import { buildToolResult, buildErrorResult } from "./result.js";

const COUNTRY_CODES = ["CN", "VN", "MY", "AU", "ID", "TH", "PH"] as const;

export function registerRegistryTools(server: McpServer, ctx: ToolContext): void {
  const registry = createRegistry([
    createStubProvider("CN"),
    createStubProvider("VN"),
    createStubProvider("MY"),
    createStubProvider("AU"),
    createStubProvider("ID"),
    createStubProvider("TH"),
    createStubProvider("PH"),
  ]);

  server.registerTool(
    "validate_registration_number",
    {
      title: "Validate business registration number",
      description:
        "Deterministic format check (incl. checksum where applicable) for a business registration number in a given country. Supports CN (USCC), VN (MST), MY (SSM), AU (ABN), ID (NIB). Returns parsed components when valid.",
      inputSchema: {
        country: z
          .enum(COUNTRY_CODES)
          .describe("ISO 3166-1 alpha-2 country code."),
        registration_number: z.string().describe("Registration number in the country's native format."),
      },
    },
    async ({ country, registration_number }) => {
      const start = Date.now();
      const result = validateRegistrationNumber(country, registration_number);
      await ctx.telemetry.recordCall(ctx.installId, {
        toolName: "validate_registration_number",
        status: result.valid ? "ok" : "error",
        durationMs: Date.now() - start,
        credentialSource: ctx.credentials.source,
      });
      return buildToolResult(ctx, "validate_registration_number", result);
    },
  );

  server.registerTool(
    "lookup_business",
    {
      title: "Look up business in the country registry",
      description:
        "Live registry lookup for a business by country + registration number. v1 ships with stub providers — returns NOT_IMPLEMENTED for live lookups unless the relevant provider key is configured. Always falls back gracefully.",
      inputSchema: {
        country: z.enum(COUNTRY_CODES).describe("ISO 3166-1 alpha-2 country code."),
        registration_number: z.string().describe("Registration number in the country's native format."),
        legal_name: z
          .string()
          .optional()
          .describe("Optional legal name for cross-check. If provided, result includes a match score."),
      },
    },
    async ({ country, registration_number, legal_name }) => {
      const start = Date.now();
      const result = await registry.lookup({
        country: country as CountryCode,
        registrationNumber: registration_number,
        legalName: legal_name,
      });
      const isError = !result.found && result.error !== undefined;
      await ctx.telemetry.recordCall(ctx.installId, {
        toolName: "lookup_business",
        status: isError ? "error" : "ok",
        durationMs: Date.now() - start,
        credentialSource: ctx.credentials.source,
      });
      if (isError && result.error?.code === "NOT_IMPLEMENTED") {
        return buildErrorResult(
          `${result.error.message}. Configure a provider key via session config (deferred to v1.1) or use validate_registration_number for offline format validation.`,
        );
      }
      return buildToolResult(ctx, "lookup_business", result);
    },
  );
}
