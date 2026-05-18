/**
 * CLI entrypoint — starts the MCP server over stdio.
 *
 * Used by:
 *   - `npm run dev`      → tsx src/bin.ts
 *   - `npm start`        → node dist/bin.js (once bundling lands)
 *   - Claude Code MCP config that points at this file
 *
 * Production HTTP-transport entrypoint (Vercel) goes in a sibling file once
 * @vercel/mcp-adapter is wired in.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const server = await buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", () => {
    void server.close().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("[cais-au-compliance-mcp] fatal", err);
  process.exit(1);
});
