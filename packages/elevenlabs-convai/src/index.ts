// elevenlabs-convai/index.ts
// Shared ElevenLabs Conversational AI service for Corporate AI Solutions.
//
// Server-side entry point. The React VoiceWidget ships from the subpath
// "@caistech/elevenlabs-convai/react" (PR2) so this entry stays React-free for
// server-only consumers.
//
// Usage:
//   import {
//     provisionVoiceAgent,
//     createConversationTools,
//     createConvaiWebhookRoutes,
//   } from '@caistech/elevenlabs-convai';

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
  VoiceConfig,
  VoiceConfigBase,
  VoicePlacement,
  VoiceMode,
} from './types.js';

// Agent CRUD + provisioning helpers (server-side)
export {
  ELEVENLABS_API,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgent,
  getConversationHistory,
  listAgents,
  findAgentsByName,
  defaultVoiceModelFor,
  DEFAULT_AGENT_LLM,
  toElevenLabsTools,
  WORKSPACE_TOOLS_API,
  toWorkspaceToolConfig,
  ensureWorkspaceTools,
  buildOverrideEnablement,
} from './agent-client.js';
export type { AgentSummary } from './agent-client.js';

// Idempotent end-to-end provisioning (server-side)
export {
  provisionVoiceAgent,
  bindWorkspaceWebhook,
  verifyAgentProvisioned,
  setAllowlist,
  setAgentOverrides,
  setAgentTools,
  standardAllowlist,
} from './provision.js';
export type { ProvisionVoiceAgentOptions, ProvisionResult } from './provision.js';

// Webhook utilities (server-side)
export {
  verifyWebhookSignature,
  parsePostCallPayload,
  parseWebhookEvent,
  extractConversationData,
  extractMessages,
} from './webhook.js';

// Webhook handlers (server-side, Supabase)
export {
  handleStartConversation,
  handleSaveMessage,
  handleUpdateTopic,
  handleRecallMemory,
  handleSaveMemory,
  handlePostCallWebhook,
} from './webhook-handlers.js';
export type { TableNames, OnConversationComplete } from './webhook-handlers.js';

// Next.js webhook route factory (server-side)
export { createConvaiWebhookRoutes } from './routes.js';
export type {
  ConvaiWebhookRoutes,
  CreateConvaiWebhookRoutesOptions,
  ConvaiRouteContext,
} from './routes.js';

// Anonymous-session tokens (ephemeral; server-side)
export {
  mintAnonSessionToken,
  verifyAnonSessionToken,
  hashToken,
} from './session.js';
export type { AnonSessionClaims, MintAnonSessionOptions } from './session.js';

// Conversation tools (agent config)
export {
  createConversationTools,
  conversationContinuityPrompt,
} from './conversation-tools.js';

// Scaffold-wizard helpers (pure; the wizard in scripts/ does the I/O)
export {
  buildVoiceConfig,
  renderVoiceConfigModule,
  PLACEMENTS,
  MODES,
} from './voice-init.js';
export type { VoiceInitAnswers } from './voice-init.js';
