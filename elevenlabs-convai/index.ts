// elevenlabs-convai/index.ts
// Shared ElevenLabs Conversational AI module for Corporate AI Solutions.
//
// Usage:
//   Copy this directory into your project (e.g., lib/convai/ or shared/convai/).
//   Import what you need:
//
//   import { createAgent, verifyWebhookSignature } from '@/lib/convai';
//   import { createConversationTools } from '@/lib/convai/conversation-tools';
//   import { handleStartConversation } from '@/lib/convai/webhook-handlers';

// Types
export type {
  ConvAIAgentConfig,
  ConvAIContext,
  ConvAITool,
  ConvAIWebhookEvent,
  ElevenLabsAgentConfig,
  ElevenLabsPostCallPayload,
  ConversationMessage,
  ConversationSession,
  MemoryType,
  MemoryEntry,
  VoiceWidgetProps,
} from './types';

// Agent CRUD (server-side)
export {
  createAgent,
  updateAgent,
  deleteAgent,
  getAgent,
  getConversationHistory,
  defaultVoiceModelFor,
} from './agent-client';

// Webhook utilities (server-side)
export {
  verifyWebhookSignature,
  parsePostCallPayload,
  parseWebhookEvent,
  extractConversationData,
  extractMessages,
} from './webhook';

// Webhook handlers (server-side, Supabase)
export {
  handleStartConversation,
  handleSaveMessage,
  handleUpdateTopic,
  handleRecallMemory,
  handleSaveMemory,
  handlePostCallWebhook,
} from './webhook-handlers';
export type { TableNames } from './webhook-handlers';

// Conversation tools (agent config)
export {
  createConversationTools,
  conversationContinuityPrompt,
} from './conversation-tools';
