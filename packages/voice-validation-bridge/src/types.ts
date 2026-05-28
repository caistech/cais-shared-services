/**
 * Voice Validation Bridge types
 * Defines the shape of voice transcripts, suggestions, and confidence scores
 */

export interface VoiceTranscript {
  id: string;
  product_id: string;
  session_id: string;
  conversation: ConversationTurn[];
  started_at: Date;
  ended_at?: Date;
  duration_seconds?: number;
}

export interface ConversationTurn {
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

export interface FieldSuggestion {
  field_name: string;
  current_value: string | null;
  proposed_value: string;
  reasoning: string;
  confidence_score: number; // 0.0–1.0
  source_turns: number[]; // Indices of conversation turns that led to this suggestion
  requires_follow_up?: boolean;
}

export interface SuggestedEdit {
  field_name: keyof ValidationSchema;
  current_value: unknown;
  proposed_value: unknown;
  confidence: 'high' | 'medium' | 'low';
  confidence_score: number; // 0.0–1.0
  reasoning: string;
  source_context: string; // Extract from transcript
  follow_up_question?: string;
  type: 'update' | 'refinement' | 'clarification';
}

export interface ExtractionResult {
  product_id: string;
  session_id: string;
  suggested_edits: SuggestedEdit[];
  extraction_confidence: number; // Overall confidence in extraction
  extraction_timestamp: Date;
  full_transcript_summary: string;
  requires_human_review: boolean;
  review_reason?: string;
}

export interface VoiceSessionRecord {
  id: string;
  product_id: string;
  session_id: string;
  transcript: VoiceTranscript;
  suggested_changes: ExtractionResult;
  confidence_scores: { [field: string]: number };
  applied_changes?: AppliedChange[];
  created_at: Date;
  accepted_at?: Date;
}

export interface AppliedChange {
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  applied_at: Date;
  applied_by: string; // user_id
}

/**
 * Validation schema field definitions (mirrors rules/validation-schema.json)
 * Used to validate suggested field names and types
 */
export interface ValidationSchema {
  meta: {
    source: string;
    last_updated: string;
    validated_by: string;
    gate_readiness_status: string;
  };
  product: {
    slug: string;
    name: string;
    one_line_pitch: string;
    promise_statement: string;
  };
  distributor: {
    archetype: string;
    hypothesis: string;
    pain_point_solved: string;
    go_to_market: string;
  };
  end_user: {
    persona: string;
    job_to_be_done: string;
    friction_before: string;
    success_moment: string;
  };
  friction_point: {
    statement: string;
    today_workaround: string;
    why_it_matters: string;
  };
  success_criteria: Array<{
    criterion: string;
    evidence: string;
    phase: string;
  }>;
  promise_attributes: Array<{
    attribute: string;
    quality_bar: string;
    how_verified: string;
    gate_readiness_relevance: string;
    essential: boolean;
  }>;
  commitment_surface: {
    deployment_model: string;
    run_on_your_data?: {
      supported: boolean;
      what_you_supply: string;
      setup_time_minutes: number;
      documentation: string;
    };
    output_format: {
      primary_output: string;
      format_details: string;
      integrations: string[];
    };
    pilot_path: {
      minimum_viable_pilot: string;
      success_signal: string;
      time_to_value_days: number;
    };
  };
  gate_scores: {
    hard_gates: Array<{
      code: string;
      check: string;
      status: string;
      evidence: string;
    }>;
    weighted_gates: Array<{
      code: string;
      check: string;
      weight: string;
      weight_numeric: number;
      status: string;
      evidence: string;
    }>;
    composite_score: {
      hard_gates_passed: number;
      hard_gates_total: number;
      weighted_score_percent: number;
      gate1_ready: boolean;
      open_items: Array<{
        code: string;
        issue: string;
        fix: string;
        estimated_effort: string;
      }>;
    };
  };
}

export const EDITABLE_FIELDS: (keyof ValidationSchema)[] = [
  'product',
  'distributor',
  'end_user',
  'friction_point',
  'success_criteria',
  'promise_attributes',
  'commitment_surface',
];

export const FIELD_DESCRIPTIONS: Record<string, string> = {
  'distributor.archetype': 'Who sells this product? (e.g., "public speaking coaches")',
  'distributor.hypothesis': 'What value does the distributor get?',
  'distributor.pain_point_solved': 'Concrete pain the distributor has today',
  'distributor.go_to_market': 'How does the distributor offer this? (white-label, etc.)',
  'end_user.persona': 'Named end-user type (e.g., "speaking students")',
  'end_user.job_to_be_done': 'What job does the user hire this to do?',
  'end_user.friction_before': 'Current pain/friction the end-user faces',
  'end_user.success_moment': 'The "I want that" or "wow" instant',
  'friction_point.statement': 'One-sentence articulation of the core friction',
  'friction_point.today_workaround': 'How do users solve this TODAY?',
  'friction_point.why_it_matters': 'Why is fixing this valuable?',
  'product.one_line_pitch': 'Promise in one sentence, max 140 chars',
  'product.promise_statement': 'Full promise in 3-5 sentences',
  'commitment_surface.deployment_model': 'How does it ship? (SaaS, white-label, BYOK, etc.)',
};

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.0,
};

export function confidenceToLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}
