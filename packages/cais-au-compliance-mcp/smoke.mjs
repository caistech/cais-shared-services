// Smoke test — start the server via tsx, send initialize + tools/list, read responses.
// Not a full test suite; just confirms tool registration works end-to-end.

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsxBin = process.platform === "win32" ? "tsx.cmd" : "tsx";
const tsx = resolve(__dirname, "../../node_modules/.bin/" + tsxBin);
const server = resolve(__dirname, "src/bin.ts");

const child = spawn(tsx, [server], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: process.platform === "win32",
});

child.stderr.on("data", (chunk) => {
  process.stderr.write("[child stderr] " + chunk.toString());
});

child.on("error", (err) => {
  console.error("[child error]", err);
  process.exit(4);
});

let buffer = "";
let toolCount = 0;
let exitCode = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === 1 && msg.result) {
      const initialize = msg.result;
      console.log("initialize OK — server:", initialize.serverInfo?.name, initialize.serverInfo?.version);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
    } else if (msg.id === 2 && msg.result?.tools) {
      toolCount = msg.result.tools.length;
      console.log("tools/list OK — tool count:", toolCount);
      console.log("tool names:", msg.result.tools.map((t) => t.name).join(", "));
      exitCode = toolCount === 8 ? 0 : 2;
      child.stdin.end();
    }
  }
});

child.on("exit", () => {
  process.exit(exitCode);
});

child.stdin.write(
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0" },
    },
  }) + "\n",
);

setTimeout(() => {
  console.error("timeout — no response in 10s");
  child.kill();
  process.exit(3);
}, 10000);
