# @caistech/elevenlabs-convai

Shared ElevenLabs Conversational AI service. Originated in Kira. Provides the full voice conversation loop with persistent memory: idempotent agent provisioning, drop-in Next.js webhook routes, conversation continuity, and ephemeral anonymous sessions.

> Server-side entry point. The React `VoiceWidget` ships from the subpath `@caistech/elevenlabs-convai/react` (in progress) so this entry stays React-free for server-only consumers.

## What this replaces

If you're currently building voice with MediaRecorder + STT API + LLM API + TTS API + browser audio glue... stop. ElevenLabs ConvAI handles the entire duplex voice loop over a single WebSocket. This module provides the server-side infrastructure around it.

## Contents

| File | Purpose |
|------|---------|
| `types.ts` | All TypeScript types (agent config, webhook payloads, memory, etc.) |
| `agent-client.ts` | Server-side agent CRUD (create, update, delete, get, conversation history) |
| `webhook.ts` | Signature verification + payload parsing for ElevenLabs webhooks |
| `webhook-handlers.ts` | Generic Supabase handlers: start conversation, save message, update topic, recall/save memory, post-call transcript |
| `provision.ts` | Idempotent `provisionVoiceAgent()` — agent create/adopt, allowlist, workspace-scoped webhook bind, override enablement |
| `routes.ts` | `createConvaiWebhookRoutes()` — Next.js route factory wrapping the handlers (400/401/500 + signature) |
| `session.ts` | Ephemeral anonymous-session tokens (HMAC) — no cross-session anon memory |
| `conversation-tools.ts` | Tool definitions the agent calls during conversation (memory, context, topics) |
| `migration.sql` | Supabase tables: agents, conversations, messages, memory, anon-sessions + RPC + RLS + purge |
| `index.ts` | Barrel export |

## Setup

1. Install: `npm install @caistech/elevenlabs-convai --legacy-peer-deps` (add `@caistech:registry=https://npm.pkg.github.com` to `.npmrc`).
2. Install peers your usage needs: `@supabase/supabase-js` (handlers/routes), `@elevenlabs/react` (the widget, when consuming the `/react` subpath).
3. Apply `migration.sql` to your Supabase project (or pass `tableNames` to map existing tables).
4. Set env: `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, and an anon-session signing secret if you use anonymous sessions.

## Usage — Server Side

### Provision an agent (idempotent)

```typescript
import { provisionVoiceAgent, standardAllowlist, createConversationTools } from '@caistech/elevenlabs-convai';

const { agentId, created } = await provisionVoiceAgent(process.env.ELEVENLABS_API_KEY!, {
  config: {
    agentName: 'Your Voice Concierge',
    voiceId: process.env.CANONICAL_VOICE_ID!,   // from voice-config.json
  },
  systemPrompt: 'You are a helpful concierge...',
  firstMessage: 'Hi, I can help with that.',
  baseUrl: 'https://your-app.example.com',
  allowedOrigins: standardAllowlist('your-app.example.com'),
  tools: createConversationTools('https://your-app.example.com'),
  // existingAgentId: stored id — re-runs update in place instead of creating duplicates
});
```

`provisionVoiceAgent` is safe to re-run: it keys on a stored agent id first, falls back to a name search, and **aborts** rather than guessing if two agents share the name. It also writes the Security allowlist and binds a workspace-scoped post-call webhook (never the deprecated per-agent shape).

### Webhook routes (Next.js, drop-in)

```typescript
// app/api/convai/webhooks/[action]/route.ts — or one file per action
import { createConvaiWebhookRoutes } from '@caistech/elevenlabs-convai';
import { createServiceClient } from '@/lib/supabase';

const routes = createConvaiWebhookRoutes({
  supabase: createServiceClient(),
  postCallSecret: process.env.ELEVENLABS_WEBHOOK_SECRET,
  resolveSession: async (_req, body) => {
    // Map the verified session to an identity. Authed: your auth.uid(). Anon: verify the
    // ephemeral token and return { userId: sid, anonSessionId: sid }. Return null to 401.
    return { userId: await resolveUserId(body) };
  },
  onConversationComplete: async (conversation, supabase) => {
    // Optional: write the finished conversation into YOUR domain table. Runs once.
  },
});

export const POST = routes.postCall; // ...and routes.startConversation, .saveMessage, etc.
```

### Webhook route (Next.js)

```typescript
// app/api/convai/webhook/route.ts
import { verifyWebhookSignature, parsePostCallPayload, extractConversationData, extractMessages } from '@/lib/convai';
import { handlePostCallWebhook } from '@/lib/convai/webhook-handlers';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('elevenlabs-signature');

  if (!verifyWebhookSignature(rawBody, signature, process.env.ELEVENLABS_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = parsePostCallPayload(rawBody);
  // ... handle with handlePostCallWebhook()
}
```

### Conversation tool webhooks

```typescript
// app/api/convai/webhooks/start_conversation/route.ts
import { handleStartConversation } from '@/lib/convai/webhook-handlers';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = createServiceClient();
  const result = await handleStartConversation(supabase, {
    elevenlabsConversationId: body.elevenlabs_conversation_id,
    elevenlabsAgentId: body.elevenlabs_agent_id,
    userId: body.user_id,
  });
  return NextResponse.json({ result });
}
```

## Usage — Front End (React)

Drop in the `VoiceWidget` from the `/react` subpath. It provides its own
`ConversationProvider`, is responsive (full-screen sheet on mobile, ≥44px touch targets),
and carries an explanatory header. Requires the optional peers `react` + `@elevenlabs/react`.

```tsx
'use client';
import { VoiceWidget } from '@caistech/elevenlabs-convai/react';
import { voiceConfig } from '@/voice.config'; // emitted by the voice-init wizard

export function VoiceConcierge() {
  return (
    <VoiceWidget
      {...voiceConfig}                  // agentId, placement, mode, textFallback
      overrides={{ agent: { firstMessage: 'Hi, I can help with your estimate.' } }}
      onConnect={(conversationId) => {
        // POST conversationId to your session-init route so the SERVER binds it to the
        // verified user. The widget never sends an identity the agent relays to tools.
        fetch('/api/convai/session-init', { method: 'POST', body: JSON.stringify({ conversationId }) });
      }}
    />
  );
}
```

If you need lower-level control, the raw `@elevenlabs/react` `useConversation` hook is
still available — but prefer `VoiceWidget` so every product shares one voice surface.

## Scaffold wizard

From the `cais-shared-services` repo (after `npm run build` on the package):

```bash
node scripts/voice-init.mjs --target ../my-product
```

Asks 5 questions (placement / mode / text-fallback / clarifier fields / persona-confirm),
reads the canonical persona from `voice-config.json`, and emits `voice.config.ts` into the
target project, then prints the provisioning next-steps.

## Custom table names

If your project already has tables (like Kira's `kira_agents`, `kira_conversations`, etc.), pass custom names:

```typescript
const tables = {
  agents: 'kira_agents',
  conversations: 'conversations',
  messages: 'conversation_messages',
  memory: 'kira_memory',
};

await handleStartConversation(supabase, params, tables);
```

## Projects using this

- **Kira** — AI life coach + PubGuard security scanner (origin project)
- **MOVA Drive** — proactive AI driving copilot (first consumer)
