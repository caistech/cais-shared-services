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
import { CONVAI_TOOL_SECRET_HEADER } from './conversation-tools.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, any, any>;

export interface ConvaiRouteContext {
  userId: string;
  anonSessionId?: string;
  /** Persisted on the conversation row so handleSaveMemory can derive it later without the
   *  caller having to resupply it on every memory tool call. */
  organisationId?: string;
}

/** Identity for the memory tool routes when it is SERVER-BAKED (see resolveToolIdentity). */
export interface ConvaiToolIdentity {
  userId: string;
  /** Scope recall/save to a single agent; omit/null for user-wide (one-agent-per-user). */
  agentId?: string | null;
  /** Required by handleSaveMemory when this identity path is used directly (no conversation
   *  row to derive organisation_id from). */
  organisationId?: string;
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
  /**
   * Resolve identity for the MEMORY tool routes (recall_memory / save_memory) WITHOUT a conversation
   * binding. ElevenLabs does not pass the conversation id to server-tool webhooks — the agent sends
   * only the LLM-filled params — so a recall tool receiving `{query}` alone cannot bind a
   * conversation, and recall silently fails ("Conversation not found"). When you know the owner at
   * provision (one-agent-per-user, uid baked into the tool URL as `?uid=…`), return it here and the
   * tool resolves by user directly. Return null to fall back to the conversation-binding path.
   * Only recall_memory + save_memory call this. See `createConversationTools({ identity })`.
   */
  resolveToolIdentity?: (
    req: Request,
    body: Record<string, unknown>
  ) => Promise<ConvaiToolIdentity | null> | ConvaiToolIdentity | null;
  /**
   * TOOL-WEBHOOK AUTH. Every memory tool route requires the `x-convai-tool-secret` header to equal
   * this value — closing the hole where an unauthenticated caller could POST recall/save against a
   * victim (identity is derived from a PUBLIC agent id, which is shipped to the browser). The
   * provisioned tools carry the header via `createConversationTools({ secret })`.
   *
   * **Resolution order:** this option → `process.env.CONVAI_TOOL_SECRET` → none.
   *
   * The env fallback exists so a product gets the guard by CONFIGURATION rather than by a code
   * change. The original shape — an option nobody passed — meant the guard shipped in 0.6.0 and was
   * enabled in exactly one consumer; every other product had memory endpoints an anonymous caller
   * could read and write. Nothing was wrong with the code. Nobody turned it on.
   *
   * **Unset is still permitted, but it is no longer silent** — see `requireToolSecret`. A guard
   * that is quietly inert is indistinguishable from a guard that is working, which is the property
   * that let this sit unnoticed.
   */
  toolSecret?: string;
  /**
   * Refuse to construct routes without a tool secret.
   *
   * Defaults to `false` so this release breaks nobody. Set it to `true` in any product whose voice
   * agent holds real user memory: it converts "the secret is set in every environment" from an
   * operational hope into something the process cannot start without.
   *
   * The reason it is not the default yet is sequencing, not doubt: agents provisioned before the
   * header existed do not send it, so flipping this on before re-provisioning turns every memory
   * call into a 401. Re-provision, verify, then set it.
   */
  requireToolSecret?: boolean;
  /**
   * POST-CALL AUTH — **fails closed as of 0.10.0.**
   *
   * Post-call requests must carry a valid `elevenlabs-signature` header. With no secret resolved
   * the route now returns 500 and processes nothing. Until 0.10.0 an unset secret **skipped**
   * verification rather than failing it, against `VOICE_MEMORY_STANDARD`'s explicit
   * *"unverified → 401"* — so the package shipped the opposite of the standard it documents.
   *
   * Why this is not a nice-to-have: `handlePostCallWebhook` binds by `elevenlabs_agent_id` and
   * `conversation_id` taken from the request BODY, and an agent id is not a credential — it is
   * shipped to the browser. An unverified payload can therefore write conversation content that
   * the agent later recalls and speaks back as fact. Memory poisoning, not junk rows.
   *
   * **Resolution order:** this option → `process.env.ELEVENLABS_WEBHOOK_SECRET` → none.
   * The env fallback exists because the secret is a one-time credential (ElevenLabs shows it only
   * at webhook creation and masks it on every later GET), so the consumer that drops it has no way
   * back. Reading the environment means a product is protected by CONFIGURATION rather than by
   * every future caller remembering to thread an option through.
   */
  postCallSecret?: string;
  /**
   * Serve the post-call route WITHOUT signature verification.
   *
   * Opt in by name, so an unauthenticated webhook appears in a diff and in review rather than
   * arising from an unset variable nobody noticed. There is no good production reason to set this;
   * it exists for local development against a webhook you have not provisioned yet.
   */
  allowUnsignedPostCall?: boolean;
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
  const { supabase, tableNames, onConversationComplete, resolveSession, resolveToolIdentity } = options;

  // Resolve from the option, then the environment. The env fallback is what makes this reachable
  // without a code change in each product — the previous shape required every consumer to discover
  // the option and pass it, and only one ever did.
  const toolSecret = options.toolSecret ?? process.env.CONVAI_TOOL_SECRET ?? undefined;
  const postCallSecret = options.postCallSecret ?? process.env.ELEVENLABS_WEBHOOK_SECRET ?? undefined;

  if (!toolSecret) {
    if (options.requireToolSecret) {
      // Fail at CONSTRUCTION, not at the first request. A route set that builds and then serves
      // unauthenticated traffic has already lost; this makes the deploy fail instead.
      throw new Error(
        '[convai] requireToolSecret is set but no tool secret was resolved. Pass `toolSecret` or set ' +
          'CONVAI_TOOL_SECRET. Refusing to serve memory endpoints without authentication.'
      );
    }
    // Once, at construction — not per request, which would be noise nobody reads.
    console.error(
      '[convai] SECURITY: webhook routes constructed WITHOUT a tool secret. The memory endpoints ' +
        '(recall/save) are UNAUTHENTICATED — identity is derived from a public agent id, so anyone ' +
        'who has it can read and write this product\'s conversation memory. Set CONVAI_TOOL_SECRET ' +
        '(or pass `toolSecret`), re-provision agents so they send the header, then set ' +
        '`requireToolSecret: true`.'
    );
  }

  // NOTE on where post-call auth is enforced: at the REQUEST, in the `postCall` handler below —
  // not here at construction, and not as a throw.
  //
  // Two reasons. This factory returns all six routes whether or not a consumer mounts post-call, so
  // a construction-time failure would penalise tool-only consumers who never expose the risky route
  // — a false failure, and false failures are how guards get switched off. And unlike the tool-secret
  // guard above, which is genuinely INERT (and therefore silent) when unset, an unset post-call
  // secret makes the route answer 500 on every request: it is already loud at the point of risk.
  //
  // CI is what turns "loud when called" into "found before production": `probeMemoryLoop`'s
  // post-call assertion (expectPostCallAuth, default on) fails when an unsigned POST is accepted.

  /** Tool-webhook auth gate. Inert only when no secret resolved — and that now warns loudly above. */
  const toolAuthOk = (req: Request): boolean =>
    !toolSecret || req.headers.get(CONVAI_TOOL_SECRET_HEADER) === toolSecret;

  const startConversation = guard(async (req) => {
    if (!toolAuthOk(req)) return json(401, { success: false, error: 'Unauthorized' });
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
        organisationId: session.organisationId,
      },
      tableNames
    );
    return json(200, result);
  });

  const saveMessage = guard(async (req) => {
    if (!toolAuthOk(req)) return json(401, { success: false, error: 'Unauthorized' });
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
    if (!toolAuthOk(req)) return json(401, { success: false, error: 'Unauthorized' });
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
    if (!toolAuthOk(req)) return json(401, { success: false, error: 'Unauthorized' });
    const body = await readJson(req);
    if (!body) return json(400, { success: false, error: 'Malformed JSON body' });

    const query = String(body.query || '');
    if (!query) return json(400, { success: false, error: 'Missing query' });

    // Server-baked identity (uid in URL) is the reliable path — EL doesn't pass conversation_id to
    // tool webhooks. Fall back to the conversation binding for legacy callers that do send it.
    const identity = resolveToolIdentity ? await resolveToolIdentity(req, body) : null;
    const conversationId = String(body.conversation_id || '');
    if (!identity && !conversationId) {
      return json(400, { success: false, error: 'Missing identity or conversation_id' });
    }

    const result = await handleRecallMemory(
      supabase,
      { elevenlabsConversationId: conversationId, query, identity: identity ?? undefined },
      tableNames
    );
    return json(200, result);
  });

  const saveMemory = guard(async (req) => {
    if (!toolAuthOk(req)) return json(401, { success: false, error: 'Unauthorized' });
    const body = await readJson(req);
    if (!body) return json(400, { success: false, error: 'Malformed JSON body' });

    const content = String(body.memory || '');
    if (!content) return json(400, { success: false, error: 'Missing memory' });

    const identity = resolveToolIdentity ? await resolveToolIdentity(req, body) : null;
    const conversationId = String(body.conversation_id || '');
    if (!identity && !conversationId) {
      return json(400, { success: false, error: 'Missing identity or conversation_id' });
    }

    const category = String(body.category || 'context');
    const memoryType = (VALID_MEMORY_TYPES as readonly string[]).includes(category)
      ? (category as MemoryType)
      : ('context' as MemoryType);

    const result = await handleSaveMemory(
      supabase,
      {
        elevenlabsConversationId: conversationId,
        content,
        memoryType,
        identity: identity ?? undefined,
        organisationId: identity?.organisationId,
      },
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
    } else if (!options.allowUnsignedPostCall) {
      // Unreachable while the route set is built through createConvaiWebhookRoutes, which throws
      // for exactly this case. Kept so that the request path itself refuses rather than relying on
      // the constructor having been the only way in — the failure this guards against was, twice,
      // a check that was present but not reached.
      return json(500, { success: false, error: 'Post-call webhook secret not configured' });
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
