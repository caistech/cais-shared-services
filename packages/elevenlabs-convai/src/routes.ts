// elevenlabs-convai/routes.ts
// Next.js (App Router) webhook route factory. Wraps the pure handler functions with the
// HTTP concerns they shouldn't carry: body parsing, status codes, signature verification,
// and verified-identity resolution. Uses the Web Fetch Request/Response (global), so it
// works in Next.js App Router route handlers and any Web-standard runtime.
//
// Mount each returned handler at the matching path. Example (App Router):
//   // app/api/convai/webhooks/start_conversation/route.ts
//   import { routes } from '@/lib/convai';
//   export const POST = routes.startConversation;
//
// Identity model:
//   * start_conversation resolves verified identity via your resolveSession() callback
//     (the hub can't know your auth). It returns { userId, anonSessionId? }; null → 401.
//   * save_message / update_topic / recall_memory / save_memory derive identity from the
//     bound conversation row — they never trust an agent-supplied user_id.
//   * post-call verifies the elevenlabs-signature (when postCallSecret is set).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  handleStartConversation,
  handleSaveMessage,
  handleUpdateTopic,
  handleRecallMemory,
  handleSaveMemory,
  handlePostCallWebhook,
  type TableNames,
  type OnConversationComplete,
} from './webhook-handlers.js';
import {
  verifyWebhookSignature,
  parsePostCallPayload,
  extractConversationData,
  extractMessages,
} from './webhook.js';
import type { MemoryType } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, any, any>;

export interface ConvaiRouteContext {
  userId: string;
  anonSessionId?: string;
}

export interface CreateConvaiWebhookRoutesOptions {
  /** A SERVICE-ROLE Supabase client (RLS bypassed — these are server-side webhooks). */
  supabase: Supabase;
  tableNames?: TableNames;
  /** Product extension seam — runs once per conversation after the post-call writes. */
  onConversationComplete?: OnConversationComplete;
  /**
   * Resolve verified identity for the start path. The hub cannot know your auth, so you
   * map the incoming request (+ parsed body) to a userId, plus anonSessionId for anon
   * sessions. Return null to reject with 401. Only start_conversation calls this.
   */
  resolveSession: (
    req: Request,
    body: Record<string, unknown>
  ) => Promise<ConvaiRouteContext | null> | ConvaiRouteContext | null;
  /** When set, post-call requests must carry a valid `elevenlabs-signature` header. */
  postCallSecret?: string;
}

type RouteHandler = (req: Request) => Promise<Response>;

export interface ConvaiWebhookRoutes {
  startConversation: RouteHandler;
  saveMessage: RouteHandler;
  updateTopic: RouteHandler;
  recallMemory: RouteHandler;
  saveMemory: RouteHandler;
  postCall: RouteHandler;
}

const VALID_MEMORY_TYPES = [
  'preference', 'context', 'goal', 'decision', 'followup', 'correction', 'insight',
] as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Parse a JSON body, returning null on malformed input (caller responds 400). */
async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const data = await req.json();
    if (!data || typeof data !== 'object') return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Wrap a tool route so a thrown handler becomes a 500 instead of crashing the runtime. */
function guard(fn: RouteHandler): RouteHandler {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      console.error('[convai] webhook handler threw:', e);
      return json(500, { success: false, error: 'Internal error' });
    }
  };
}

export function createConvaiWebhookRoutes(
  options: CreateConvaiWebhookRoutesOptions
): ConvaiWebhookRoutes {
  const { supabase, tableNames, onConversationComplete, resolveSession, postCallSecret } = options;

  const startConversation = guard(async (req) => {
    const body = await readJson(req);
    if (!body) return json(400, { success: false, error: 'Malformed JSON body' });

    const elevenlabsConversationId = String(body.elevenlabs_conversation_id || '');
    const elevenlabsAgentId = String(body.elevenlabs_agent_id || '');
    if (!elevenlabsConversationId || !elevenlabsAgentId) {
      return json(400, { success: false, error: 'Missing elevenlabs_conversation_id or elevenlabs_agent_id' });
    }

    const session = await resolveSession(req, body);
    if (!session) return json(401, { success: false, error: 'Unauthorized session' });

    const result = await handleStartConversation(
      supabase,
      {
        elevenlabsConversationId,
        elevenlabsAgentId,
        userId: session.userId,
        anonSessionId: session.anonSessionId,
      },
      tableNames
    );
    return json(200, result);
  });

  const saveMessage = guard(async (req) => {
    const body = await readJson(req);
    if (!body) return json(400, { success: false, error: 'Malformed JSON body' });

    const conversationId = String(body.conversation_id || '');
    const role = body.role as 'user' | 'assistant';
    const content = String(body.content || '');
    if (!conversationId || (role !== 'user' && role !== 'assistant') || !content) {
      return json(400, { success: false, error: 'Missing conversation_id, role, or content' });
    }

    const result = await handleSaveMessage(
      supabase,
      { elevenlabsConversationId: conversationId, role, content },
      tableNames
    );
    return json(200, result);
  });

  const updateTopic = guard(async (req) => {
    const body = await readJson(req);
    if (!body) return json(400, { success: false, error: 'Malformed JSON body' });

    const conversationId = String(body.conversation_id || '');
    const topic = String(body.topic || '');
    if (!conversationId || !topic) {
      return json(400, { success: false, error: 'Missing conversation_id or topic' });
    }

    const result = await handleUpdateTopic(
      supabase,
      { elevenlabsConversationId: conversationId, topic },
      tableNames
    );
    return json(200, result);
  });

  const recallMemory = guard(async (req) => {
    const body = await readJson(req);
    if (!body) return json(400, { success: false, error: 'Malformed JSON body' });

    const conversationId = String(body.conversation_id || '');
    const query = String(body.query || '');
    if (!conversationId || !query) {
      return json(400, { success: false, error: 'Missing conversation_id or query' });
    }

    const result = await handleRecallMemory(
      supabase,
      { elevenlabsConversationId: conversationId, query },
      tableNames
    );
    return json(200, result);
  });

  const saveMemory = guard(async (req) => {
    const body = await readJson(req);
    if (!body) return json(400, { success: false, error: 'Malformed JSON body' });

    const conversationId = String(body.conversation_id || '');
    const content = String(body.memory || '');
    if (!conversationId || !content) {
      return json(400, { success: false, error: 'Missing conversation_id or memory' });
    }

    const category = String(body.category || 'context');
    const memoryType = (VALID_MEMORY_TYPES as readonly string[]).includes(category)
      ? (category as MemoryType)
      : ('context' as MemoryType);

    const result = await handleSaveMemory(
      supabase,
      { elevenlabsConversationId: conversationId, content, memoryType },
      tableNames
    );
    return json(200, result);
  });

  const postCall = guard(async (req) => {
    const rawBody = await req.text();

    if (postCallSecret) {
      const signature = req.headers.get('elevenlabs-signature');
      if (!verifyWebhookSignature(rawBody, signature, postCallSecret)) {
        return json(401, { success: false, error: 'Invalid signature' });
      }
    }

    const payload = parsePostCallPayload(rawBody);
    if (!payload) return json(400, { success: false, error: 'Malformed post-call payload' });

    // userId here is only the orphan fallback owner — an existing (bound) conversation
    // keeps its own user_id inside handlePostCallWebhook.
    const conv = extractConversationData(payload, payload.data.agent_id);
    const messages = extractMessages(payload, payload.data.agent_id);

    const result = await handlePostCallWebhook(
      supabase,
      {
        elevenlabsAgentId: payload.data.agent_id,
        conversationId: payload.data.conversation_id,
        userId: '',
        topic: conv.topic,
        status: conv.status,
        startedAt: conv.startedAt,
        endedAt: conv.endedAt,
        durationSecs: conv.durationSecs,
        terminationReason: conv.terminationReason,
        summary: conv.summary,
        messages: messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
      },
      tableNames,
      onConversationComplete
    );
    return json(result.success ? 200 : 500, result);
  });

  return { startConversation, saveMessage, updateTopic, recallMemory, saveMemory, postCall };
}
