/**
 * @caistech/voice-validation-bridge
 *
 * Extract and manage product validation schema field suggestions from voice conversations.
 * Stores transcripts, uses LLM to identify proposed changes with confidence scores,
 * and provides APIs for reviewing and applying suggestions.
 */

export {
  extractSuggestionsFromTranscript,
  calculateExtractionConfidence,
} from './extract-suggestions.js';

export {
  TranscriptStorage,
  getTranscriptStorage,
} from './transcript-storage.js';

export type {
  VoiceTranscript,
  ConversationTurn,
  FieldSuggestion,
  SuggestedEdit,
  ExtractionResult,
  VoiceSessionRecord,
  AppliedChange,
  ValidationSchema,
} from './types.js';

export {
  EDITABLE_FIELDS,
  FIELD_DESCRIPTIONS,
  CONFIDENCE_THRESHOLDS,
  confidenceToLabel,
} from './types.js';
