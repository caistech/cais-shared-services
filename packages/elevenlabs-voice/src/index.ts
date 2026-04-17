/**
 * @caistech/elevenlabs-voice — ElevenLabs TTS + STT wrappers.
 * For one-shot text-to-speech and speech-to-text operations.
 * NOT for conversational AI (use @caistech/elevenlabs-convai for that).
 *
 * Extracted from Mova's lingoCore.ts. Used by: Mova, TourLingo.
 */

// =============================================================================
// CONFIG
// =============================================================================

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

// Default voice: Tim — warm, friendly Australian
const DEFAULT_VOICE_ID = '2pwMUCWPsm9t6AwXYaCj';

const VOICE_MAP: Record<string, string> = {
  en: DEFAULT_VOICE_ID, de: DEFAULT_VOICE_ID, ja: DEFAULT_VOICE_ID,
  zh: DEFAULT_VOICE_ID, ko: DEFAULT_VOICE_ID, fr: DEFAULT_VOICE_ID,
  es: DEFAULT_VOICE_ID, it: DEFAULT_VOICE_ID, pt: DEFAULT_VOICE_ID,
  nl: DEFAULT_VOICE_ID,
};

// =============================================================================
// TYPES
// =============================================================================

export interface TTSOptions {
  voiceId?: string;
  model?: 'flash' | 'multilingual';
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

export interface STTOptions {
  language?: string;
  modelId?: string;
}

export interface STTResult {
  text: string;
  language?: string;
  confidence?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

export function getVoiceId(langCode: string): string {
  return VOICE_MAP[langCode] || DEFAULT_VOICE_ID;
}

// =============================================================================
// TEXT-TO-SPEECH
// =============================================================================

/**
 * Convert text to speech via ElevenLabs. Returns base64 data URL.
 */
export async function speakText(
  text: string,
  langCode: string,
  apiKey: string,
  options?: TTSOptions
): Promise<string> {
  const voiceId = options?.voiceId || getVoiceId(langCode);
  const modelId = options?.model === 'flash'
    ? 'eleven_flash_v2_5'
    : 'eleven_multilingual_v2';

  const response = await fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: options?.stability ?? 0.5,
        similarity_boost: options?.similarityBoost ?? 0.75,
        style: options?.style ?? 0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs TTS error: ${error}`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/mp3;base64,${btoa(binary)}`;
}

/**
 * Streaming TTS. Returns a ReadableStream of audio bytes.
 */
export async function speakTextStream(
  text: string,
  langCode: string,
  apiKey: string,
  options?: TTSOptions
): Promise<ReadableStream<Uint8Array>> {
  const voiceId = options?.voiceId || getVoiceId(langCode);

  const response = await fetch(`${ELEVENLABS_TTS_URL}/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: options?.stability ?? 0.5,
        similarity_boost: options?.similarityBoost ?? 0.75,
        style: options?.style ?? 0,
        use_speaker_boost: true,
      },
      optimize_streaming_latency: 3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs stream error: ${error}`);
  }

  if (!response.body) throw new Error('No response body for streaming');
  return response.body;
}

// =============================================================================
// SPEECH-TO-TEXT
// =============================================================================

/**
 * Transcribe audio via ElevenLabs Scribe.
 * @param audio — audio Blob or File
 * @param filename — filename with correct extension (e.g., 'audio.mp4' for Safari)
 * @param apiKey — ElevenLabs API key
 * @param options — language hint, model override
 */
export async function transcribeAudio(
  audio: Blob,
  filename: string,
  apiKey: string,
  options?: STTOptions
): Promise<STTResult> {
  const formData = new FormData();
  formData.append('audio', audio, filename);
  formData.append('model_id', options?.modelId || 'scribe_v1');
  if (options?.language) {
    formData.append('language_code', options.language);
  }

  const response = await fetch(ELEVENLABS_STT_URL, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs STT error: ${error}`);
  }

  const data = await response.json();
  return {
    text: data.text || '',
    language: data.language_code,
    confidence: data.language_probability,
  };
}
