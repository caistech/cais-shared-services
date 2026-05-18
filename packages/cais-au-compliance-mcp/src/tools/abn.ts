/**
 * ABN tools — thin adapters over @caistech/abn-lookup.
 *
 * 3 tools:
 *   - validate_abn               (deterministic, no network)
 *   - lookup_abn                 (ABR live lookup, requires server-side GUID)
 *   - search_business_by_name    (ABR name search, requires server-side GUID)
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  validateAbn,
  formatAbn,
  lookupAbn,
  searchByName,
  isAbrError,
} from "@caistech/abn-lookup";

import type { ToolContext } from "./types.js";
import { buildToolResult, buildErrorResult } from "./result.js";

export function registerAbnTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "validate_abn",
    {
      title: "Validate ABN",
      description:
        "Deterministic checksum validation for an Australian Business Number. Returns whether the ABN is well-formed and its formatted display version. No network call.",
      inputSchema: { abn: z.string().describe("ABN to validate (11 digits, with or without spaces).") },
    },
    async ({ abn }) => {
      const start = Date.now();
      const errorMessage = validateAbn(abn);
      const formatted = formatAbn(abn);

      await ctx.telemetry.recordCall(ctx.installId, {
        toolName: "validate_abn",
        status: errorMessage ? "error" : "ok",
        durationMs: Date.now() - start,
        credentialSource: ctx.credentials.source,
      });

      return buildToolResult(ctx, "validate_abn", {
        valid: errorMessage === null,
        formatted: errorMessage === null ? formatted : abn,
        error: errorMessage,
      });
    },
  );

  server.registerTool(
    "lookup_abn",
    {
      title: "Look up ABN in ABR",
      description:
        "Look up an ABN against the Australian Business Register. Returns entity name, status, ACN, business names, state and postcode.",
      inputSchema: { abn: z.string().describe("ABN to look up (11 digits).") },
    },
    async ({ abn }) => {
      const start = Date.now();
      const guid = ctx.credentials.abrGuid ?? ctx.config.abr.guid;
      if (!guid) {
        await ctx.telemetry.recordCall(ctx.installId, {
          toolName: "lookup_abn",
          status: "error",
          durationMs: Date.now() - start,
          credentialSource: ctx.credentials.source,
        });
        return buildErrorResult(
          "ABR GUID not configured. Send 'X-ABR-Guid' header (hosted MCP) or set ABR_GUID env var, or use validate_abn for offline checksum validation.",
        );
      }
      const result = await lookupAbn(abn, guid);
      const isError = isAbrError(result);
      await ctx.telemetry.recordCall(ctx.installId, {
        toolName: "lookup_abn",
        status: isError ? "error" : "ok",
        durationMs: Date.now() - start,
        credentialSource: ctx.credentials.source,
      });
      if (isError) {
        return buildErrorResult(result.error);
      }
      return buildToolResult(ctx, "lookup_abn", result);
    },
  );

  server.registerTool(
    "search_business_by_name",
    {
      title: "Search ABR by business name",
      description:
        "Search the Australian Business Register by business or entity name. Returns up to maxResults matching businesses with their ABN, name, state and confidence score.",
      inputSchema: {
        name: z.string().min(2).describe("Business or entity name (at least 2 characters)."),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of results to return (default 8, max 50)."),
      },
    },
    async ({ name, maxResults }) => {
      const start = Date.now();
      const guid = ctx.credentials.abrGuid ?? ctx.config.abr.guid;
      if (!guid) {
        await ctx.telemetry.recordCall(ctx.installId, {
          toolName: "search_business_by_name",
          status: "error",
          durationMs: Date.now() - start,
          credentialSource: ctx.credentials.source,
        });
        return buildErrorResult(
          "ABR GUID not configured. Send 'X-ABR-Guid' header (hosted MCP) or set ABR_GUID env var.",
        );
      }
      const result = await searchByName(name, guid, maxResults ?? 8);
      const isError = !Array.isArray(result) && isAbrError(result);
      await ctx.telemetry.recordCall(ctx.installId, {
        toolName: "search_business_by_name",
        status: isError ? "error" : "ok",
        durationMs: Date.now() - start,
        credentialSource: ctx.credentials.source,
      });
      if (isError) {
        return buildErrorResult((result as { error: string }).error);
      }
      return buildToolResult(ctx, "search_business_by_name", {
        matches: result,
        count: (result as unknown[]).length,
      });
    },
  );
}
