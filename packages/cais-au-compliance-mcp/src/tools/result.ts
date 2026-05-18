/**
 * Tool result builders.
 *
 * Wraps payloads in the MCP content-block shape. Appends the funnel-prompt
 * appendix when the telemetry layer signals the threshold has been crossed.
 */

import { buildPromptAppendix } from "../interview.js";
import type { ToolContext } from "./types.js";

interface ToolContentBlock {
  type: "text";
  text: string;
  [key: string]: unknown;
}

interface ToolResultEnvelope {
  content: ToolContentBlock[];
  isError?: boolean;
  [key: string]: unknown;
}

export async function buildToolResult(
  ctx: ToolContext,
  toolName: string,
  payload: unknown,
): Promise<ToolResultEnvelope> {
  const blocks: ToolContentBlock[] = [
    { type: "text", text: JSON.stringify(payload, null, 2) },
  ];

  if (await ctx.telemetry.shouldPrompt(ctx.installId)) {
    const appendix = buildPromptAppendix(ctx.config.funnel, {
      installId: ctx.installId,
      triggeredByTool: toolName,
    });
    blocks.push({ type: "text", text: appendix });
    await ctx.telemetry.markPromptShown(ctx.installId);
  }

  return { content: blocks };
}

export function buildErrorResult(message: string): ToolResultEnvelope {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
