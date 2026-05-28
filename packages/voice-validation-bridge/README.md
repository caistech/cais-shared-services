# @caistech/voice-validation-bridge

Extract and manage product validation schema field suggestions from voice conversations.

## Purpose

The voice validation bridge enables voice-driven refinement of product validation schemas. When a product team discusses their product with a voice agent, this package:

1. **Captures the transcript** from the voice session
2. **Extracts field suggestions** using Claude to analyze the conversation
3. **Scores confidence** for each suggestion (0.0–1.0)
4. **Stores sessions** in Supabase with full audit trail
5. **Provides APIs** for reviewing and applying suggested changes

## Installation

```bash
npm install @caistech/voice-validation-bridge
```

## Usage

### Extract suggestions from a transcript

```typescript
import {
  extractSuggestionsFromTranscript,
  TranscriptStorage,
  VoiceTranscript,
  ConversationTurn,
} from '@caistech/voice-validation-bridge';

// 1. Create a transcript from voice session
const conversation: ConversationTurn[] = [
  {
    role: 'agent',
    text: 'What problem does your product solve?',
    timestamp: new Date(),
  },
  {
    role: 'user',
    text: 'Our product helps teams collaborate on design projects in real-time.',
    timestamp: new Date(),
  },
  // ... more turns
];

const transcript: VoiceTranscript = {
  id: 'sess-123',
  product_id: 'prod-456',
  session_id: 'elevenlabs-789',
  conversation,
  started_at: new Date(),
};

// 2. Extract suggestions
const currentSchema = { /* validation schema */ };
const suggestions = await extractSuggestionsFromTranscript(
  transcript,
  'prod-456',
  currentSchema
);

console.log(suggestions);
// {
//   product_id: 'prod-456',
//   suggested_edits: [
//     {
//       field_name: 'end_user.friction_before',
//       current_value: 'Design teams spend hours on manual version control',
//       proposed_value: 'Teams waste time on manual version control and async feedback loops',
//       confidence: 'high',
//       confidence_score: 0.92,
//       reasoning: 'User explicitly stated this pain point',
//       source_context: 'Our product helps teams collaborate on design projects...',
//       type: 'refinement'
//     }
//   ],
//   extraction_confidence: 0.87,
//   // ...
// }
```

### Store and retrieve sessions

```typescript
import { TranscriptStorage } from '@caistech/voice-validation-bridge';

const storage = new TranscriptStorage();

// Store a session
const stored = await storage.storeVoiceSession(
  'prod-456',
  'elevenlabs-789',
  conversation,
  180 // duration in seconds
);

// Store extracted suggestions
await storage.storeSuggestedChanges('elevenlabs-789', suggestions);

// Retrieve all suggestions for a product
const allSuggestions = await storage.getSuggestionsForProduct('prod-456');

// Get high-confidence suggestions (ready to apply)
const highConfidence = await storage.getHighConfidenceSuggestions(
  'prod-456',
  0.8 // min confidence threshold
);

// Record which suggestions were accepted
await storage.recordAppliedChanges(
  'elevenlabs-789',
  ['end_user.friction_before', 'distributor.pain_point_solved'],
  'user-123'
);
```

## API Response Format

### ExtractionResult

```typescript
{
  product_id: string;
  session_id: string;
  suggested_edits: SuggestedEdit[];
  extraction_confidence: number; // 0.0–1.0
  extraction_timestamp: Date;
  full_transcript_summary: string;
  requires_human_review: boolean;
  review_reason?: string;
}
```

### SuggestedEdit

```typescript
{
  field_name: string; // e.g., "distributor.archetype"
  current_value: unknown;
  proposed_value: unknown;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_score: number; // 0.0–1.0
  source_context: string; // Quote from transcript
  follow_up_question?: string;
  type: 'update' | 'refinement' | 'clarification';
}
```

## Supported Fields

The bridge can suggest updates to any field in the validation schema:

- **product**: slug, name, one_line_pitch, promise_statement
- **distributor**: archetype, hypothesis, pain_point_solved, go_to_market
- **end_user**: persona, job_to_be_done, friction_before, success_moment
- **friction_point**: statement, today_workaround, why_it_matters
- **commitment_surface**: deployment_model, output_format, pilot_path
- **success_criteria**: (array items)
- **promise_attributes**: (array items)

## Confidence Scoring

The LLM assigns confidence scores (0.0–1.0) based on how explicitly the suggestion appears in the conversation:

- **0.9–1.0**: Direct statement ("Our users are X")
- **0.7–0.9**: Strong implication ("People struggle with X, so...")
- **0.5–0.7**: Possible suggestion ("That could mean...")
- **<0.5**: Speculative (filtered out by default)

## Database Schema

Requires a `validation_voice_sessions` table:

```sql
CREATE TABLE validation_voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  session_id TEXT NOT NULL UNIQUE,
  transcript JSONB,
  suggested_changes JSONB,
  confidence_scores JSONB,
  applied_changes JSONB,
  created_at TIMESTAMP DEFAULT now(),
  accepted_at TIMESTAMP
);

CREATE INDEX idx_validation_voice_sessions_product_id 
  ON validation_voice_sessions(product_id);
CREATE INDEX idx_validation_voice_sessions_created_at 
  ON validation_voice_sessions(created_at DESC);
```

## Error Handling

The bridge throws informative errors:

```typescript
try {
  const suggestions = await extractSuggestionsFromTranscript(...);
} catch (error) {
  // "Error extracting suggestions from transcript: ..."
  // or "Invalid JSON response from Claude: ..."
  // or "Supabase URL and service role key are required..."
}
```

## Environment Variables

- `ANTHROPIC_API_KEY` — Claude API key (required for extraction)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (for storage)

## Integration with ElevenLabs Voice Agent

Use with the voice agent to enable real-time suggestions:

1. Voice agent conducts conversation about the product
2. On conversation end, the agent uploads transcript to voice-validation-bridge
3. Bridge extracts suggestions and stores them
4. UI fetches suggestions via `/api/validation/voice-suggestions/:product_id`
5. User reviews suggestions in a diff view
6. User accepts/rejects suggestions, which are recorded in Supabase

## License

© Corporate AI Solutions. All rights reserved.
