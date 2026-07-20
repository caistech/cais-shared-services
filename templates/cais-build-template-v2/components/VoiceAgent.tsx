'use client';

import { VoiceWidget } from '@caistech/elevenlabs-convai/react';
import { voiceConfig, PLACEHOLDER_AGENT_ID } from '@/voice.config';

// Chrome-level voice agent (PRODUCT_STANDARDS §6). Consumes the hub VoiceWidget —
// never a per-project reimplementation — and reads its agent id from voice.config.ts,
// which the provisioning step (scripts/voice-init.mjs --provision / new-product.mjs)
// overwrites with the real id. "Morgan" is the persona rendered THROUGH this widget
// (set coachName/avatarUrl once you have the coach surface).
//
// Degrade-don't-fake: while voice.config.ts still holds the placeholder id (no agent
// provisioned yet) this renders nothing, so the template builds and runs unchanged.
// The instant an agent is provisioned, the launcher appears — no code change.
export function VoiceAgent() {
  if (!voiceConfig.agentId || voiceConfig.agentId === PLACEHOLDER_AGENT_ID) {
    return null;
  }
  return <VoiceWidget {...voiceConfig} />;
}
