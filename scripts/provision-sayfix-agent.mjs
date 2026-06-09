#!/usr/bin/env node
/**
 * scripts/provision-sayfix-agent.mjs
 *
 * Provision a per-project, repo-aware ElevenLabs ConvAI agent for a SayFix project and
 * write its id onto SayFix's repos.voice_agent_id (which the SayFix app renders).
 *
 * Grounding (§15, "repo digest + knowledge base"): builds a digest of the repo
 * (README + CLAUDE.md + package.json + file tree via gh) and embeds it in the agent's
 * system prompt so the agent "knows the product + how it's built." (If the hub package
 * later exposes a knowledge-base upload, switch the digest there.)
 *
 * Consumes @caistech/elevenlabs-convai (local workspace — no GITHUB_PACKAGES_TOKEN needed
 * here), honoring the @caistech-first / fork rules.
 *
 * Usage:  node scripts/provision-sayfix-agent.mjs <github_owner> <github_repo>
 * Env:    ELEVENLABS_API_KEY (or in sayfix/.env.local). gh must be authed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [owner, repo] = process.argv.slice(2);
if (!owner || !repo) {
  console.error("Usage: node scripts/provision-sayfix-agent.mjs <github_owner> <github_repo>");
  process.exit(1);
}

const SAYFIX_ENV = join(homedir(), "PycharmProjects", "sayfix", ".env.local");
let env = "";
try { env = readFileSync(SAYFIX_ENV, "utf8"); } catch { console.error("Cannot read sayfix/.env.local"); process.exit(1); }
const envGet = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1];

const SUPA_URL = envGet("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY = envGet("SUPABASE_SERVICE_ROLE_KEY");
const ELEVEN = process.env.ELEVENLABS_API_KEY || envGet("ELEVENLABS_API_KEY");
if (!ELEVEN) { console.error("ELEVENLABS_API_KEY not set and not in sayfix/.env.local"); process.exit(1); }
if (!SUPA_URL || !SUPA_KEY) { console.error("Supabase creds missing from sayfix/.env.local"); process.exit(1); }

// --- repo digest (truncated) ---
const ghContent = (path) => {
  try {
    const b64 = execFileSync("gh", ["api", `repos/${owner}/${repo}/contents/${path}`, "--jq", ".content"], { encoding: "utf8" });
    return Buffer.from(b64.replace(/\s/g, ""), "base64").toString("utf8").slice(0, 4000);
  } catch { return ""; }
};
// Product CONTEXT only — NOT the code. Claude Code reads the code at fix time; the discovery
// agent just needs to know what the product is + its user-facing screens to ask good questions.
let screens = "";
try {
  screens = execFileSync("gh", ["api", `repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, "--jq", ".tree[].path"], { encoding: "utf8" })
    .split("\n")
    .filter((p) => /(^|\/)(src\/)?(app|pages)\/.*page\.[tj]sx?$/.test(p))
    .map((p) => "/" + p.replace(/^.*?(src\/)?(app|pages)\//, "").replace(/\/?page\.[tj]sx?$/, "").replace(/\(.*?\)\//g, ""))
    .filter((v, i, a) => v !== "/" + "" && a.indexOf(v) === i)
    .slice(0, 40)
    .join("\n");
} catch { /* repo may be empty */ }

const digest = [
  `PRODUCT: ${repo}`,
  `\n=== WHAT IT IS ===\n${ghContent("README.md")}`,
  `\n=== USER-FACING SCREENS ===\n${screens || "(not detected — ask the user to describe the screen)"}`,
].join("\n").slice(0, 5000);

const systemPrompt =
  `You are SayFix's guide for "${repo}", talking to a NON-TECHNICAL person who has a problem with it. ` +
  `You run two plain-language jobs (never developer jargon — no "repo", "PR", "deploy", "bug", "API"):\n\n` +
  `1) DISCOVERY. Understand the problem in their own words: what they were trying to do, which screen, what ` +
  `they expected, what actually happened. Ask ONE clear question at a time. You know what ${repo} does and its ` +
  `main screens (below) — just enough to ask good questions and recognise what they mean. You do NOT know or ` +
  `change the code; the engineers do that from your summary. When it's clear, summarise it back plainly, confirm, ` +
  `and tell them you'll get it built.\n\n` +
  `2) REVIEW. When a fix is built, a preview appears on screen. Invite them to look ("here's your change — take a ` +
  `look on the page"). If they're happy, capture their approval. If not, ask what's still off — that's a new round ` +
  `of discovery. Keep going until they're happy.\n\n` +
  `You never touch the code and you never decide what ships — you elicit, present, and capture approval.\n\n` +
  `PRODUCT CONTEXT (for grounding your questions, not for fixing):\n${digest}`;

// --- provision via the hub package ---
let provisionVoiceAgent, createConversationTools, conversationContinuityPrompt;
try { ({ provisionVoiceAgent, createConversationTools, conversationContinuityPrompt } = await import("@caistech/elevenlabs-convai")); }
catch (e) {
  console.error(`Could not import @caistech/elevenlabs-convai (run npm install in cais-shared-services): ${e.message}`);
  process.exit(1);
}

// Idempotency key: re-use the agent already on this repo's row so re-running UPDATES in place
// (new model, tools, webhook) instead of creating a duplicate.
let existingAgentId;
try {
  const exRes = await fetch(
    `${SUPA_URL}/rest/v1/repos?select=voice_agent_id&github_owner=eq.${owner}&github_repo=eq.${repo}`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
  );
  if (exRes.ok) existingAgentId = (await exRes.json())?.[0]?.voice_agent_id || undefined;
} catch { /* first provision — none yet */ }

const baseUrl = "https://sayfix.vercel.app";
let result;
try {
  result = await provisionVoiceAgent(ELEVEN, {
    config: {
      agentName: `SayFix — ${repo}`,
      voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
      // gpt-4.1-mini, NOT gpt-4o-mini: the older model DROPS TOOL CALLS over a long call, so the
      // memory tools (get_conversation_context / save_*) silently stop firing past the first turn
      // (the bug that kept the loop from ever producing jobs). See bug-knowledge.json
      // convai-gpt4o-mini-drops-tool-calls-long-calls.
      llmModel: "gpt-4.1-mini",
      temperature: 0.4,
      voiceModel: "eleven_turbo_v2",
    },
    // Continuity prompt teaches the agent to call get_conversation_context at the start of every
    // call and to save_message / save_memory / update_conversation_topic as it goes.
    systemPrompt: systemPrompt + conversationContinuityPrompt,
    firstMessage: `Hi! I'm here to help with ${repo}. What's not working?`,
    baseUrl,
    // The five memory tools, pointing at SayFix's /api/convai/webhooks/* routes.
    tools: createConversationTools(baseUrl),
    // Bind the post-call workspace webhook to our post_call route (distil + persist).
    postCallWebhookPath: "/api/convai/webhooks/post_call",
    allowedOrigins: [baseUrl, "https://*.vercel.app", "http://localhost:3000"],
    existingAgentId,
  });
} catch (e) {
  console.error(`provisionVoiceAgent failed: ${e.message}`);
  process.exit(1);
}

const agentId = result?.agentId || result?.agent_id;
if (!agentId) { console.error("provision returned no agentId"); process.exit(1); }

// --- write voice_agent_id onto SayFix's repos row ---
const r = await fetch(
  `${SUPA_URL}/rest/v1/repos?github_owner=eq.${owner}&github_repo=eq.${repo}`,
  {
    method: "PATCH",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ voice_agent_id: agentId }),
  },
);
console.log(
  r.ok
    ? `✓ agent ${agentId} provisioned + written to repos(${owner}/${repo}). SayFix will render it on that project's intake.`
    : `agent ${agentId} created but repos update failed (HTTP ${r.status}) — set voice_agent_id manually.`,
);

// --- convai_agents row (REQUIRED) — the memory webhook handlers look the agent up by
//     elevenlabs_agent_id; without this row start_conversation returns "Agent not found" and the
//     loop never recalls/persists. System-owned (zero UUID); the webhook routes use service role. ---
const SYSTEM_OWNER = "00000000-0000-0000-0000-000000000000";
const ar = await fetch(`${SUPA_URL}/rest/v1/convai_agents?on_conflict=elevenlabs_agent_id`, {
  method: "POST",
  headers: {
    apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify({ user_id: SYSTEM_OWNER, agent_name: `SayFix — ${repo}`, elevenlabs_agent_id: agentId, status: "active" }),
});
console.log(ar.ok ? `✓ convai_agents row upserted for ${agentId}.` : `⚠ convai_agents upsert failed (HTTP ${ar.status} ${await ar.text()}) — the memory loop will report "Agent not found" until this row exists.`);

// --- webhook secret (shown ONLY when the workspace webhook was just created) ---
if (result.webhookSecret) {
  console.log(`\n⚑ POST-CALL WEBHOOK SECRET (set as ELEVENLABS_WEBHOOK_SECRET in sayfix .env.local + Vercel, sensitive, prod+preview):\n   ${result.webhookSecret}\n   Without it the post_call route still runs but skips HMAC verification.`);
} else {
  console.log(`\n(No new webhook secret returned — an existing workspace webhook for ${baseUrl} was reused. Keep the ELEVENLABS_WEBHOOK_SECRET you already stored.)`);
}
