#!/usr/bin/env node
/**
 * apply-agent-readiness.mjs — turnkey rollout of @caistech/webmcp-kit into a Next.js App Router repo.
 *
 * Wires PRODUCT_STANDARDS §11 Layer 1 (DISCOVERABLE) into a consumer with one command:
 *   - installs @caistech/webmcp-kit
 *   - writes <appBase>/agent-readiness.config.ts (from the config you pass)
 *   - writes app/llms.txt/route.ts + app/.well-known/agent.json/route.ts
 *   - prints the single <AgentJsonLd/> line + the target landing layout to paste it into
 *
 * It deliberately does NOT edit the landing layout automatically (every repo's layout differs — a
 * blind insert is the fragile step) and does NOT commit or deploy (outward-facing — operator/CI).
 *
 * Usage:
 *   node apply-agent-readiness.mjs --repo <path> --config <config.json> [--install] [--dry]
 *
 * The config JSON is an AgentReadinessConfig (see @caistech/webmcp-kit README). `url` MUST be the
 * product's real, PUBLIC canonical prod URL — a wrong/SSO-walled URL bakes a dead pointer into
 * llms.txt + JSON-LD, which is worse than shipping nothing. The script refuses a placeholder url.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

function arg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const repo = arg("--repo");
const configPath = arg("--config");
const doInstall = arg("--install", false);
const dry = arg("--dry", false);

if (!repo || !configPath) {
  console.error("Usage: node apply-agent-readiness.mjs --repo <path> --config <config.json> [--install] [--dry]");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));

// Guard: refuse a placeholder / obviously-wrong canonical URL.
if (!config.url || /TODO|example\.com|localhost|<.*>/.test(config.url) || !/^https:\/\//.test(config.url)) {
  console.error(`✗ config.url must be the product's real public https:// prod URL — got: ${JSON.stringify(config.url)}`);
  console.error("  (A wrong URL bakes a dead pointer into llms.txt + JSON-LD portfolio-wide. Fix it first.)");
  process.exit(2);
}

// Resolve the app dir + the "@/" alias base (src/app + src, or app + repo-root, incl. apps/web/*).
const candidates = [
  { app: "apps/web/src/app", base: "apps/web/src", aliasRootIsSrc: true },
  { app: "apps/web/app", base: "apps/web", aliasRootIsSrc: false },
  { app: "src/app", base: "src", aliasRootIsSrc: true },
  { app: "app", base: ".", aliasRootIsSrc: false },
];
const layout = candidates.find((c) => existsSync(join(repo, c.app)));
if (!layout) {
  console.error(`✗ ${repo} is not a Next.js App Router repo (no src/app or app dir). Skip / handle separately.`);
  process.exit(3);
}

const appDir = join(repo, layout.app);
const baseDir = join(repo, layout.base);
const aliasImport = "@/agent-readiness.config"; // @ → base (src or root); config lives at base root

const files = [
  {
    path: join(baseDir, "agent-readiness.config.ts"),
    body:
      `import type { AgentReadinessConfig } from "@caistech/webmcp-kit";\n\n` +
      `// PRODUCT_STANDARDS §11 Layer 1 (DISCOVERABLE). Drives /llms.txt, landing JSON-LD, /.well-known/agent.json.\n` +
      `export const agentConfig: AgentReadinessConfig = ${JSON.stringify(config, null, 2)};\n`,
  },
  {
    path: join(appDir, "llms.txt", "route.ts"),
    body:
      `import { llmsTxtHandler } from "@caistech/webmcp-kit";\n` +
      `import { agentConfig } from "${aliasImport}";\n\n` +
      `export const GET = llmsTxtHandler(agentConfig);\n` +
      `export const dynamic = "force-static";\n`,
  },
  {
    path: join(appDir, ".well-known", "agent.json", "route.ts"),
    body:
      `import { agentManifestHandler } from "@caistech/webmcp-kit";\n` +
      `import { agentConfig } from "${aliasImport}";\n\n` +
      `export const GET = agentManifestHandler(agentConfig);\n` +
      `export const dynamic = "force-static";\n`,
  },
];

console.log(`\n▸ ${config.name}  (${repo})`);
console.log(`  app dir: ${layout.app}   config: ${layout.base}/agent-readiness.config.ts`);

for (const f of files) {
  if (dry) {
    console.log(`  [dry] would write ${f.path.replace(repo, ".")}`);
    continue;
  }
  mkdirSync(join(f.path, ".."), { recursive: true });
  writeFileSync(f.path, f.body);
  console.log(`  ✓ wrote ${f.path.replace(repo, ".")}`);
}

if (doInstall && !dry) {
  console.log("  installing @caistech/webmcp-kit ...");
  const pm = existsSync(join(repo, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(repo, "yarn.lock")) ? "yarn" : "npm";
  const cmd =
    pm === "pnpm"
      ? `pnpm add @caistech/webmcp-kit@latest`
      : pm === "yarn"
        ? `yarn add @caistech/webmcp-kit@latest`
        : `npm install @caistech/webmcp-kit@latest`;
  // For a monorepo (apps/web), install into that workspace.
  const cwd = layout.app.startsWith("apps/web") ? join(repo) : repo;
  const filter = layout.app.startsWith("apps/web") && pm === "pnpm" ? " --filter ./apps/web" : "";
  execSync(cmd + filter, { cwd, stdio: "inherit" });
}

// Print the one manual step (safe: no blind layout edit).
const landing = existsSync(join(appDir, "(marketing)", "layout.tsx"))
  ? `${layout.app}/(marketing)/layout.tsx`
  : `${layout.app}/layout.tsx  (or the public landing page)`;

console.log(`\n  MANUAL (1 line) — add to the PUBLIC landing layout: ${landing}`);
console.log(`    import { AgentJsonLd } from "@caistech/webmcp-kit/react";`);
console.log(`    import { agentConfig } from "${aliasImport}";`);
console.log(`    // ...then render <AgentJsonLd config={agentConfig} /> at the top of the returned tree.`);
console.log(`\n  VERIFY after build/deploy:`);
console.log(`    curl -s ${config.url}/llms.txt | head`);
console.log(`    curl -s ${config.url}/.well-known/agent.json | head`);
console.log("");
