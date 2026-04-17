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
//
// If your project uses different table names (e.g., Kira uses kira_agents),
// pass `tableNames` to override.

import type { MemoryType } from './types';

// =============================================================================
// TABLE NAME CONFIG
// =============================================================================

export interface TableNames {
  agents: string;
  conversations: string;
  messages: string;
  memory: string;
}

const DEFAULT_TABLES: TableNames = {
  agents: 'convai_agents',
  conversations: 'convai_conversations',
  messages: 'convai_messages',
  memory: 'convai_memory',
};

// Supabase client type — generic to avoid @supabase/supabase-js dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// =============================================================================
// START CONVERSATION
// =============================================================================

export interface StartConversationParams {
  elevenlabsConversationId: string;
  elevenlabsAgentId: string;
  userId: string;
}

export async function handleStartConversation(
  supabase: SupabaseClient,
  params: StartConversationParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { elevenlabsConversationId, elevenlabsAgentId, userId } = params;

  // Find the agent
  const { data: agent, error: agentError } = await supabase
    .from(tables.agents)
    .select('id, agent_name, total_conversations')
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
    // RPC not available — do a simpler query
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

  // Create conversation record
  const { data: conversation, error: convError } = await supabase
    .from(tables.conversations)
    .insert({
      user_id: userId,
      agent_id: agent.id,
      elevenlabs_conversation_id: elevenlabsConversationId,
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (convError) {
    return { success: false, error: 'Failed to create conversation' };
  }

  // Update agent stats
  await supabase
    .from(tables.agents)
    .update({
      last_conversation_at: new Date().toISOString(),
      total_conversations: (agent.total_conversations || 0) + 1,
    })
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
// SAVE MESSAGE
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
// RECALL MEMORY
// =============================================================================

export interface RecallMemoryParams {
  agentId: string;      // Internal agent UUID
  userId: string;
  query: string;
  memoryType?: MemoryType | 'all';
}

export async function handleRecallMemory(
  supabase: SupabaseClient,
  params: RecallMemoryParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { agentId, userId, query, memoryType } = params;

  let dbQuery = supabase
    .from(tables.memory)
    .select('*')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
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

  // Update last_recalled_at
  const memoryIds = memories.map((m: { id: string }) => m.id);
  await supabase
    .from(tables.memory)
    .update({ last_recalled_at: new Date().toISOString() })
    .in('id', memoryIds);

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
// SAVE MEMORY
// =============================================================================

export interface SaveMemoryParams {
  agentId: string;      // Internal agent UUID
  userId: string;
  content: string;
  memoryType: MemoryType;
  importance?: number;
  tags?: string[];
}

const VALID_MEMORY_TYPES: MemoryType[] = [
  'preference', 'context', 'goal', 'decision', 'followup', 'correction', 'insight',
];

export async function handleSaveMemory(
  supabase: SupabaseClient,
  params: SaveMemoryParams,
  tables: TableNames = DEFAULT_TABLES
) {
  const { agentId, userId, content, memoryType, importance = 5, tags = [] } = params;

  if (!VALID_MEMORY_TYPES.includes(memoryType)) {
    return { success: false, error: `Invalid memory type. Use: ${VALID_MEMORY_TYPES.join(', ')}` };
  }

  const { data: memory, error } = await supabase
    .from(tables.memory)
    .insert({
      user_id: userId,
      agent_id: agentId,
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
// POST-CALL WEBHOOK (transcript + stats)
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

export async function handlePostCallWebhook(
  supabase: SupabaseClient,
  params: PostCallParams,
  tables: TableNames = DEFAULT_TABLES
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

  const userId = params.userId || agent.user_id;

  // Upsert conversation
  await supabase
    .from(tables.conversations)
    .upsert({
      user_id: userId,
      agent_id: agent.id,
      elevenlabs_conversation_id: conversationId,
      last_topic: params.topic,
      status: params.status === 'done' ? 'completed' : params.status,
      started_at: params.startedAt,
      ended_at: params.endedAt,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'elevenlabs_conversation_id',
    });

  // Save messages
  if (params.messages.length > 0) {
    const messages = params.messages.map(m => ({
      user_id: userId,
      agent_id: agent.id,
      conversation_id: conversationId,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));

    await supabase.from(tables.messages).insert(messages);
  }

  // Update agent stats
  await supabase
    .from(tables.agents)
    .update({
      total_conversations: (agent.total_conversations || 0) + 1,
      total_minutes: (agent.total_minutes || 0) + Math.ceil(params.durationSecs / 60),
      last_conversation_at: new Date().toISOString(),
    })
    .eq('id', agent.id);

  return { success: true };
}
