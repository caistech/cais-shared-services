import { setAllowlist } from "../packages/elevenlabs-convai/src/index.ts";

const ELEVEN = process.env.ELEVENLABS_API_KEY;
if (!ELEVEN) {
  const fs = await import("fs");
  const env = fs.readFileSync("C:\\Users\\denni\\PycharmProjects\\sayfix\\.env.local", "utf8");
  const match = env.match(/ELEVENLABS_API_KEY=(.+)/);
  if (match) process.env.ELEVENLABS_API_KEY = match[1];
}

console.log("Updating agent allowlist...");
await setAllowlist(process.env.ELEVENLABS_API_KEY, "agent_5901kshtcbw1er2vzka3wp1dqts5", [
  "https://sayfix.vercel.app",
  "https://sayfix-corporate-ai-solutions.vercel.app",
  "https://*.vercel.app",
  "http://localhost:3000",
]);
console.log("Done!");
