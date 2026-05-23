# elevenlabs-convai

Shared ElevenLabs Conversational AI module. Extracted from Kira. Provides the full voice conversation loop with persistent memory, webhook handling, and conversation continuity.

## What this replaces

If you're currently building voice with MediaRecorder + STT API + LLM API + TTS API + browser audio glue... stop. ElevenLabs ConvAI handles the entire duplex voice loop over a single WebSocket. This module provides the server-side infrastructure around it.

## Contents

| File | Purpose |
|------|---------|
| `types.ts` | All TypeScript types (agent config, webhook payloads, memory, etc.) |
| `agent-client.ts` | Server-side agent CRUD (create, update, delete, get, conversation history) |
| `webhook.ts` | Signature verification + payload parsing for ElevenLabs webhooks |
| `webhook-handlers.ts` | Generic Supabase handlers: start conversation, save message, update topic, recall/save memory, post-call transcript |
| `conversation-tools.ts` | Tool definitions the agent calls during conversation (memory, context, topics) |
| `migration.sql` | Supabase tables: agents, conversations, messages, memory + RPC + RLS |
| `index.ts` | Barrel export |

## Setup

1. Copy this directory into your project: `cp -r corporate-ai-common/elevenlabs-convai/ your-project/lib/convai/`
2. Install `@elevenlabs/client` and `@elevenlabs/react` in your project
3. Run `migration.sql` against your Supabase project
4. Set environment variables: `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`

## Usage — Server Side

### Create an agent

```typescript
import { createAgent } from '@/lib/convai';

const { agentId } = await createAgent(process.env.ELEVENLABS_API_KEY!, {
  config: {
    agentName: 'Your Voice Copilot',
    voiceId: '2pwMUCWPsm9t6AwXYaCj',
    webhookUrl: 'https://your-app.example.com/api/convai/webhook',
  },
  systemPrompt: 'You are a driving copilot...',
  firstMessage: 'Hey! Where are we heading today?',
});
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

## Usage — Client Side

```typescript
import { useConversation } from '@elevenlabs/react';

const conversation = useConversation({
  onConnect: ({ conversationId }) => { /* connected */ },
  onMessage: ({ message, source }) => { /* new message */ },
  onDisconnect: () => { /* done */ },
});

await conversation.startSession({
  agentId: 'your-agent-id',
  connectionType: 'websocket',
  overrides: {
    agent: {
      prompt: { prompt: 'Context for this session...' },
      firstMessage: 'Hey! What are we doing today?',
    },
  },
});
```

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
