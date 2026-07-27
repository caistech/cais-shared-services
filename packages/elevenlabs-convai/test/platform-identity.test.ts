// The identity parameters must be fillable by SOMETHING that actually knows them.
//
// Before 0.11.0 every conversation tool declared `conversation_id` (and `elevenlabs_agent_id`) as an
// LLM-filled property with a description. ElevenLabs never tells an agent its own conversation id,
// so the model either omitted the parameter — 400, "Missing identity or conversation_id" — or
// invented one, which resolved to nothing. Memory tools returned empty in every real call while
// every unit test passed, because a unit test supplies the id the platform withholds.
//
// These assertions are the difference. They pin the SHAPE ElevenLabs requires, not our intent:
// `dynamic_variable` is mutually exclusive with `description`, so emitting both is a rejected tool,
// and emitting neither is the silent-failure default we are leaving behind.

import { describe, it, expect } from 'vitest';
import { createConversationTools, SYSTEM_AGENT_ID, SYSTEM_CONVERSATION_ID } from '../src/conversation-tools.js';

const BASE = 'https://app.example.com';

/** Every parameter across every tool whose name marks it as an identity parameter. */
const identityParams = (tools: ReturnType<typeof createConversationTools>) =>
  tools.flatMap((tool) =>
    Object.entries(tool.parameters.properties)
      .filter(([name]) => name.endsWith('conversation_id') || name.endsWith('agent_id'))
      .map(([name, prop]) => ({ tool: tool.name, name, prop })),
  );

describe('createConversationTools — platformIdentity', () => {
  it('defaults to LLM-filled identity, so existing consumers are untouched', () => {
    const params = identityParams(createConversationTools(BASE));
    expect(params.length).toBeGreaterThan(0);
    for (const { prop } of params) {
      expect(prop.description).toBeTruthy();
      expect(prop.dynamic_variable).toBeUndefined();
    }
  });

  it('binds every identity parameter to a system dynamic variable when enabled', () => {
    const params = identityParams(createConversationTools(BASE, undefined, { platformIdentity: true }));

    // Five tools, and the conversation id appears in all of them — a single missed tool is a tool
    // that still fails at runtime, which is exactly how this survived the first time.
    expect(params.length).toBe(6);
    for (const { name, prop } of params) {
      expect(prop.dynamic_variable).toBe(
        name.endsWith('agent_id') ? SYSTEM_AGENT_ID : SYSTEM_CONVERSATION_ID,
      );
    }
  });

  it('drops the description on a bound parameter — the two fields are mutually exclusive', () => {
    const params = identityParams(createConversationTools(BASE, undefined, { platformIdentity: true }));
    for (const { prop } of params) {
      expect(prop.description).toBeUndefined();
    }
  });

  it('leaves non-identity parameters LLM-filled — the agent still supplies the content', () => {
    const tools = createConversationTools(BASE, undefined, { platformIdentity: true });
    const saveMemory = tools.find((t) => t.name === 'save_memory');
    expect(saveMemory?.parameters.properties.memory?.description).toBeTruthy();
    expect(saveMemory?.parameters.properties.memory?.dynamic_variable).toBeUndefined();

    const recall = tools.find((t) => t.name === 'recall_memory');
    expect(recall?.parameters.properties.query?.description).toBeTruthy();
  });

  it('composes with a baked tool secret without disturbing either', () => {
    const tools = createConversationTools(BASE, undefined, {
      platformIdentity: true,
      secret: 'shhh',
    });
    for (const tool of tools) {
      expect(tool.webhook?.headers?.['x-convai-tool-secret']).toBe('shhh');
    }
    expect(identityParams(tools).every((p) => p.prop.dynamic_variable)).toBe(true);
  });
});
