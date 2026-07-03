#!/usr/bin/env node
/**
 * scripts/provision-interview-agent.mjs
 *
 * Provision the pipeline PROSPECT-INTERVIEW ConvAI agent (Stage 3 of the IP/Connexions
 * internalisation). Distinct from the in-app GUIDE agent that new-product.mjs provisions:
 * this is the public /interview/[token] voice agent that interviews discovered prospects,
 * with its post-call webhook bound to pipeline's own return-leg route.
 *
 * What it does (idempotent — re-running reuses the agent + workspace webhook):
 *   - provisionVoiceAgent with:
 *       postCallWebhookPath = /api/webhooks/convai-interview   (the in-process return-leg)
 *       enableOverrides     = true   (the page passes a per-prospect prompt + first message)
 *       NO memory tools — each interview is a single self-contained call (no cross-call recall).
 *   - prints the agent id  → set NEXT_PUBLIC_INTERVIEW_AGENT_ID (plain, prod+preview)
 *   - prints the webhook secret → set ELEVENLABS_WEBHOOK_SECRET (sensitive, prod+preview)
 *   - if VERCEL_TOKEN + VERCEL_TEAM are set, pushes NEXT_PUBLIC_INTERVIEW_AGENT_ID to the
 *     pipeline Vercel project for you.
 *
 * Consumes @caistech/elevenlabs-convai (the @caistech-first rule — never a forked provisioner).
 *
 * Usage:  node scripts/provision-interview-agent.mjs [--base-url https://...] [--existing agent_xxx]
 * Env:    ELEVENLABS_API_KEY (or in pipeline/.env.local). Optional: VERCEL_TOKEN, VERCEL_TEAM.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PIPELINE_ENV = join(homedir(), "PycharmProjects", "pipeline", ".env.local");
let env = "";
try { env = readFileSync(PIPELINE_ENV, "utf8"); } catch { /* env may live in process.env */ }
const envGet = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1];

const ELEVEN = process.env.ELEVENLABS_API_KEY || envGet("ELEVENLABS_API_KEY");
if (!ELEVEN) { console.error("ELEVENLABS_API_KEY not set and not in pipeline/.env.local"); process.exit(1); }

// The pipeline public URL — used to derive the post-call webhook URL + the allowlist.
const baseUrl = (
  arg("base-url", process.env.NEXT_PUBLIC_APP_URL || envGet("NEXT_PUBLIC_APP_URL") || "https://pipeline-corporate-ai-solutions.vercel.app")
).replace(/\/$/, "");
const existingAgentId = arg("existing", process.env.NEXT_PUBLIC_INTERVIEW_AGENT_ID || envGet("NEXT_PUBLIC_INTERVIEW_AGENT_ID") || undefined);

let provisionVoiceAgent;
try { ({ provisionVoiceAgent } = await import("@caistech/elevenlabs-convai")); }
catch (e) { console.error(`@caistech/elevenlabs-convai not importable (${e.message}). Build it in cais-shared-services + rerun.`); process.exit(1); }

const systemPrompt = [
  "You are a warm, concise research interviewer for the Corporate AI Solutions validation pipeline.",
  "Each call interviews ONE prospect about ONE product. The specific product, the prospect's name, and",
  "the exact questions to cover are supplied per call as a prompt override — follow that override.",
  "If for any reason no override arrives, introduce yourself, explain you're doing quick product research",
  "(no pitch), and ask open questions about the prospect's problem, their current solution, and whether the",
  "product would help. Be genuinely curious, keep it to ~5-8 minutes, thank them by name, and never invent",
  "facts about the product.",
].join(" ");

let result;
try {
  result = await provisionVoiceAgent(ELEVEN, {
    config: {
      agentName: "Pipeline — prospect interview",
      voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
      llmModel: "gpt-4.1-mini", // gpt-4o-mini drops tool calls over long calls (bug-knowledge)
      temperature: 0.5,
      voiceModel: "eleven_turbo_v2",
    },
    systemPrompt,
    firstMessage: "Hi, thanks for taking a moment — I'm doing a quick bit of product research, no pitch. Is now an okay time for a few questions?",
    baseUrl,
    // Bind the post-call workspace webhook to pipeline's in-process return-leg.
    postCallWebhookPath: "/api/webhooks/convai-interview",
    // The interview page passes a per-prospect prompt + first message as an override.
    enableOverrides: true,
    allowedOrigins: [baseUrl, "https://*.vercel.app", "http://localhost:3000"],
    existingAgentId,
  });
} catch (e) {
  console.error(`provisionVoiceAgent failed: ${e.message}`);
  process.exit(1);
}

const agentId = result?.agentId || result?.agent_id;
if (!agentId) { console.error("provision returned no agentId"); process.exit(1); }
console.log(`\n✓ interview agent provisioned: ${agentId} (${result.created ? "created" : "reused"})`);

// Optionally push NEXT_PUBLIC_INTERVIEW_AGENT_ID to the pipeline Vercel project.
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM = process.env.VERCEL_TEAM;
if (VERCEL_TOKEN) {
  const teamQ = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : "";
  try {
    const r = await fetch(`https://api.vercel.com/v10/projects/pipeline/env${teamQ}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: "NEXT_PUBLIC_INTERVIEW_AGENT_ID", value: agentId, type: "plain", target: ["production", "preview"] }),
    });
    console.log(r.ok
      ? "✓ NEXT_PUBLIC_INTERVIEW_AGENT_ID pushed to the pipeline Vercel project (plain, prod+preview)."
      : `⚠ Vercel env push failed (HTTP ${r.status}) — set NEXT_PUBLIC_INTERVIEW_AGENT_ID=${agentId} manually.`);
  } catch (e) {
    console.log(`⚠ Vercel env push threw (${e.message}) — set NEXT_PUBLIC_INTERVIEW_AGENT_ID=${agentId} manually.`);
  }
} else {
  console.log(`\n→ Set on the pipeline Vercel project (plain, prod+preview):\n   NEXT_PUBLIC_INTERVIEW_AGENT_ID=${agentId}`);
}

// Webhook secret — only returned when the workspace webhook was just created.
if (result.webhookSecret) {
  console.log(`\n⚑ POST-CALL WEBHOOK SECRET — set as ELEVENLABS_WEBHOOK_SECRET in pipeline .env.local + Vercel (sensitive, prod+preview):\n   ${result.webhookSecret}\n   Without it /api/webhooks/convai-interview runs but skips HMAC verification.`);
} else {
  console.log(`\n(No new webhook secret returned — an existing workspace webhook for ${baseUrl} was reused. Keep the ELEVENLABS_WEBHOOK_SECRET you already stored.)`);
}

console.log("\nNext: set the per-stream questions on each card via POST /api/methodology/cards/<slug>/interview-panel { stream, questions } (panel.agent_id is optional — the env fallback covers it).");
