/**
 * Vercel function entrypoint — Streamable HTTP transport.
 *
 * Each request creates a fresh server + transport pair (stateless mode).
 * Suits the MCP architecture: tools are pure functions over @caistech/*
 * packages; no per-session state worth carrying across requests at this
 * layer (telemetry has its own persistence concerns handled separately).
 *
 * Production: deployed as a Vercel serverless function. URL pattern:
 *   https://<vercel-project>.vercel.app/api/mcp
 *   (and eventually https://mcp.cais.au/compliance once the custom
 *    domain is provisioned).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Import from source. Vercel's esbuild + TypeScript moduleResolution:bundler
// both resolve "../src/server.js" to "../src/server.ts" — the .js extension
// is the conventional emitted-JS reference even though only .ts exists.
import { buildServer } from "../src/server.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // CORS — MCP clients (Claude Code, Cowork, marketplace installers)
  // hit this from arbitrary origins. Allow all + the MCP-specific headers.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Mcp-Session-Id, Authorization",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  let body: unknown;
  if (req.method === "POST") {
    body = await readJsonBody(req);
  }

  const server = await buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("[cais-au-compliance-mcp/api] handler error", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        }),
      );
    }
  } finally {
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
