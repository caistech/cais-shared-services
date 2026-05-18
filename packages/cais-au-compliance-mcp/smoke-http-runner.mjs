// Boots the Vercel function as a plain Node.js HTTP server on an ephemeral
// port. Used by smoke-http.mjs.

import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Import the handler via tsx-resolved path. Note: smoke-http runs this via
// tsx, so the .ts import works at runtime.
const handlerMod = await import("./api/mcp.ts");
const handler = handlerMod.default;

const server = http.createServer(async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error("[handler error]", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("internal error");
    }
  }
});

server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  console.log("listening on", port);
});

void require;
