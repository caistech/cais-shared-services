// test-webhooks.cjs
const { createMultiReadableRequest } = require('./request-utils');
const {
  handleStartConversation,
  handleSaveMessage,
  handleUpdateTopic,
  handleRecallMemory,
  handleSaveMemory,
  handlePostCallWebhook
} = require('./webhook-handlers');

// Mock Supabase client
const mockSupabase = {
  from: (table) => ({
    select: () => ({
      eq: () => ({
        single: () => ({ data: { id: '1', user_id: 'test-user', agent_id: 'test-agent', anon_session_id: null }, error: null }),
        maybeSingle: () => ({ data: { id: '1', user_id: 'test-user', agent_id: 'test-agent', anon_session_id: null }, error: null }),
      }),
      ilike: () => ({
        order: () => ({
          limit: () => ({ data: [], error: null }),
        }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: () => ({ data: { id: '1' }, error: null }),
      }),
    }),
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => ({ data: { id: '1' }, error: null }),
          maybeSingle: () => ({ data: { id: '1' }, error: null }),
        }),
      }),
      in: () => ({ error: null }),
    }),
    upsert: () => ({ error: null }),
  }),
  rpc: () => ({ data: null, error: null }),
};

async function testWebhookHandling() {
  // Test with dennis@factory2key.com.au user
  const dennisReq = new Request('http://localhost/api/kira/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ElevenLabs-Signature': 'valid-signature',
      'X-ConvAI-Tool-Secret': 'valid-secret'
    },
    body: JSON.stringify({
      elevenlabsConversationId: 'conv-123',
      elevenlabsAgentId: 'agent-123',
      userId: 'dennis@factory2key.com.au',
      role: 'user',
      content: 'Test message',
      query: 'Test query',
      memoryType: 'context',
      topic: 'Test topic',
      status: 'completed',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSecs: 60,
      messages: [{ role: 'user', content: 'Test message', timestamp: new Date().toISOString() }]
    })
  });

  const dennisMultiReq = await createMultiReadableRequest(dennisReq);

  // Test all handler functions with the dennis user
  const dennisStartResult = await handleStartConversation(mockSupabase, dennisMultiReq.clone());
  console.log('Dennis start conversation result:', dennisStartResult);

  const dennisSaveMessageResult = await handleSaveMessage(mockSupabase, dennisMultiReq.clone());
  console.log('Dennis save message result:', dennisSaveMessageResult);

  const dennisUpdateTopicResult = await handleUpdateTopic(mockSupabase, dennisMultiReq.clone());
  console.log('Dennis update topic result:', dennisUpdateTopicResult);

  const dennisRecallMemoryResult = await handleRecallMemory(mockSupabase, dennisMultiReq.clone());
  console.log('Dennis recall memory result:', dennisRecallMemoryResult);

  const dennisSaveMemoryResult = await handleSaveMemory(mockSupabase, dennisMultiReq.clone());
  console.log('Dennis save memory result:', dennisSaveMemoryResult);

  const dennisPostCallResult = await handlePostCallWebhook(mockSupabase, dennisMultiReq.clone());
  console.log('Dennis post call result:', dennisPostCallResult);

  // Test with mcmdennis@gmail.com user
  const mcmdennisReq = new Request('http://localhost/api/kira/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ElevenLabs-Signature': 'valid-signature',
      'X-ConvAI-Tool-Secret': 'valid-secret'
    },
    body: JSON.stringify({
      elevenlabsConversationId: 'conv-123',
      elevenlabsAgentId: 'agent-123',
      userId: 'mcmdennis@gmail.com',
      role: 'user',
      content: 'Test message',
      query: 'Test query',
      memoryType: 'context',
      topic: 'Test topic',
      status: 'completed',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSecs: 60,
      messages: [{ role: 'user', content: 'Test message', timestamp: new Date().toISOString() }]
    })
  });

  const mcmdennisMultiReq = await createMultiReadableRequest(mcmdennisReq);

  // Test all handler functions with the mcmdennis user
  const mcmdennisStartResult = await handleStartConversation(mockSupabase, mcmdennisMultiReq.clone());
  console.log('Mcmdennis start conversation result:', mcmdennisStartResult);

  const mcmdennisSaveMessageResult = await handleSaveMessage(mockSupabase, mcmdennisMultiReq.clone());
  console.log('Mcmdennis save message result:', mcmdennisSaveMessageResult);

  const mcmdennisUpdateTopicResult = await handleUpdateTopic(mockSupabase, mcmdennisMultiReq.clone());
  console.log('Mcmdennis update topic result:', mcmdennisUpdateTopicResult);

  const mcmdennisRecallMemoryResult = await handleRecallMemory(mockSupabase, mcmdennisMultiReq.clone());
  console.log('Mcmdennis recall memory result:', mcmdennisRecallMemoryResult);

  const mcmdennisSaveMemoryResult = await handleSaveMemory(mockSupabase, mcmdennisMultiReq.clone());
  console.log('Mcmdennis save memory result:', mcmdennisSaveMemoryResult);

  const mcmdennisPostCallResult = await handlePostCallWebhook(mockSupabase, mcmdennisMultiReq.clone());
  console.log('Mcmdennis post call result:', mcmdennisPostCallResult);
}

testWebhookHandling().catch(console.error);