/**
 * Sanctions screening — thin adapter over @caistech/sanctions-screen.
 *
 * 1 tool:
 *   - screen_subject  (screen a person or entity across OFAC SDN, UN, AU DFAT,
 *                      UK HM Treasury, EU consolidated lists; fuzzy match)
 *
 * Providers fetch their lists from public source URLs on first call and
 * cache in-process. Refresh happens via the package's internal cache logic.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createScreener,
  createOfacSdnProvider,
  createUnConsolidatedProvider,
  createUkHmTreasuryProvider,
  createAuDfatProvider,
  createEuSanctionsProvider,
} from "@caistech/sanctions-screen";
import type {
  SanctionsScreener,
  SanctionsList,
} from "@caistech/sanctions-screen";

import type { ToolContext } from "./types.js";
import { buildToolResult } from "./result.js";

const SANCTIONS_LISTS: readonly SanctionsList[] = [
  "ofac_sdn",
  "un_consolidated",
  "au_dfat",
  "eu_sanctions",
  "uk_hm_treasury",
] as const;

const MATCH_MODES = ["strict", "balanced", "lenient"] as const;
const SUBJECT_TYPES = ["entity", "person"] as const;

let screenerSingleton: SanctionsScreener | null = null;

function getScreener(): SanctionsScreener {
  if (screenerSingleton === null) {
    screenerSingleton = createScreener([
      createOfacSdnProvider(),
      createUnConsolidatedProvider(),
      createUkHmTreasuryProvider(),
      createAuDfatProvider(),
      createEuSanctionsProvider(),
    ]);
  }
  return screenerSingleton;
}

export function registerSanctionsTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "screen_subject",
    {
      title: "Screen subject against sanctions lists",
      description:
        "Screen a person or entity name against OFAC SDN, UN consolidated, AU DFAT, UK HM Treasury, and EU sanctions lists. Returns per-list hits with match type and score. Fuzzy matching is enabled by default; pass match_mode='strict' for exact-only.",
      inputSchema: {
        name: z.string().min(1).describe("Subject name to screen."),
        type: z
          .enum(SUBJECT_TYPES)
          .describe("'person' for individuals, 'entity' for companies / orgs."),
        aliases: z.array(z.string()).optional().describe("Optional known aliases / trading names."),
        nationality: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 nationality (optional)."),
        lists: z
          .array(z.enum(SANCTIONS_LISTS as unknown as [SanctionsList, ...SanctionsList[]]))
          .optional()
          .describe("Lists to query. Default: all five."),
        match_mode: z
          .enum(MATCH_MODES)
          .optional()
          .describe(
            "Match strictness: 'strict' = exact only, 'balanced' = exact + fuzzy ≥0.92 (default), 'lenient' = also fuzzy ≥0.85 + token overlap.",
          ),
      },
    },
    async ({ name, type, aliases, nationality, lists, match_mode }) => {
      const start = Date.now();
      const screener = getScreener();
      const result = await screener.screen({
        subjects: [{ name, type, aliases, nationality }],
        lists,
        matchMode: match_mode,
      });
      const status = result.fetchErrors.length > 0 ? "error" : "ok";
      await ctx.telemetry.recordCall({
        toolName: "screen_subject",
        status,
        durationMs: Date.now() - start,
      });
      const single = result.results[0];
      return buildToolResult(ctx, "screen_subject", {
        clean: single?.clean ?? true,
        hits: single?.hits ?? [],
        listsChecked: result.listsChecked,
        listVersions: result.listVersions,
        fetchErrors: result.fetchErrors,
      });
    },
  );
}
