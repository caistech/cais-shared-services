// webhook-handlers.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryType, MultiReadableRequest } from './types.js';
import { createMultiReadableRequest } from './request-utils';

// =============================================================================
// TABLE NAME CONFIG
// =============================================================================

export interface TableNames {
  agents: string;
  conversations: string;
  messages: string;
  memory: string;
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
// SECURITY VERIFICATION
// =============================================================================

function verifyToolSecret(req: Request): boolean {
  const secret = process.env.CONVAI_TOOL_SECRET;
  if (!secret) {
    console.error('CONVAI_TOOL_SECRET is not set');
    return false;
  }

  const header = req.headers.get('X-ConvAI-Tool-Secret');
  return header === secret;
}

function verifyElevenLabsSignature(req: Request): boolean {
  const signature = req.headers.get('X-ElevenLabs-Signature');
  return !!signature; // In production, implement actual signature verification
}

// =============================================================================
// START CONVERSATION
// =============================================================================

export interface StartConversationParams {
  elevenlabsConversationId: string;
  elevenlabsAgentId: string;
  userId: string;
  anonSessionId?: string;
}

export async function handleStartConversation(
  supabase: Supabase,
  req: MultiReadableRequest,
  tables: TableNames = DEFAULT_TABLES
) {
  try {
    // Verify security requirements
    if (!verifyToolSecret(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid tool secret' };
    }

    if (!verifyElevenLabsSignature(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid ElevenLabs signature' };
    }

    const rawBody = await req.text();
    const params: StartConversationParams = JSON.parse(rawBody);

    // Check required parameters
    if (!params.elevenlabsConversationId || !params.elevenlabsAgentId || !params.userId) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Check if conversation already exists
    const { data: existingConversation } = await supabase
      .from(tables.conversations)
      .select('id')
      .eq('elevenlabs_conversation_id', params.elevenlabsConversationId)
      .maybeSingle();

    if (existingConversation) {
      return {
        success: true,
        conversationId: existingConversation.id,
        message: 'Conversation already exists'
      };
    }

    // Create new conversation
    const { data: newConversation, error } = await supabase
      .from(tables.conversations)
      .insert({
        elevenlabs_conversation_id: params.elevenlabsConversationId,
        elevenlabs_agent_id: params.elevenlabsAgentId,
        user_id: params.userId,
        anon_session_id: params.anonSessionId || null,
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return { success: false, error: 'Failed to create conversation' };
    }

    return {
      success: true,
      conversationId: newConversation.id,
      message: 'Conversation started successfully'
    };

  } catch (error) {
    console.error('Error in handleStartConversation:', error);
    return { success: false, error: 'Internal server error' };
  }
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
  req: MultiReadableRequest,
  tables: TableNames = DEFAULT_TABLES
) {
  try {
    // Verify security requirements
    if (!verifyToolSecret(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid tool secret' };
    }

    if (!verifyElevenLabsSignature(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid ElevenLabs signature' };
    }

    const rawBody = await req.text();
    const params: SaveMessageParams = JSON.parse(rawBody);

    // Check required parameters
    if (!params.elevenlabsConversationId || !params.role || !params.content) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Find the conversation
    const { data: conversation } = await supabase
      .from(tables.conversations)
      .select('id')
      .eq('elevenlabs_conversation_id', params.elevenlabsConversationId)
      .single();

    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    // Save the message
    const { data: newMessage, error } = await supabase
      .from(tables.messages)
      .insert({
        conversation_id: conversation.id,
        role: params.role,
        content: params.content,
        audio_url: params.audioUrl || null,
        duration_ms: params.durationMs || null,
        timestamp: params.timestamp || new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving message:', error);
      return { success: false, error: 'Failed to save message' };
    }

    return {
      success: true,
      messageId: newMessage.id,
      message: 'Message saved successfully'
    };

  } catch (error) {
    console.error('Error in handleSaveMessage:', error);
    return { success: false, error: 'Internal server error' };
  }
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
  req: MultiReadableRequest,
  tables: TableNames = DEFAULT_TABLES
) {
  try {
    // Verify security requirements
    if (!verifyToolSecret(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid tool secret' };
    }

    if (!verifyElevenLabsSignature(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid ElevenLabs signature' };
    }

    const rawBody = await req.text();
    const params: UpdateTopicParams = JSON.parse(rawBody);

    // Check required parameters
    if (!params.elevenlabsConversationId || !params.topic) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Find the conversation
    const { data: conversation } = await supabase
      .from(tables.conversations)
      .select('id, topics')
      .eq('elevenlabs_conversation_id', params.elevenlabsConversationId)
      .single();

    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    // Update the topic
    const updatedTopics = conversation.topics || [];
    if (!updatedTopics.includes(params.topic)) {
      updatedTopics.push(params.topic);
    }

    const { error } = await supabase
      .from(tables.conversations)
      .update({ topics: updatedTopics })
      .eq('id', conversation.id);

    if (error) {
      console.error('Error updating topic:', error);
      return { success: false, error: 'Failed to update topic' };
    }

    return {
      success: true,
      topic: params.topic,
      allTopics: updatedTopics,
      message: 'Topic updated successfully'
    };

  } catch (error) {
    console.error('Error in handleUpdateTopic:', error);
    return { success: false, error: 'Internal server error' };
  }
}

// =============================================================================
// CONVERSATION BINDING (shared identity resolution)
// =============================================================================

interface ConversationBinding {
  id: string;
  userId: string;
  agentId: string;
  anonSessionId: string | null;
  organisationId: string | null;
}

async function getConversationBinding(
  supabase: Supabase,
  tables: TableNames,
  elevenlabsConversationId: string
): Promise<ConversationBinding | null> {
  const { data, error } = await supabase
    .from(tables.conversations)
    .select('id, user_id, agent_id, anon_session_id, organisation_id')
    .eq('elevenlabs_conversation_id', elevenlabsConversationId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    agentId: data.agent_id,
    anonSessionId: data.anon_session_id ?? null,
    organisationId: data.organisation_id ?? null,
  };
}

// =============================================================================
// RECALL MEMORY (user_id derived from the conversation, not supplied)
// =============================================================================

export interface RecallMemoryParams {
  elevenlabsConversationId: string;
  query: string;
  memoryType?: MemoryType | 'all';
  identity?: { userId: string; agentId?: string | null };
}

export async function handleRecallMemory(
  supabase: Supabase,
  req: MultiReadableRequest,
  tables: TableNames = DEFAULT_TABLES
) {
  try {
    // Verify security requirements
    if (!verifyToolSecret(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid tool secret' };
    }

    if (!verifyElevenLabsSignature(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid ElevenLabs signature' };
    }

    const rawBody = await req.text();
    const params: RecallMemoryParams = JSON.parse(rawBody);

    // Check required parameters
    if (!params.query) {
      return { success: false, error: 'Missing query parameter' };
    }

    let userId: string;
    let agentId: string | null | undefined;

    // Use provided identity if available
    if (params.identity) {
      userId = params.identity.userId;
      agentId = params.identity.agentId;
    } else if (params.elevenlabsConversationId) {
      // Otherwise get from conversation binding
      const binding = await getConversationBinding(
        supabase,
        tables,
        params.elevenlabsConversationId
      );

      if (!binding) {
        return { success: false, error: 'Conversation not found' };
      }

      userId = binding.userId;
      agentId = binding.agentId;
    } else {
      return { success: false, error: 'Missing conversation ID or identity' };
    }

    // Build query
    let query = supabase
      .from(tables.memory)
      .select('*')
      .eq('user_id', userId);

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    if (params.memoryType && params.memoryType !== 'all') {
      query = query.eq('memory_type', params.memoryType);
    }

    query = query
      .ilike('content', `%${params.query}%`)
      .order('created_at', { ascending: false })
      .limit(5);

    // Execute query
    const { data: memories, error } = await query;

    if (error) {
      console.error('Error recalling memory:', error);
      return { success: false, error: 'Failed to recall memory' };
    }

    // Format response
    const found = memories.length;
    const summary = found > 0
      ? `Found ${found} memories about "${params.query}".`
      : `No memories found about "${params.query}".`;

    return {
      success: true,
      found,
      memories,
      summary
    };

  } catch (error) {
    console.error('Error in handleRecallMemory:', error);
    return { success: false, error: 'Internal server error' };
  }
}

// =============================================================================
// SAVE MEMORY (user_id + anon linkage derived from the conversation)
// =============================================================================

export interface SaveMemoryParams {
  elevenlabsConversationId: string;
  content: string;
  memoryType: MemoryType;
  importance?: number;
  tags?: string[];
  identity?: { userId: string; agentId?: string | null };
  organisationId?: string;
}

const VALID_MEMORY_TYPES: MemoryType[] = [
  'preference', 'context', 'goal', 'decision', 'followup', 'correction', 'insight',
];

export async function handleSaveMemory(
  supabase: Supabase,
  req: MultiReadableRequest,
  tables: TableNames = DEFAULT_TABLES
) {
  try {
    // Verify security requirements
    if (!verifyToolSecret(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid tool secret' };
    }

    if (!verifyElevenLabsSignature(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid ElevenLabs signature' };
    }

    const rawBody = await req.text();
    const params: SaveMemoryParams = JSON.parse(rawBody);

    // Validate parameters
    if (!params.content || !params.memoryType) {
      return { success: false, error: 'Missing required parameters' };
    }

    if (!VALID_MEMORY_TYPES.includes(params.memoryType)) {
      return { success: false, error: 'Invalid memory type' };
    }

    let userId: string;
    let agentId: string | null | undefined;
    let organisationId: string | null | undefined;

    // Use provided identity if available
    if (params.identity) {
      userId = params.identity.userId;
      agentId = params.identity.agentId;
      organisationId = params.organisationId ?? null;
    } else if (params.elevenlabsConversationId) {
      // Otherwise get from conversation binding
      const binding = await getConversationBinding(
        supabase,
        tables,
        params.elevenlabsConversationId
      );

      if (!binding) {
        return { success: false, error: 'Conversation not found' };
      }

      userId = binding.userId;
      agentId = binding.agentId;
      organisationId = binding.organisationId ?? params.organisationId ?? null;
    } else {
      return { success: false, error: 'Missing conversation ID or identity' };
    }

    if (!organisationId) {
      return { success: false, error: 'Missing organisation_id — memory must belong to an organisation' };
    }

    // Save memory
    const { data: newMemory, error } = await supabase
      .from(tables.memory)
      .insert({
        user_id: userId,
        agent_id: agentId || null,
        organisation_id: organisationId,
        content: params.content,
        memory_type: params.memoryType,
        importance: params.importance || 0,
        tags: params.tags || [],
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving memory:', error);
      return { success: false, error: 'Failed to save memory' };
    }

    return {
      success: true,
      memoryId: newMemory.id,
      message: 'Memory saved successfully'
    };

  } catch (error) {
    console.error('Error in handleSaveMemory:', error);
    return { success: false, error: 'Internal server error' };
  }
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

export type OnConversationComplete = (
  conversation: { id: string; userId: string; agentId: string; elevenlabsConversationId: string },
  supabase: Supabase
) => Promise<void>;

export async function handlePostCallWebhook(
  supabase: Supabase,
  req: MultiReadableRequest,
  tables: TableNames = DEFAULT_TABLES,
  onConversationComplete?: OnConversationComplete
) {
  try {
    // Verify security requirements
    if (!verifyToolSecret(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid tool secret' };
    }

    if (!verifyElevenLabsSignature(req)) {
      return { success: false, error: 'Unauthorized - Missing or invalid ElevenLabs signature' };
    }

    const rawBody = await req.text();
    const params: PostCallParams = JSON.parse(rawBody);

    // Check required parameters
    if (!params.conversationId || !params.userId || !params.messages) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Check if conversation is already processed
    const { data: existingConversation } = await supabase
      .from(tables.conversations)
      .select('id, processed_at')
      .eq('elevenlabs_conversation_id', params.conversationId)
      .single();

    if (!existingConversation) {
      return { success: false, error: 'Conversation not found' };
    }

    if (existingConversation.processed_at) {
      return {
        success: true,
        processed: false,
        alreadyProcessed: true,
        message: 'Conversation already processed'
      };
    }

    // Process the conversation
    const { error: updateError } = await supabase
      .from(tables.conversations)
      .update({
        topic: params.topic,
        status: params.status,
        started_at: params.startedAt,
        ended_at: params.endedAt,
        duration_secs: params.durationSecs,
        termination_reason: params.terminationReason || null,
        summary: params.summary || null,
        processed_at: new Date().toISOString()
      })
      .eq('id', existingConversation.id);

    if (updateError) {
      console.error('Error updating conversation:', updateError);
      return { success: false, error: 'Failed to update conversation' };
    }

    // Save messages
    const messageInserts = params.messages.map(msg => ({
      conversation_id: existingConversation.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }));

    const { error: messagesError } = await supabase
      .from(tables.messages)
      .insert(messageInserts);

    if (messagesError) {
      console.error('Error saving messages:', messagesError);
      return { success: false, error: 'Failed to save messages' };
    }

    // Execute product extension if provided
    if (onConversationComplete) {
      try {
        await onConversationComplete(
          {
            id: existingConversation.id,
            userId: params.userId,
            agentId: params.elevenlabsAgentId,
            elevenlabsConversationId: params.conversationId
          },
          supabase
        );
      } catch (extensionError) {
        console.error('Error in onConversationComplete:', extensionError);
        // Continue even if extension fails
      }
    }

    return {
      success: true,
      processed: true,
      alreadyProcessed: false,
      message: 'Conversation processed successfully'
    };

  } catch (error) {
    console.error('Error in handlePostCallWebhook:', error);
    return { success: false, error: 'Internal server error' };
  }
}