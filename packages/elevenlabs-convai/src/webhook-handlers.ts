// elevenlabs-convai/webhook-handlers.ts
// Generic webhook handler logic for ElevenLabs ConvAI.
// These are pure functions that take a Supabase client and return data.
// Your project's API routes call these — no framework-specific code here.
//
// Table expectations (see migration.sql):
//   convai_agents          — agent registry
//   convai_conversations   — conversation sessions
//   convai_messages        — individual messages
//   convai_memory          — persistent user memories
//   convai_anon_sessions   — ephemeral anonymous sessions
//
// If your project uses different table names (e.g., Kira uses kira_agents),
// pass `tableNames` to override.
//
// Identity / security: memory recall+save derive user_id from the CONVERSATION
// binding (set at handleStartConversation against a verified session), never from a
// caller- or agent-supplied user_id. This closes a cross-tenant memory read/write hole
// — the agent cannot name whose memory it touches.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryType } from './types.js';

// =============================================================================
// TABLE NAME CONFIG
// =============================================================================

export interface TableNames {
  agents: string;
  conversations: string;
  messages: string;
  memory: string;
  // Optional: only the anon-session/route layer references it, never the core handlers.
  // Optional so a 0.1.x consumer's existing { agents, conversations, messages, memory }
  // TableNames keeps compiling after upgrading (no code edit needed for the bump).
  anonSessions?: string;
}

const DEFAULT_TABLES: TableNames = {
  agents: 'convai_agents',
  conversations: 'convai_conversations',
  messages: 'convai_messages',
  memory: 'convai_memory',
  anonSessions: 'convai_anon_sessions',
};

// Generic so callers can pass a typed SupabaseClient<Database> without friction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, any, any>;

// =============================================================================
// START CONVERSATION
// =============================================================================

export interface StartConversationParams {
  elevenlabsConversationId: string;
  elevenlabsAgentId: string;
  /** Resolved by the route from the verified session (authed user id OR anon session id). */
  userId: string;
  /** Set when this is an anonymous session; links the conversation for ephemeral purge. */
  anonSessionId?: string;
}

export async function handleStartConversation(
  supabase: Supabase,
  params: StartConversationParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { elevenlabsConversationId, elevenlabsAgentId, userId, anonSessionId } = params;

  // Find the agent
  const { data: agent, error: agentError } = await supabase
    .from(tables.agents)
    .select('id, agent_name')
    .eq('elevenlabs_agent_id', elevenlabsAgentId)
    .single();

  if (agentError || !agent) {
    return { success: false, error: 'Agent not found' };
  }

  // Get conversation context (uses RPC if available, fallback to query)
  let context = { has_history: false, time_gap_category: 'new' as string };
  try {
    const { data: rpcResult } = await supabase
      .rpc('get_conversation_context', {
        p_agent_id: agent.id,
        p_user_id: userId,
        p_message_limit: 10,
      });
    if (rpcResult) context = rpcResult;
  } catch {
    // RPC not available — do a simpler query (no status filter, matching the RPC).
    const { data: lastConv } = await supabase
      .from(tables.conversations)
      .select('id, last_message_at, last_topic, message_count')
      .eq('agent_id', agent.id)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    if (lastConv?.last_message_at) {
      const gapMs = Date.now() - new Date(lastConv.last_message_at).getTime();
      const gapHours = gapMs / (1000 * 60 * 60);
      context = {
        has_history: true,
        time_gap_category: gapHours < 1 ? 'recent'
          : gapHours < 24 ? 'today'
          : gapHours < 168 ? 'this_week'
          : 'older',
        ...lastConv,
      };
    }
  }

  // Create conversation record (binds user_id — and anon_session_id when anonymous —
  // so memory recall/save can derive identity from this row, never from the agent).
  const { data: conversation, error: convError } = await supabase
    .from(tables.conversations)
    .insert({
      user_id: userId,
      agent_id: agent.id,
      anon_session_id: anonSessionId ?? null,
      elevenlabs_conversation_id: elevenlabsConversationId,
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (convError) {
    return { success: false, error: 'Failed to create conversation' };
  }

  // NOTE: total_conversations is intentionally NOT incremented here. It is incremented
  // exactly once in handlePostCallWebhook, gated by processed_at, so a conversation that
  // passes through both the start tool and the post-call webhook is not double-counted.
  await supabase
    .from(tables.agents)
    .update({ last_conversation_at: new Date().toISOString() })
    .eq('id', agent.id);

  return {
    success: true,
    conversationId: conversation.id,
    context,
    isReturningUser: context.has_history,
    timeGapCategory: context.time_gap_category,
  };
}

// =============================================================================
// SAVE MESSAGE (mid-call)
// =============================================================================

export interface SaveMessageParams {
  elevenlabsConversationId: string;
  role: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
  durationMs?: number;
  timestamp?: string;
}

export async function handleSaveMessage(
  supabase: Supabase,
  params: SaveMessageParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { elevenlabsConversationId, role, content } = params;

  // Find conversation
  const { data: conversation, error: convError } = await supabase
    .from(tables.conversations)
    .select('id, user_id, agent_id, message_count')
    .eq('elevenlabs_conversation_id', elevenlabsConversationId)
    .single();

  if (convError || !conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  const messageIndex = (conversation.message_count || 0) + 1;

  const { data: message, error: msgError } = await supabase
    .from(tables.messages)
    .insert({
      conversation_id: conversation.id,
      user_id: conversation.user_id,
      agent_id: conversation.agent_id,
      role,
      content,
      audio_url: params.audioUrl,
      duration_ms: params.durationMs,
      message_index: messageIndex,
      timestamp: params.timestamp || new Date().toISOString(),
    })
    .select()
    .single();

  if (msgError) {
    return { success: false, error: 'Failed to save message' };
  }

  // Auto-update topic from user messages
  if (role === 'user' && content.length > 10) {
    const topicHint = content.slice(0, 100).replace(/[^\w\s]/g, '').trim();
    if (topicHint.length > 5) {
      await supabase
        .from(tables.conversations)
        .update({ last_topic: topicHint, updated_at: new Date().toISOString() })
        .eq('id', conversation.id);
    }
  }

  return { success: true, messageId: message.id, messageIndex };
}

// =============================================================================
// UPDATE TOPIC
// =============================================================================

export interface UpdateTopicParams {
  elevenlabsConversationId: string;
  topic: string;
}

export async function handleUpdateTopic(
  supabase: Supabase,
  params: UpdateTopicParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { elevenlabsConversationId, topic } = params;

  const { data: conversation, error: convError } = await supabase
    .from(tables.conversations)
    .select('id, topics')
    .eq('elevenlabs_conversation_id', elevenlabsConversationId)
    .single();

  if (convError || !conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  const existingTopics = conversation.topics || [];
  const updatedTopics = [...new Set([...existingTopics, topic])];

  const { error: updateError } = await supabase
    .from(tables.conversations)
    .update({
      last_topic: topic,
      topics: updatedTopics,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  if (updateError) {
    return { success: false, error: 'Failed to update topic' };
  }

  return { success: true, topic, allTopics: updatedTopics };
}

// =============================================================================
// CONVERSATION BINDING (shared identity resolution)
// =============================================================================

interface ConversationBinding {
  id: string;
  userId: string;
  agentId: string;
  anonSessionId: string | null;
}

/**
 * Resolve a conversation's bound identity from its ElevenLabs conversation id.
 * Memory handlers use this so user_id is NEVER taken from a tool/agent parameter.
 */
async function getConversationBinding(
  supabase: Supabase,
  tables: TableNames,
  elevenlabsConversationId: string
): Promise<ConversationBinding | null> {
  const { data, error } = await supabase
    .from(tables.conversations)
    .select('id, user_id, agent_id, anon_session_id')
    .eq('elevenlabs_conversation_id', elevenlabsConversationId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    agentId: data.agent_id,
    anonSessionId: data.anon_session_id ?? null,
  };
}

// =============================================================================
// RECALL MEMORY  (user_id derived from the conversation, not supplied)
// =============================================================================

export interface RecallMemoryParams {
  elevenlabsConversationId: string;
  query: string;
  memoryType?: MemoryType | 'all';
}

export async function handleRecallMemory(
  supabase: Supabase,
  params: RecallMemoryParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { elevenlabsConversationId, query, memoryType } = params;

  const binding = await getConversationBinding(supabase, tables, elevenlabsConversationId);
  if (!binding) {
    return { success: false, error: 'Conversation not found' };
  }

  let dbQuery = supabase
    .from(tables.memory)
    .select('*')
    .eq('user_id', binding.userId)
    .eq('agent_id', binding.agentId)
    .eq('active', true)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  if (memoryType && memoryType !== 'all') {
    dbQuery = dbQuery.eq('memory_type', memoryType);
  }

  dbQuery = dbQuery.ilike('content', `%${query}%`);

  const { data: memories, error } = await dbQuery;

  if (error) {
    return { success: false, error: 'Memory search failed' };
  }

  if (!memories || memories.length === 0) {
    return {
      success: true,
      found: 0,
      memories: [],
      summary: `No memories found about "${query}".`,
    };
  }

  // Update last_recalled_at (best-effort; log on failure rather than swallow silently)
  const memoryIds = memories.map((m: { id: string }) => m.id);
  const { error: recallErr } = await supabase
    .from(tables.memory)
    .update({ last_recalled_at: new Date().toISOString() })
    .in('id', memoryIds);
  if (recallErr) {
    console.warn('[convai] failed to update last_recalled_at:', recallErr.message);
  }

  const formatted = memories.map((m: { memory_type: string; content: string; importance: number; created_at: string }) => ({
    type: m.memory_type,
    content: m.content,
    importance: m.importance,
    when: m.created_at,
  }));

  return {
    success: true,
    found: memories.length,
    memories: formatted,
    summary: memories.length === 1
      ? memories[0].content
      : `Found ${memories.length} relevant memories.`,
  };
}

// =============================================================================
// SAVE MEMORY  (user_id + anon linkage derived from the conversation)
// =============================================================================

export interface SaveMemoryParams {
  elevenlabsConversationId: string;
  content: string;
  memoryType: MemoryType;
  importance?: number;
  tags?: string[];
}

const VALID_MEMORY_TYPES: MemoryType[] = [
  'preference', 'context', 'goal', 'decision', 'followup', 'correction', 'insight',
];

export async function handleSaveMemory(
  supabase: Supabase,
  params: SaveMemoryParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { elevenlabsConversationId, content, memoryType, importance = 5, tags = [] } = params;

  if (!VALID_MEMORY_TYPES.includes(memoryType)) {
    return { success: false, error: `Invalid memory type. Use: ${VALID_MEMORY_TYPES.join(', ')}` };
  }

  const binding = await getConversationBinding(supabase, tables, elevenlabsConversationId);
  if (!binding) {
    return { success: false, error: 'Conversation not found' };
  }

  const { data: memory, error } = await supabase
    .from(tables.memory)
    .insert({
      user_id: binding.userId,
      agent_id: binding.agentId,
      // Anonymous memory is single-call only: tagging it with the anon session purges
      // it when the session expires. Authed memory (anon_session_id NULL) persists.
      anon_session_id: binding.anonSessionId,
      source_conversation_id: binding.id,
      memory_type: memoryType,
      content,
      importance,
      tags,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: 'Failed to save memory' };
  }

  return { success: true, memoryId: memory.id };
}

// =============================================================================
// POST-CALL WEBHOOK (transcript + stats) — retry-safe, exactly-once side-effects
// =============================================================================

export interface PostCallParams {
  elevenlabsAgentId: string;
  conversationId: string;
  userId: string;
  topic: string;
  status: string;
  startedAt: string;
  endedAt: string;
  durationSecs: number;
  terminationReason?: string;
  summary?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

/**
 * Optional product extension seam. Fires exactly once per conversation (gated by
 * processed_at) AFTER the core conversation/message writes have committed. Throwing
 * here does not roll back the core writes — the hub logs and continues. The hub never
 * knows what product table you write into.
 */
export type OnConversationComplete = (
  conversation: { id: string; userId: string; agentId: string; elevenlabsConversationId: string },
  supabase: Supabase
) => Promise<void>;

export async function handlePostCallWebhook(
  supabase: Supabase,
  params: PostCallParams,
  tables: TableNames = DEFAULT_TABLES,
  onConversationComplete?: OnConversationComplete
) {
  const { elevenlabsAgentId, conversationId } = params;

  // Find agent
  const { data: agent, error: agentError } = await supabase
    .from(tables.agents)
    .select('id, user_id, total_conversations, total_minutes')
    .eq('elevenlabs_agent_id', elevenlabsAgentId)
    .single();

  if (agentError || !agent) {
    return { success: false, error: 'Agent not found' };
  }

  // Resolve the conversation. If it was created at start (handleStartConversation),
  // KEEP its bound user_id + anon linkage — never overwrite identity from the post-call
  // payload. Only an orphan post-call (no prior start) falls back to the agent owner.
  const statusValue = params.status === 'done' ? 'completed' : params.status;
  const { data: existing } = await supabase
    .from(tables.conversations)
    .select('id, user_id, agent_id, processed_at')
    .eq('elevenlabs_conversation_id', conversationId)
    .maybeSingle();

  let convRow: { id: string; user_id: string; agent_id: string; processed_at: string | null };

  if (existing) {
    const { data: updated, error: updErr } = await supabase
      .from(tables.conversations)
      .update({
        last_topic: params.topic,
        status: statusValue,
        started_at: params.startedAt,
        ended_at: params.endedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, user_id, agent_id, processed_at')
      .single();
    if (updErr || !updated) {
      return { success: false, error: 'Failed to update conversation' };
    }
    convRow = updated;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from(tables.conversations)
      .insert({
        user_id: params.userId || agent.user_id,
        agent_id: agent.id,
        elevenlabs_conversation_id: conversationId,
        last_topic: params.topic,
        status: statusValue,
        started_at: params.startedAt,
        ended_at: params.endedAt,
      })
      .select('id, user_id, agent_id, processed_at')
      .single();
    if (insErr || !inserted) {
      return { success: false, error: 'Failed to create conversation' };
    }
    convRow = inserted;
  }

  const userId = convRow.user_id;

  // Save messages — retry-safe. message_index is populated from transcript order
  // (NOT NULL, so the (conversation_id, message_index) unique index actually dedupes).
  // Upsert overwrites on conflict, so a retry re-writes identical rows instead of
  // inserting duplicates.
  if (params.messages.length > 0) {
    const messages = params.messages.map((m, i) => ({
      user_id: userId,
      agent_id: agent.id,
      conversation_id: convRow.id,
      role: m.role,
      content: m.content,
      message_index: i + 1,
      timestamp: m.timestamp,
    }));

    const { error: msgErr } = await supabase
      .from(tables.messages)
      .upsert(messages, { onConflict: 'conversation_id,message_index' });
    if (msgErr) {
      return { success: false, error: 'Failed to save messages' };
    }
  }

  // Exactly-once side-effects: claim the conversation atomically. Only the caller that
  // flips processed_at from NULL wins; concurrent retries get zero rows and skip.
  const { data: claimed } = await supabase
    .from(tables.conversations)
    .update({ processed_at: new Date().toISOString() })
    .eq('id', convRow.id)
    .is('processed_at', null)
    .select('id')
    .maybeSingle();

  if (claimed) {
    // Count the conversation exactly once, here (not at start).
    await supabase
      .from(tables.agents)
      .update({
        total_conversations: (agent.total_conversations || 0) + 1,
        total_minutes: (agent.total_minutes || 0) + Math.ceil(params.durationSecs / 60),
        last_conversation_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    // Product extension seam — isolated; failure does not undo the writes above.
    if (onConversationComplete) {
      try {
        await onConversationComplete(
          {
            id: convRow.id,
            userId: convRow.user_id,
            agentId: convRow.agent_id,
            elevenlabsConversationId: conversationId,
          },
          supabase
        );
      } catch (e) {
        console.error('[convai] onConversationComplete threw (core writes preserved):', e);
      }
    }
  }

  return { success: true, processed: !!claimed, alreadyProcessed: !claimed };
}
