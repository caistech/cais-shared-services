-- elevenlabs-convai/migration.sql
-- Generic Supabase tables for ElevenLabs Conversational AI.
-- Copy and adapt for your project. Table names use convai_ prefix by default.
-- If your project already has these tables under different names (e.g., kira_agents),
-- pass custom tableNames to the webhook-handlers functions instead.
--
-- Prerequisites: uuid-ossp or pgcrypto extension for gen_random_uuid()

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- HELPER: updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 1. AGENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS convai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner (references your project's users table — adjust FK as needed)
  user_id UUID NOT NULL,

  -- Agent identity
  agent_name TEXT NOT NULL,

  -- ElevenLabs
  elevenlabs_agent_id TEXT UNIQUE NOT NULL,

  -- Agent configuration
  system_prompt TEXT,
  first_message TEXT,
  voice_id TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'paused', 'deleted')),

  -- Usage stats
  total_conversations INT DEFAULT 0,
  total_minutes INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_conversation_at TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_convai_agents_updated ON convai_agents;
CREATE TRIGGER trg_convai_agents_updated BEFORE UPDATE ON convai_agents
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. CONVERSATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS convai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES convai_agents(id) ON DELETE CASCADE,

  -- ElevenLabs tracking
  elevenlabs_conversation_id TEXT UNIQUE,

  -- Session info
  title TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT,

  -- Content
  transcript_text TEXT,
  transcript_json JSONB,

  -- Topics discussed (for memory/continuity)
  topics TEXT[] DEFAULT '{}',
  last_topic TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  summary TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_convai_conversations_updated ON convai_conversations;
CREATE TRIGGER trg_convai_conversations_updated BEFORE UPDATE ON convai_conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 3. MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS convai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  conversation_id UUID NOT NULL REFERENCES convai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES convai_agents(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  -- Voice metadata
  audio_url TEXT,
  duration_ms INTEGER,
  message_index INTEGER,

  -- Timestamps
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- 4. MEMORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS convai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES convai_agents(id) ON DELETE CASCADE,

  -- Memory classification
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'preference', 'context', 'goal', 'decision',
    'followup', 'correction', 'insight'
  )),

  -- The actual memory
  content TEXT NOT NULL,

  -- Source
  source_conversation_id UUID REFERENCES convai_conversations(id) ON DELETE SET NULL,

  -- Retrieval
  importance INT DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  tags TEXT[] DEFAULT '{}',

  -- Validity
  active BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES convai_memory(id),

  -- Usage tracking
  recall_count INT DEFAULT 0,
  last_recalled_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_convai_memory_updated ON convai_memory;
CREATE TRIGGER trg_convai_memory_updated BEFORE UPDATE ON convai_memory
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 5. MESSAGE INSERT TRIGGER (auto-update conversation stats)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE convai_conversations
  SET
    message_count = COALESCE(message_count, 0) + 1,
    last_message_at = NEW.timestamp,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON convai_messages;
CREATE TRIGGER trigger_update_conversation_on_message
AFTER INSERT ON convai_messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();


-- ============================================================================
-- 6. CONVERSATION CONTEXT RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION get_conversation_context(
  p_agent_id UUID,
  p_user_id UUID,
  p_message_limit INTEGER DEFAULT 20
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  last_conv RECORD;
  time_gap INTERVAL;
BEGIN
  SELECT
    c.id,
    c.last_message_at,
    c.last_topic,
    c.summary,
    c.message_count,
    c.title
  INTO last_conv
  FROM convai_conversations c
  WHERE c.agent_id = p_agent_id
    AND c.user_id = p_user_id
    AND c.status = 'active'
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 1;

  IF last_conv.id IS NULL THEN
    RETURN json_build_object(
      'has_history', false,
      'recent_messages', '[]'::json,
      'memories', '[]'::json
    );
  END IF;

  time_gap := NOW() - last_conv.last_message_at;

  SELECT json_build_object(
    'has_history', true,
    'conversation_id', last_conv.id,
    'last_message_at', last_conv.last_message_at,
    'time_gap_seconds', EXTRACT(EPOCH FROM time_gap)::INTEGER,
    'time_gap_category',
      CASE
        WHEN time_gap < INTERVAL '1 hour' THEN 'recent'
        WHEN time_gap < INTERVAL '1 day' THEN 'today'
        WHEN time_gap < INTERVAL '7 days' THEN 'this_week'
        ELSE 'older'
      END,
    'last_topic', last_conv.last_topic,
    'summary', last_conv.summary,
    'message_count', last_conv.message_count,
    'title', last_conv.title,
    'recent_messages', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', m.id,
          'role', m.role,
          'content', m.content,
          'timestamp', m.timestamp
        ) ORDER BY m.timestamp DESC
      ), '[]'::json)
      FROM (
        SELECT * FROM convai_messages
        WHERE conversation_id = last_conv.id
        ORDER BY timestamp DESC
        LIMIT p_message_limit
      ) m
    ),
    'memories', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', mem.id,
          'type', mem.memory_type,
          'content', mem.content,
          'importance', mem.importance
        ) ORDER BY mem.importance DESC
      ), '[]'::json)
      FROM (
        SELECT * FROM convai_memory
        WHERE agent_id = p_agent_id
          AND user_id = p_user_id
          AND active = true
        ORDER BY importance DESC, created_at DESC
        LIMIT 10
      ) mem
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE convai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE convai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE convai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE convai_memory ENABLE ROW LEVEL SECURITY;

-- Default policies: users can only see their own data.
-- Adjust these for your project's auth model.

CREATE POLICY "Users see own agents" ON convai_agents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users see own conversations" ON convai_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users see own messages" ON convai_messages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users see own memories" ON convai_memory
  FOR SELECT USING (user_id = auth.uid());

-- Service role can do everything (for webhook handlers).
-- Your webhook routes should use createServiceClient().
