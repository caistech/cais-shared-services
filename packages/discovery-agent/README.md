# @caistech/discovery-agent

A **config-driven AI voice discovery/interview agent**. A consuming product supplies only its
*purpose*, *persona*, *question arc*, *extraction schema*, and *result sink* — the shared
orchestration (ElevenLabs agent provisioning, the staged conversation with per-stage re-grounding,
the persistent memory loop, the HMAC-verified post-call webhook, and the transcript → structured
extraction) lives here. Built on **`@caistech/elevenlabs-convai`** — it does **not** re-implement
voice. It is the extraction of the pattern forked in Connexions, LingoPure, and Singify.

The frontier extraction step (transcript → schema) runs through an **injected `StructuredRunner`**
(the "inject any LLM" pattern), so the package carries no model SDK weight and stays unit-testable.

## Install

```bash
npm install @caistech/discovery-agent
# peers: @caistech/elevenlabs-convai, @supabase/supabase-js, @elevenlabs/react, react, zod
```

## The one surface a product customises

```ts
import { z } from "zod";
import { defineDiscovery } from "@caistech/discovery-agent";
import { createClient } from "@supabase/supabase-js";

const outcome = z.object({
  workingOn: z.string(),
  blocker: z.string(),
  painSeverity: z.number().min(0).max(10),
});

const kindred = defineDiscovery(
  {
    slug: "kindred",
    purpose: "Understand what the writer is working on and where they're stuck.",
    persona: {
      name: "Kindred",
      voiceId: process.env.KINDRED_VOICE_ID!,
      opening: "Hi, I'm Kindred — what are you working on today?",
      signature: "Talk soon.",
      systemPrompt: "You are Kindred, a warm, curious co-writer.",
    },
    stages: [
      { id: "warmup", goal: "Build rapport", context: "First contact — keep it light.", mustCover: ["their name"] },
      { id: "problem", goal: "Find the blocker", context: "Dig into the specific stuck point." },
    ],
    extraction: {
      schema: outcome,
      system: "Distil the interview into the schema. Be faithful; do not invent.",
      model: { provider: "anthropic", model: "claude-fable-5" }, // frontier tier for the judgment
      requireEvidence: true,
    },
    // PUSH what we already know so the agent walks in informed:
    primeContext: async (subjectId) => `You already know this writer prefers literary fiction.`,
    onResult: async (result, meta) => {
      await db.from("discovery_results").insert({ subject_id: meta.subjectId, ...result });
    },
    interviewModel: { provider: "openrouter", model: "gpt-4.1-mini" }, // cheap tier for the live call
  },
  {
    runner: myRunner, // see below
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
    sessionSecret: process.env.DISCOVERY_SESSION_SECRET!,
    supabase: createClient(url, serviceRoleKey), // service-role
    baseUrl: process.env.NEXT_PUBLIC_APP_URL!,
    existingAgentId: process.env.KINDRED_AGENT_ID, // from provision(), see below
    postCallSecret: process.env.KINDRED_WEBHOOK_SECRET, // from provision()
    toolSecret: process.env.CONVAI_TOOL_SECRET, // REQUIRED in any env with real users — see Security
    requireToolSecret: Boolean(process.env.CONVAI_TOOL_SECRET),
  }
);
```

> **Security (memory-loop webhooks).** Without `toolSecret` the `recall_memory` / `save_memory`
> routes are UNAUTHENTICATED — identity is derived from the public agent id, so anyone with the
> id can read/write conversation memory. Set `toolSecret` (and `requireToolSecret: true`), then
> REPROVISION the agent so its tools carry the `x-convai-tool-secret` header — `provision()`
> bakes it in automatically when `deps.toolSecret` is set.

### 1. Provision once (a script / one-off)

```ts
const { agentId, webhookSecret } = await kindred.provision();
// store agentId -> KINDRED_AGENT_ID, webhookSecret -> KINDRED_WEBHOOK_SECRET, then redeploy.
```

`provision()` is idempotent (pass `existingAgentId` to update in place). It builds the system prompt
from persona + purpose + the stage arc, wires the memory-loop tools, sets the allowlist, and enables
per-session prompt overrides.

### 2. Start a session (server route)

```ts
const session = await kindred.startSession(subjectId); // { token, agentId, promptOverride? }
// return `session` to the client; the token carries identity (verified server-side).
```

### 3. The webhook routes (`app/api/convai/webhooks/[...]/route.ts`)

```ts
const routes = kindred.webhookRoutes();
export const POST = routes.postCall; // + startConversation/saveMessage/recallMemory/saveMemory/updateTopic
```

On completion the post-call route pulls the transcript from ElevenLabs, runs `distil` (the frontier
extraction), and calls your `onResult`.

### 4. The client widget

```tsx
import { DiscoveryWidget } from "@caistech/discovery-agent/react";

<DiscoveryWidget config={kindred.config} session={session} activeStageId={stageId} onEnd={save} />;
```

The widget mounts the base `VoiceWidget` with the pushed prompt override, re-grounds the agent each
time `activeStageId` changes, and runs the browser wrap-up timer (a spoken "~N min left" nudge +
banner at `maxDurationSeconds − wrapWarningSeconds`).

## Injecting the extraction runner

The package never constructs an LLM client. Provide a `StructuredRunner` — a ~15-line Anthropic one
(using `@caistech/ai-client` for the client config + `@anthropic-ai/sdk` tool-use for structured
output):

```ts
import Anthropic from "@anthropic-ai/sdk";
import { getClaudeClientConfig, resolveClaudeModel } from "@caistech/ai-client";
import type { StructuredRunner } from "@caistech/discovery-agent";

export const myRunner: StructuredRunner = {
  async run({ model, system, input, schema }) {
    const client = new Anthropic(getClaudeClientConfig({ anthropicKey: process.env.ANTHROPIC_API_KEY }));
    const res = await client.messages.create({
      model: resolveClaudeModel({ override: model.model }),
      max_tokens: 2048,
      system,
      tools: [{ name: "emit", description: "Return the structured result", input_schema: toJsonSchema(schema) }],
      tool_choice: { type: "tool", name: "emit" },
      messages: [{ role: "user", content: input }],
    });
    const tool = res.content.find((c) => c.type === "tool_use");
    return { result: schema.parse(tool && "input" in tool ? tool.input : {}) };
  },
};
```

`toJsonSchema` is whatever you already use (e.g. `zod-to-json-schema`) — kept out of this package so
it carries no schema-conversion dependency.

## Design notes

- **Identity is server-derived + unforgeable.** The client holds only the signed session token; the
  webhook's `resolveSession` verifies it to recover the subject id (never a bare client-asserted id)
  — the VOICE_MEMORY_STANDARD rule.
- **Model tiering is the point.** A cheap `interviewModel` runs the live call; the frontier
  `extraction.model` runs the judgment. Encode the judgment once, run it forever.
- **Stages are embedded in the prompt** (ElevenLabs agents take one prompt string); the client
  re-grounds per stage via contextual updates.

## Status

v0.1.0. The orchestration + convai wiring is implemented and unit-tested (`vitest`). Live
provisioning + webhook flow require an ElevenLabs key + a Supabase service-role client.
