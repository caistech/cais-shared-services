# Voice Validation Bridge – Quick Reference

**Status:** Phase 1 Complete (5/7 components)  
**Date:** 2026-05-26  
**Next Session:** Phase 2 (Admin Page + Voice Agent Tools)

---

## One-Minute Overview

The **Voice Validation Bridge** extracts product validation schema field suggestions from voice conversations. When you talk to an AI agent about your product, the system:

1. Records the transcript
2. Uses Claude to extract proposed field changes
3. Scores each suggestion's confidence (0–100%)
4. Stores everything in Supabase
5. Shows you a diff view for approval
6. Saves accepted changes

**Why it matters:** Product validation schemas (rules/validation-schema.json) describe your product's promise, market, friction, and success criteria. Voice-driven refinement means you're not manually editing JSON—you're just talking to an agent, and the schema improves automatically.

---

## The Package: `@caistech/voice-validation-bridge`

### Location
```
cais-shared-services/packages/voice-validation-bridge/
```

### What it does
- Extracts suggestions from transcripts using Claude
- Stores transcripts + suggestions in Supabase
- Provides APIs to fetch and apply suggestions

### Main classes & functions

```typescript
// Storage (CRUD)
const storage = new TranscriptStorage();
await storage.storeVoiceSession(productId, sessionId, conversation);
await storage.storeSuggestedChanges(sessionId, extractionResult);
const suggestions = await storage.getSuggestionsForProduct(productId);
await storage.recordAppliedChanges(sessionId, appliedFieldNames, userId);

// Extraction (LLM)
const result = await extractSuggestionsFromTranscript(
  transcript,
  productId,
  currentSchema
);
// result.suggested_edits = [{ field_name, proposed_value, confidence, ... }]

// Singleton (convenience)
const storage = getTranscriptStorage();
```

### Types you need to know

```typescript
// What goes in
VoiceTranscript = {
  id, product_id, session_id,
  conversation: [
    { role: 'user' | 'agent', text, timestamp },
    ...
  ],
  started_at, ended_at, duration_seconds
}

// What comes out
SuggestedEdit = {
  field_name: "distributor.archetype",
  current_value: "...",
  proposed_value: "...",
  confidence: "high" | "medium" | "low",
  confidence_score: 0.87,
  reasoning: "User explicitly stated...",
  source_context: "exact quote from transcript",
  follow_up_question?: "...",
  type: "update" | "refinement" | "clarification"
}

ExtractionResult = {
  product_id, session_id,
  suggested_edits: SuggestedEdit[],
  extraction_confidence: 0.91,
  full_transcript_summary: "...",
  requires_human_review: false,
  review_reason?: "..."
}
```

---

## The API Endpoint

### Location
```
Corporate-AI-Solutions/src/app/api/validation/voice-suggestions/[productId]/route.ts
```

### GET /api/validation/voice-suggestions/:product_id

**Query params:**
- `min_confidence=0.8` (0.0–1.0, default 0.5)
- `limit=10` (default 10)
- `only_high=true` (filter to high-confidence only)

**Response:**
```json
{
  "product_id": "prod-123",
  "sessions": [
    {
      "session_id": "sess-456",
      "suggested_changes": {
        "suggested_edits": [...],
        "extraction_confidence": 0.87,
        ...
      },
      "created_at": "2026-05-26T10:30:00Z",
      "accepted_at": null
    }
  ],
  "total_sessions": 3,
  "high_confidence_count": 7
}
```

### POST /api/validation/voice-suggestions/:product_id

**Body:**
```json
{
  "session_id": "sess-456",
  "applied_fields": ["distributor.archetype", "end_user.friction_before"],
  "user_id": "user-123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Applied changes recorded"
}
```

---

## The React Component

### Location
```
cais-shared-services/packages/corporate-components/src/validation/ValidationSuggestionDiff.tsx
```

### Main Component: `ValidationSuggestionDiff`

**Props:**
```typescript
{
  suggestion: SuggestedEdit,
  onAccept?: (fieldName: string) => void,
  onReject?: (fieldName: string) => void,
  onDiscussFurther?: (fieldName: string) => void,
  isLoading?: boolean,
  hideActions?: boolean
}
```

**Usage:**
```tsx
import { ValidationSuggestionDiff } from '@caistech/corporate-components/validation';

<ValidationSuggestionDiff
  suggestion={suggestion}
  onAccept={(fieldName) => {
    // Update form field with proposed_value
  }}
  onReject={(fieldName) => {
    // Remove from list
  }}
/>
```

**Features:**
- Side-by-side diff (current vs. proposed)
- Confidence badge (High 80%+, Medium 50–79%, Low <50%)
- Type badge (Update, Refinement, Clarification)
- Reasoning panel
- Source context (quote from transcript)
- Expandable details
- Three action buttons (Apply, Dismiss, Discuss)

### Secondary Component: `ValidationSuggestionList`

**Props:**
```typescript
{
  suggestions: SuggestedEdit[],
  onAcceptField?: (fieldName: string) => void,
  onRejectField?: (fieldName: string) => void,
  onDiscussField?: (fieldName: string) => void,
  acceptedFields?: Set<string>,
  rejectedFields?: Set<string>
}
```

**Features:**
- Groups by confidence (high section, medium section)
- Counts per section
- Disables already-processed suggestions
- Empty state

---

## The Database Schema

### Location
```
cais-shared-services/supabase/migrations/20260526_validation_voice_sessions.sql
```

### Main table: `validation_voice_sessions`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `product_id` | UUID | Which product |
| `session_id` | TEXT | ElevenLabs session ID |
| `transcript` | JSONB | Full conversation |
| `suggested_changes` | JSONB | ExtractionResult |
| `confidence_scores` | JSONB | Per-field scores |
| `applied_changes` | JSONB | Accepted suggestions |
| `created_at` | TIMESTAMP | When recorded |
| `accepted_at` | TIMESTAMP | When user approved |
| `created_by` | UUID | Who started |

### Audit table: `validation_applied_suggestions`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `session_id` | TEXT | Which session |
| `field_name` | TEXT | Which field |
| `old_value` | JSONB | Before |
| `new_value` | JSONB | After |
| `applied_at` | TIMESTAMP | When |
| `applied_by` | UUID | Who |

### Setup
```bash
cd cais-shared-services
supabase db push
```

---

## Environment Variables

### For extraction (Claude API)
```
ANTHROPIC_API_KEY=sk-ant-...
```

### For storage (Supabase)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### For voice widget (ElevenLabs)
```
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=<agent-id>
ELEVENLABS_API_KEY=xi_...
```

---

## Testing the API

### Fetch suggestions
```bash
curl -X GET \
  "http://localhost:3000/api/validation/voice-suggestions/prod-123?min_confidence=0.8&limit=5"
```

### Record applied changes
```bash
curl -X POST \
  "http://localhost:3000/api/validation/voice-suggestions/prod-123" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess-456",
    "applied_fields": ["end_user.friction_before"],
    "user_id": "user-123"
  }'
```

---

## Confidence Scoring

| Score | Label | Meaning | Example |
|-------|-------|---------|---------|
| 90–100% | High | Direct statement in conversation | "Our main pain point is slow feedback" |
| 70–89% | Medium | Strong implication | "People struggle with this, so..." |
| 50–69% | Low | Possible suggestion | "That could mean..." |
| <50% | Excluded | Too speculative | (filtered out automatically) |

---

## The Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER TALKS TO VOICE AGENT                                    │
│    "Our product helps teams collaborate on design. We sell to   │
│     design agencies. The pain is that feedback takes 3 days."   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. TRANSCRIPT CAPTURED & STORED                                 │
│    ConversationTurn[] → TranscriptStorage.storeVoiceSession()   │
│    Result: transcript saved in Supabase                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. LLM EXTRACTION (Claude)                                      │
│    transcript → Claude prompt → structured JSON                 │
│    Extracts:                                                    │
│    - distributor.archetype: "design agencies" (0.95)           │
│    - distributor.pain_point_solved: "slow feedback" (0.91)     │
│    - friction_point.why_it_matters: "3-day cycle" (0.88)       │
│    Result: SuggestedEdit[] with confidence scores              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. SUGGESTIONS STORED                                           │
│    ExtractionResult → TranscriptStorage.storeSuggestedChanges() │
│    Result: suggestions saved, indexed by product_id             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. API RETURNS SUGGESTIONS                                      │
│    GET /api/validation/voice-suggestions/prod-123              │
│    → Returns grouped suggestions (high, medium confidence)      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. UI DISPLAYS DIFFS                                            │
│    ValidationSuggestionDiff component                           │
│    Current: "..." | Proposed: "..." (with confidence badge)    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. USER APPROVES/REJECTS                                        │
│    [Apply] → Form field populated with new value                │
│    [Dismiss] → Suggestion removed from list                     │
│    [Discuss] → Re-open voice agent for clarification            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. CHANGES RECORDED                                             │
│    POST /api/validation/voice-suggestions/:product_id           │
│    → Applied changes saved in audit table                       │
│    → Linked to user_id for compliance                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. FORM SUBMITTED → SUPABASE                                    │
│    All updated fields → products table                          │
│    Full validation schema saved                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## What's Next (Phase 2)

### Admin Page (`/admin/methodology`)
- Load `rules/validation-schema.json`
- Render dynamic form based on schema
- "Discuss with Voice Agent" button per field
- ElevenLabs voice widget integration
- Fetch suggestions from API
- Display ValidationSuggestionDiff list
- Form submission → Supabase save

### Voice Agent Tool
- New tool: `updateValidationField`
- Agent can suggest field changes during conversation
- Tool calls captured in transcript
- Extracted by LLM alongside free-form suggestions

---

## Common Pitfalls

1. **Missing env vars** → Extraction fails silently
   - Check: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

2. **Confidence too low** → No suggestions shown
   - Check query param: `?min_confidence=0.5` (not 0.9)

3. **Transcript format wrong** → Claude fails to parse
   - Check: `ConversationTurn` has `role`, `text`, `timestamp`

4. **Field name typos** → Suggestion never applies
   - Check: `field_name` matches validation schema exactly (e.g., `distributor.archetype`)

5. **RLS policies blocking reads** → API returns 403
   - Check: User authenticated + owns the product_id

---

## Debugging Tips

### Check transcript storage
```sql
SELECT session_id, product_id, created_at 
FROM validation_voice_sessions 
ORDER BY created_at DESC 
LIMIT 5;
```

### Check suggestions
```sql
SELECT 
  session_id,
  jsonb_array_length(suggested_changes->'suggested_edits') as suggestion_count,
  suggested_changes->>'extraction_confidence' as confidence
FROM validation_voice_sessions
WHERE product_id = 'prod-123';
```

### Check applied changes
```sql
SELECT field_name, applied_by, applied_at
FROM validation_applied_suggestions
WHERE session_id = 'sess-456'
ORDER BY applied_at DESC;
```

### Test LLM extraction locally
```typescript
import { extractSuggestionsFromTranscript } from '@caistech/voice-validation-bridge';

const transcript = { /* mock transcript */ };
const schema = { /* mock schema */ };
const result = await extractSuggestionsFromTranscript(transcript, 'test-prod', schema);
console.log(result.suggested_edits);
```

---

## File Locations (Complete)

| File | Purpose |
|------|---------|
| `packages/voice-validation-bridge/src/types.ts` | Type definitions |
| `packages/voice-validation-bridge/src/extract-suggestions.ts` | Claude LLM integration |
| `packages/voice-validation-bridge/src/transcript-storage.ts` | Supabase CRUD |
| `packages/voice-validation-bridge/README.md` | Usage guide |
| `Corporate-AI-Solutions/src/app/api/validation/voice-suggestions/[productId]/route.ts` | API endpoint |
| `packages/corporate-components/src/validation/ValidationSuggestionDiff.tsx` | React component |
| `supabase/migrations/20260526_validation_voice_sessions.sql` | DB schema |
| `VOICE_VALIDATION_BRIDGE_IMPLEMENTATION.md` | Full documentation |
| `VOICE_VALIDATION_QUICK_REFERENCE.md` | This file |

---

## Ready to Go?

1. ✅ Core package built
2. ✅ API endpoint ready
3. ✅ Database schema created
4. ✅ React component ready
5. ⏳ Next: Build admin page + wire voice agent tool

**Time estimate for Phase 2:** 6–8 hours  
**Blocker:** None (all infrastructure in place)

---

**Questions?** See `VOICE_VALIDATION_BRIDGE_IMPLEMENTATION.md` for detailed docs.
