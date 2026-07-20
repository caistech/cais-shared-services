// voice.config.ts — placeholder shipped with the template.
// Provision the real agent (which overwrites this file with the actual agent id) via:
//   node scripts/voice-init.mjs --target . --provision --name "My Product" --base-url https://my-product.vercel.app
// or, for a freshly-generated product, new-product.mjs writes it automatically.
//
// While agentId is the placeholder below, <VoiceAgent/> renders nothing
// (degrade-don't-fake) — so the template builds and runs without a provisioned agent.
import type { VoiceConfig } from '@caistech/elevenlabs-convai';

export const PLACEHOLDER_AGENT_ID = 'REPLACE_WITH_PROVISIONED_AGENT_ID';

export const voiceConfig: VoiceConfig = {
  agentId: PLACEHOLDER_AGENT_ID,
  placement: 'floating',
  mode: 'greeting',
  textFallback: true,
  personaRef: 'voice-config.json',
};
