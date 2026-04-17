/**
 * Noise Filter for Speech-to-Text Output
 * 
 * Filters out ambient noise descriptions from transcriptions.
 * ElevenLabs Scribe sometimes transcribes environmental sounds like:
 * - "[traffic noise]"
 * - "[wind sounds]"
 * - "(background music)"
 * - "*coughing*"
 * 
 * This module provides both rule-based and LLM-based filtering.
 */

// Common noise patterns that STT models produce
const NOISE_PATTERNS = [
  // Square bracket patterns
  /\[.*?(noise|sound|music|traffic|wind|rain|background|ambient|silence|static|breathing|cough|sneeze|laugh|sigh|pause|inaudible|unclear|unintelligible).*?\]/gi,
  
  // Parentheses patterns
  /\(.*?(noise|sound|music|traffic|wind|rain|background|ambient|silence|static|breathing|cough|sneeze|laugh|sigh|pause|inaudible|unclear|unintelligible).*?\)/gi,
  
  // Asterisk patterns (actions)
  /\*.*?(noise|sound|cough|sneeze|laugh|sigh|clears throat|breathing).*?\*/gi,
  
  // Common filler transcriptions
  /^\s*(um+|uh+|ah+|er+|hmm+|mhm+|oh+)\s*$/gi,
  
  // Just punctuation or whitespace
  /^[\s.,!?;:'"]+$/,
  
  // Very short meaningless content
  /^.{1,2}$/,
];

// Patterns that indicate the entire transcription is just noise
const NOISE_ONLY_PATTERNS = [
  /^\s*\[.*?\]\s*$/,  // Only bracketed content
  /^\s*\(.*?\)\s*$/,  // Only parenthetical content  
  /^\s*\*.*?\*\s*$/,  // Only asterisk content
];

export interface NoiseFilterResult {
  originalText: string;
  filteredText: string;
  isNoise: boolean;
  noiseDescriptions: string[];
  confidence: number;
}

/**
 * Rule-based noise filtering (fast, no API calls)
 * Use this for real-time filtering
 */
export function filterNoiseBasic(text: string): NoiseFilterResult {
  const originalText = text;
  let filteredText = text;
  const noiseDescriptions: string[] = [];

  // Check if entire text is just noise description
  for (const pattern of NOISE_ONLY_PATTERNS) {
    if (pattern.test(text.trim())) {
      const match = text.match(/[\[\(\*](.+?)[\]\)\*]/);
      if (match) {
        noiseDescriptions.push(match[1]);
      }
      return {
        originalText,
        filteredText: '',
        isNoise: true,
        noiseDescriptions,
        confidence: 0.9,
      };
    }
  }

  // Remove noise patterns from text
  for (const pattern of NOISE_PATTERNS) {
    const matches = filteredText.match(pattern);
    if (matches) {
      noiseDescriptions.push(...matches);
      filteredText = filteredText.replace(pattern, '');
    }
  }

  // Clean up extra whitespace
  filteredText = filteredText.replace(/\s+/g, ' ').trim();

  // Check if remaining text is meaningful
  const isNoise = filteredText.length < 3 || /^[\s.,!?;:'"]+$/.test(filteredText);

  return {
    originalText,
    filteredText: isNoise ? '' : filteredText,
    isNoise,
    noiseDescriptions,
    confidence: noiseDescriptions.length > 0 ? 0.8 : 1.0,
  };
}

/**
 * LLM-based noise filtering (more accurate, requires API call)
 * Use this when you need higher accuracy
 */
export async function filterNoiseLLM(
  text: string,
  options?: {
    anthropicApiKey?: string;
    openaiApiKey?: string;
  }
): Promise<NoiseFilterResult> {
  // First apply basic filtering
  const basicResult = filterNoiseBasic(text);
  
  // If basic filter is confident it's noise, skip LLM
  if (basicResult.isNoise && basicResult.confidence > 0.85) {
    return basicResult;
  }

  // If no API keys provided, return basic result
  const anthropicKey = options?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  const openaiKey = options?.openaiApiKey || process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return basicResult;
  }

  try {
    // Use Claude if available (preferred)
    if (anthropicKey) {
      return await filterWithClaude(text, anthropicKey);
    }

    // Fall back to OpenAI
    if (openaiKey) {
      return await filterWithOpenAI(text, openaiKey);
    }

    return basicResult;
  } catch (error) {
    console.error('LLM noise filter error:', error);
    return basicResult;
  }
}

async function filterWithClaude(text: string, apiKey: string): Promise<NoiseFilterResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Analyze this speech-to-text transcription and determine if it contains actual speech content that should be translated, or if it's just noise/sound descriptions.

Transcription: "${text}"

Respond with JSON only:
{
  "isActualSpeech": boolean,
  "cleanedText": "the actual speech content with noise removed, or empty string if no speech",
  "noiseDescriptions": ["list of detected noise/sound descriptions"],
  "confidence": number between 0 and 1
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || '';
  
  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const result = JSON.parse(jsonMatch[0]);
    
    return {
      originalText: text,
      filteredText: result.cleanedText || '',
      isNoise: !result.isActualSpeech,
      noiseDescriptions: result.noiseDescriptions || [],
      confidence: result.confidence || 0.8,
    };
  } catch (parseError) {
    console.error('Failed to parse Claude response:', content);
    return filterNoiseBasic(text);
  }
}

async function filterWithOpenAI(text: string, apiKey: string): Promise<NoiseFilterResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You analyze speech-to-text transcriptions and filter out noise descriptions. Respond with JSON only.',
        },
        {
          role: 'user',
          content: `Analyze this transcription and determine if it contains actual speech or just noise.

Transcription: "${text}"

Respond with:
{
  "isActualSpeech": boolean,
  "cleanedText": "speech content only, empty if none",
  "noiseDescriptions": ["detected noise descriptions"],
  "confidence": 0.0-1.0
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';
  
  try {
    const result = JSON.parse(content);
    
    return {
      originalText: text,
      filteredText: result.cleanedText || '',
      isNoise: !result.isActualSpeech,
      noiseDescriptions: result.noiseDescriptions || [],
      confidence: result.confidence || 0.8,
    };
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', content);
    return filterNoiseBasic(text);
  }
}

/**
 * Check if text is likely actual speech (quick heuristic)
 * Returns true if text appears to be real speech content
 */
export function isLikelySpeech(text: string): boolean {
  if (!text || text.trim().length < 3) return false;
  
  // Check for noise-only patterns
  for (const pattern of NOISE_ONLY_PATTERNS) {
    if (pattern.test(text.trim())) return false;
  }
  
  // Check if text has actual word content (at least 2 real words)
  const words = text.split(/\s+/).filter(w => 
    w.length > 2 && 
    !/^(um+|uh+|ah+|er+|hmm+)$/i.test(w) &&
    !/[\[\]\(\)\*]/.test(w)
  );
  
  return words.length >= 2;
}
