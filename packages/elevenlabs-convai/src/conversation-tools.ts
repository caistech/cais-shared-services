// elevenlabs-convai/conversation-tools.ts
// Generic conversation tools for ElevenLabs ConvAI agents.
// These are webhook-based tools the agent calls during a conversation
// to maintain context, save messages, and manage memory.
//
// Usage: pass `baseUrl` (your app's own public URL) to `createConversationTools()`.
// Wire the returned tool definitions into your agent config.
// Implement the webhook handlers in your project's API routes.

import type { ConvAITool } from './types.js';

// =============================================================================
// TOOL FACTORY
// =============================================================================

/**
 * Create the standard set of conversation tools.
 * Each tool calls a webhook on YOUR server — you provide the host and implement
 * the handlers. This package never targets a shared/default endpoint; the
 * caller's `baseUrl` is the only host the returned tool definitions point at.
 *
 * @param baseUrl — your app's public URL (e.g., `https://your-app.example.com`).
 *                  Required. Throws if missing/empty so BYOK consumers never
 *                  accidentally point at a default host.
 * @param webhookBasePath — base path for webhook routes (default: '/api/convai/webhooks')
 */
export function createConversationTools(
  baseUrl: string,
  webhookBasePath: string = '/api/convai/webhooks'
): ConvAITool[] {
  if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new Error(
      '@caistech/elevenlabs-convai: createConversationTools(baseUrl) requires ' +
      "a non-empty baseUrl set to YOUR app's public URL " +
      "(e.g., 'https://your-app.example.com'). The package ships no default " +
      'host — BYOK consumers must point the conversation webhooks at their own infrastructure.'
    );
  }
  const url = (path: string) => `${baseUrl}${webhookBasePath}/${path}`;
  const headers = { 'Content-Type': 'application/json' };

  return [
    getConversationContextTool(url('start_conversation'), headers),
    saveMessageTool(url('save_message'), headers),
    updateTopicTool(url('update_topic'), headers),
    recallMemoryTool(url('recall_memory'), headers),
    saveMemoryTool(url('save_memory'), headers),
  ];
}

// =============================================================================
// INDIVIDUAL TOOL DEFINITIONS
// =============================================================================

function getConversationContextTool(webhookUrl: string, headers: Record<string, string>): ConvAITool {
  return {
    type: 'webhook',
    name: 'get_conversation_context',
    description: `Call this tool at the VERY START of every conversation to check if the user has talked to you before.
This tells you:
- Whether they're a returning user
- What you were last discussing
- How long since they last chatted
- Their key memories and preferences

Use this to greet returning users appropriately and continue where you left off.`,
    webhook: { url: webhookUrl, method: 'POST', headers },
    parameters: {
      type: 'object',
      properties: {
        elevenlabs_conversation_id: {
          type: 'string',
          description: 'The current conversation ID from ElevenLabs',
        },
        elevenlabs_agent_id: {
          type: 'string',
          description: 'Your agent ID',
        },
        user_id: {
          type: 'string',
          description: 'The user ID',
        },
      },
      required: ['elevenlabs_conversation_id', 'elevenlabs_agent_id', 'user_id'],
    },
  };
}

function saveMessageTool(webhookUrl: string, headers: Record<string, string>): ConvAITool {
  return {
    type: 'webhook',
    name: 'save_message',
    description: `Save a message to the conversation history. Call this after meaningful exchanges to ensure continuity.
You don't need to call this for every single utterance — focus on substantive messages.`,
    webhook: { url: webhookUrl, method: 'POST', headers },
    parameters: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'The ElevenLabs conversation ID',
        },
        role: {
          type: 'string',
          enum: ['user', 'assistant'],
          description: 'Who said this message',
        },
        content: {
          type: 'string',
          description: 'The message content',
        },
      },
      required: ['conversation_id', 'role', 'content'],
    },
  };
}

function updateTopicTool(webhookUrl: string, headers: Record<string, string>): ConvAITool {
  return {
    type: 'webhook',
    name: 'update_conversation_topic',
    description: `Update the current conversation topic when it shifts to something new.
This helps you remember what you were discussing when the user returns.`,
    webhook: { url: webhookUrl, method: 'POST', headers },
    parameters: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'The ElevenLabs conversation ID',
        },
        topic: {
          type: 'string',
          description: 'Brief description of the current topic',
        },
      },
      required: ['conversation_id', 'topic'],
    },
  };
}

function recallMemoryTool(webhookUrl: string, headers: Record<string, string>): ConvAITool {
  return {
    type: 'webhook',
    name: 'recall_memory',
    description: `Search your memory for past insights about this user.
Use this when you need to remember something specific they've told you before.`,
    webhook: { url: webhookUrl, method: 'POST', headers },
    parameters: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'The user ID',
        },
        query: {
          type: 'string',
          description: 'What you want to remember (e.g., "their budget", "family situation", "business goals")',
        },
      },
      required: ['user_id', 'query'],
    },
  };
}

function saveMemoryTool(webhookUrl: string, headers: Record<string, string>): ConvAITool {
  return {
    type: 'webhook',
    name: 'save_memory',
    description: `Save something important to remember about this user for future conversations.
Use this for key facts, preferences, decisions, or anything you should remember long-term.`,
    webhook: { url: webhookUrl, method: 'POST', headers },
    parameters: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'The user ID',
        },
        memory: {
          type: 'string',
          description: 'The fact or insight to remember',
        },
        category: {
          type: 'string',
          description: 'Optional category (preference, context, goal, decision, followup, correction, insight)',
        },
      },
      required: ['user_id', 'memory'],
    },
  };
}

// =============================================================================
// CONTINUITY PROMPT
// =============================================================================

/**
 * Append this to your agent's system prompt to enable conversation continuity.
 * The agent will call the tools above to remember users across sessions.
 */
export const conversationContinuityPrompt = `
## CONVERSATION CONTINUITY

At the START of every conversation, call \`get_conversation_context\` to check if this user has talked to you before.

Based on the response:

**If returning user (has_history = true):**
- Check time_gap_category:
  - "recent" (< 1 hour): Just continue naturally, no special greeting needed
  - "today" (1-24 hours): "Hey, you're back! We were talking about [last_topic]..."
  - "this_week" (1-7 days): "Good to see you again! Last time we were working on [last_topic]..."
  - "older" (7+ days): "Hey! It's been a bit. We were working on [last_topic] — still relevant?"
- Reference their memories and context naturally
- Offer to continue OR pivot if they have something new

**If new user (has_history = false):**
- Greet them warmly as a first-time user
- Don't reference any past conversations

**During the conversation:**
- Call \`save_message\` for substantive exchanges (not every "okay" or "got it")
- Call \`update_conversation_topic\` when the topic shifts significantly
- Call \`save_memory\` for important facts you should remember long-term

This ensures users feel like you remember them and can pick up where they left off.
`;
