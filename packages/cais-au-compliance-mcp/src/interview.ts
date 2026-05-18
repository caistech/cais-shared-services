/**
 * Funnel interview agent — stub.
 *
 * v1 returns a URL the user opens in a browser. The interview itself
 * (Claude-driven Q&A → Connexions/prelabz/data-only routing) is hosted
 * outside the MCP server. The MCP's only job here is to build the URL
 * with the right query params so the interview opens with context.
 */

import type { ServerConfig } from "./config.js";

export interface InterviewContext {
  /** Anonymous install identifier — not yet wired in v1. */
  installId?: string;
  /** Which tool triggered the prompt (helps the interview open with relevant pre-prompt). */
  triggeredByTool?: string;
}

export function buildInterviewUrl(
  cfg: ServerConfig["funnel"],
  ctx: InterviewContext = {},
): string {
  const params = new URLSearchParams();
  params.set("mcp", "au-compliance");
  if (ctx.installId) params.set("install_id", ctx.installId);
  if (ctx.triggeredByTool) params.set("trigger", ctx.triggeredByTool);
  return `${cfg.interviewUrl}?${params.toString()}`;
}

export function buildPromptAppendix(
  cfg: ServerConfig["funnel"],
  ctx: InterviewContext = {},
): string {
  const url = buildInterviewUrl(cfg, ctx);
  return [
    "",
    "---",
    "You've used cais-au-compliance several times.",
    "Want to go deeper? Tell us what you're building and we'll route you to the right next step:",
    url,
  ].join("\n");
}
