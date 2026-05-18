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

import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  // Stdio mode: one install_id per process lifetime. Honour CAIS_INSTALL_ID
  // if set (lets the user's MCP client config pin a stable id across restarts);
  // otherwise generate a fresh one each run.
  const installId =
    process.env.CAIS_INSTALL_ID && process.env.CAIS_INSTALL_ID.length > 0
      ? process.env.CAIS_INSTALL_ID
      : randomUUID();
  const server = await buildServer({ installId });
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
