// HTTP smoke test — boots the Vercel function locally on an ephemeral port,
// POSTs initialize + tools/list, asserts the response shape.
//
// Proves the StreamableHTTPServerTransport JSON-response mode works
// before pushing to Vercel.

import http from "node:http";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsxBin = process.platform === "win32" ? "tsx.cmd" : "tsx";
const tsxPath = resolve(__dirname, "../../node_modules/.bin/" + tsxBin);

// Run the handler in a child process via tsx so ESM imports + @caistech
// workspace resolution work without a pre-build step.
const runnerPath = resolve(__dirname, "smoke-http-runner.mjs");
const child = spawn(tsxPath, [runnerPath], {
  stdio: ["inherit", "pipe", "inherit"],
  shell: process.platform === "win32",
});

let port = 0;
let portResolved;
const portReady = new Promise((res) => (portResolved = res));

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write("[server] " + text);
  const match = text.match(/listening on (\d+)/);
  if (match) {
    port = parseInt(match[1], 10);
    portResolved(port);
  }
});

const overallTimeout = setTimeout(() => {
  console.error("FAIL: overall timeout");
  child.kill();
  process.exit(3);
}, 30000);

await portReady;

async function rpcCall(payload) {
  const body = JSON.stringify(payload);
  return new Promise((res, rej) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/mcp",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (resp) => {
        const chunks = [];
        resp.on("data", (c) => chunks.push(c));
        resp.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          res({ status: resp.statusCode, raw });
        });
        resp.on("error", rej);
      },
    );
    req.on("error", rej);
    req.write(body);
    req.end();
  });
}

try {
  const initResp = await rpcCall({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-http", version: "0" },
    },
  });
  if (initResp.status !== 200) {
    console.error("FAIL: initialize status", initResp.status, initResp.raw.slice(0, 400));
    child.kill();
    process.exit(2);
  }
  const initJson = JSON.parse(initResp.raw);
  console.log("initialize OK — server:", initJson.result?.serverInfo?.name);

  const toolsResp = await rpcCall({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  if (toolsResp.status !== 200) {
    console.error("FAIL: tools/list status", toolsResp.status, toolsResp.raw.slice(0, 400));
    child.kill();
    process.exit(2);
  }
  const toolsJson = JSON.parse(toolsResp.raw);
  const tools = toolsJson.result?.tools ?? [];
  console.log("tools/list OK — count:", tools.length);
  console.log("tools:", tools.map((t) => t.name).join(", "));

  clearTimeout(overallTimeout);
  child.kill();
  process.exit(tools.length === 8 ? 0 : 4);
} catch (err) {
  console.error("FAIL:", err);
  child.kill();
  process.exit(5);
}
