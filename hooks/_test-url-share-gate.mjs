// Self-contained test for url-share-gate.mjs — no shell-path fragility.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "url-share-gate.mjs");
const DIR = join(HERE, ".tmp-test");
mkdirSync(DIR, { recursive: true });

function transcript(name, text) {
  const p = join(DIR, name);
  writeFileSync(p, JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } }) + "\n");
  return p;
}

function runHook(transcriptPath, cwd) {
  const payload = JSON.stringify({ transcript_path: transcriptPath, cwd });
  const r = spawnSync("node", [HOOK], { input: payload, encoding: "utf8" });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

const cases = [
  { name: "ALLOW — sayfix URL, PASS bound to live deploy",
    t: transcript("allow.jsonl", "All done. Try it live: https://sayfix.vercel.app"),
    cwd: "C:/Users/denni/PycharmProjects/sayfix", expect: "allow" },
  { name: "BLOCK — corporate-ai-solutions URL, no naive-tester PASS",
    t: transcript("block.jsonl", "Have a look: https://corporate-ai-solutions.vercel.app/admin/methodology"),
    cwd: "C:/Users/denni/PycharmProjects/Corporate-AI-Solutions", expect: "block" },
  { name: "ALLOW — no vercel URL in message",
    t: transcript("none.jsonl", "Build is green, all tests pass."),
    cwd: "C:/Users/denni/PycharmProjects/sayfix", expect: "allow" },
];

let pass = 0;
for (const c of cases) {
  const r = runHook(c.t, c.cwd);
  let decision = "allow";
  try { decision = JSON.parse(r.stdout).decision === "block" ? "block" : "allow"; } catch { decision = "allow"; }
  const ok = decision === c.expect;
  pass += ok ? 1 : 0;
  console.log(`${ok ? "✓" : "✗"} ${c.name}`);
  console.log(`    → decision=${decision} (expected ${c.expect})`);
  if (decision === "block") console.log(`    reason: ${JSON.parse(r.stdout).reason.slice(0, 120)}...`);
}
rmSync(DIR, { recursive: true, force: true });
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
