// elevenlabs-convai/webhook.ts
// Generic ElevenLabs webhook signature verification and payload parsing.
// Framework-agnostic — returns parsed data. The consuming project wraps this
// in its own route handler (Next.js, Express, etc).

import crypto from 'crypto';
import type { ElevenLabsPostCallPayload, ConvAIWebhookEvent } from './types.js';

// =============================================================================
// SIGNATURE VERIFICATION
// =============================================================================

/**
 * Verify the HMAC signature on an ElevenLabs webhook request.
 * Returns true if valid, false otherwise.
 *
 * @param rawBody  — the raw request body as a string (NOT parsed JSON)
 * @param signature — the `elevenlabs-signature` header value
 * @param secret    — your ELEVENLABS_WEBHOOK_SECRET
 * @param maxAgeSecs — max age of the signature timestamp (default 300s / 5 min)
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
  maxAgeSecs: number = 300
): boolean {
  if (!signature || !secret) return false;

  // Tolerate stray whitespace / trailing newline in env-stored secrets and proxied
  // headers (e.g. a `\n` left by `echo secret | vercel env add`). Real values have none,
  // so trimming is safe and prevents a silent verification failure.
  secret = secret.trim();
  signature = signature.trim();

  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const hash = parts.find(p => p.startsWith('v0='))?.slice(3);

  if (!timestamp || !hash) return false;

  const timestampAge = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (timestampAge > maxAgeSecs) return false;

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}

// =============================================================================
// PAYLOAD PARSING
// =============================================================================

/**
 * Parse a raw ElevenLabs post-call webhook payload.
 * Returns null if the payload is malformed.
 */
export function parsePostCallPayload(rawBody: string): ElevenLabsPostCallPayload | null {
  try {
    const payload = JSON.parse(rawBody);
    if (!payload?.type || !payload?.data?.agent_id || !payload?.data?.conversation_id) {
      return null;
    }
    return payload as ElevenLabsPostCallPayload;
  } catch {
    return null;
  }
}

/**
 * Parse a generic ConvAI webhook event.
 * Returns null if the payload is malformed.
 */
export function parseWebhookEvent(body: unknown): ConvAIWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;

  const event = body as Record<string, unknown>;
  if (!event.type || !event.conversation_id || !event.agent_id) return null;

  return {
    type: event.type as ConvAIWebhookEvent['type'],
    conversation_id: event.conversation_id as string,
    agent_id: event.agent_id as string,
    data: (event.data || {}) as ConvAIWebhookEvent['data'],
  };
}

// =============================================================================
// CONVERSATION DATA EXTRACTION
// =============================================================================

/**
 * Extract conversation persistence data from a post-call payload.
 * Returns a flat object ready to upsert into your conversations table.
 */
export function extractConversationData(
  payload: ElevenLabsPostCallPayload,
  userId: string
) {
  const { data } = payload;
  const { conversation_id, status, metadata, analysis, transcript } = data;

  const topic = analysis?.transcript_summary?.slice(0, 200)
    || extractTopicFromTranscript(transcript)
    || 'General conversation';

  return {
    userId,
    elevenlabsConversationId: conversation_id,
    status: status === 'done' ? 'completed' : status,
    topic,
    startedAt: metadata?.start_time_unix_secs
      ? new Date(metadata.start_time_unix_secs * 1000).toISOString()
      : new Date().toISOString(),
    endedAt: metadata?.end_time_unix_secs
      ? new Date(metadata.end_time_unix_secs * 1000).toISOString()
      : new Date().toISOString(),
    durationSecs: metadata?.call_duration_secs || 0,
    terminationReason: metadata?.termination_reason,
    summary: analysis?.transcript_summary,
  };
}

/**
 * Extract individual messages from a post-call transcript.
 * Normalizes 'agent' role to 'assistant'.
 *
 * Skips the agent's TOOL-CALL turns — when an agent calls a tool (save_message, update_topic, a
 * product webhook, …) the transcript records a turn with `message: null`. Those carry no spoken
 * content, so they are NOT conversational messages; persisting them also breaks any consumer whose
 * messages.content is NOT NULL (the SayFix post-call 500 → "no transcript" → no ticket, 2026-06-10).
 * Filtering them yields a clean transcript and a content value that's always a real string.
 */
export function extractMessages(
  payload: ElevenLabsPostCallPayload,
  userId: string
) {
  const { data } = payload;
  const { transcript, metadata } = data;

  if (!transcript || transcript.length === 0) return [];

  const baseTime = metadata?.start_time_unix_secs || (Date.now() / 1000);

  return transcript
    .filter(t => t.message != null && String(t.message).trim() !== '')
    .map(t => ({
      userId,
      role: t.role === 'agent' ? 'assistant' as const : t.role as 'user',
      content: t.message as string,
      timeInCallSecs: t.time_in_call_secs,
      timestamp: new Date((baseTime + t.time_in_call_secs) * 1000).toISOString(),
    }));
}

// =============================================================================
// HELPERS
// =============================================================================

function extractTopicFromTranscript(
  transcript: ElevenLabsPostCallPayload['data']['transcript']
): string | null {
  if (!transcript) return null;
  const userMessages = transcript
    .filter(t => t.role === 'user')
    .slice(0, 3)
    .map(t => t.message)
    .join(' ');
  return userMessages ? userMessages.slice(0, 200) : null;
}
