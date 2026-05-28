/**
 * Extract validation schema field suggestions from voice transcripts
 * Uses LLM to identify and propose changes with confidence scores
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  VoiceTranscript,
  ExtractionResult,
  SuggestedEdit,
  ValidationSchema,
  FIELD_DESCRIPTIONS,
  confidenceToLabel,
} from './types.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Extract field suggestions from a voice transcript
 * @param transcript - The voice conversation
 * @param productId - The product being validated
 * @param currentSchema - The current validation schema for this product
 * @returns Structured suggestions with confidence scores
 */
export async function extractSuggestionsFromTranscript(
  transcript: VoiceTranscript,
  productId: string,
  currentSchema: ValidationSchema
): Promise<ExtractionResult> {
  // Format transcript into readable text
  const transcriptText = formatTranscript(transcript);

  // Create field reference for the LLM
  const fieldReference = buildFieldReference(currentSchema);

  // Build extraction prompt
  const prompt = `You are a product validation expert analyzing a voice conversation about refining a product's validation schema.

CURRENT PRODUCT: ${currentSchema.product.name}
CURRENT PROMISE: ${currentSchema.product.promise_statement}

VOICE CONVERSATION TO ANALYZE:
${transcriptText}

VALIDATION SCHEMA FIELDS (for context):
${fieldReference}

Your task:
1. Listen to the conversation to identify any proposed changes to the validation schema
2. Extract specific, actionable suggestions for field updates
3. For each suggestion, provide:
   - The field name (using dot notation: e.g., "distributor.archetype", "end_user.friction_before")
   - The current value from the schema
   - The proposed new value based on the conversation
   - Reasoning: Why the conversation suggests this change
   - Confidence score (0.0-1.0): How certain are you this is a real suggestion?
   - Type: 'update' (replace value), 'refinement' (improve existing), or 'clarification' (add detail)
   - Source context: The exact quote from the conversation supporting this
   - Follow-up question (optional): What would help solidify this suggestion?

CRITICAL RULES:
- Only suggest changes that are EXPLICITLY discussed in the conversation
- Do NOT infer changes that aren't directly mentioned
- Confidence scores: 0.9-1.0 = direct statement, 0.7-0.9 = strong implication, 0.5-0.7 = possible, <0.5 = too uncertain (exclude)
- If the conversation is unclear or contradictory, flag it with requires_human_review: true
- Each suggestion must be grounded in specific conversation turns

Output ONLY valid JSON matching this exact structure:
{
  "suggested_edits": [
    {
      "field_name": "string (dot notation)",
      "current_value": "string or null",
      "proposed_value": "string",
      "reasoning": "string (2-3 sentences)",
      "confidence": "high|medium|low",
      "confidence_score": 0.0-1.0,
      "source_context": "exact quote from transcript",
      "follow_up_question": "string or null",
      "type": "update|refinement|clarification"
    }
  ],
  "extraction_confidence": 0.0-1.0,
  "full_transcript_summary": "2-3 sentence summary of what was discussed",
  "requires_human_review": boolean,
  "review_reason": "string or null"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse the JSON response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    let parsed: any;
    try {
      // Extract JSON from the response (in case there's wrapping text)
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse Claude response:', content.text);
      throw new Error(`Invalid JSON response from Claude: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Validate and enrich the extracted suggestions
    const suggestedEdits: SuggestedEdit[] = (parsed.suggested_edits || [])
      .filter((edit: any) => edit.confidence_score >= 0.5) // Filter out low-confidence suggestions
      .map((edit: any) => ({
        field_name: edit.field_name as keyof ValidationSchema,
        current_value: edit.current_value,
        proposed_value: edit.proposed_value,
        reasoning: edit.reasoning,
        confidence: confidenceToLabel(edit.confidence_score),
        confidence_score: Math.round(edit.confidence_score * 100) / 100,
        source_context: edit.source_context,
        follow_up_question: edit.follow_up_question || undefined,
        type: edit.type as 'update' | 'refinement' | 'clarification',
      }));

    return {
      product_id: productId,
      session_id: transcript.session_id,
      suggested_edits: suggestedEdits,
      extraction_confidence: Math.round(parsed.extraction_confidence * 100) / 100,
      extraction_timestamp: new Date(),
      full_transcript_summary: parsed.full_transcript_summary,
      requires_human_review: parsed.requires_human_review,
      review_reason: parsed.review_reason || undefined,
    };
  } catch (error) {
    console.error('Error extracting suggestions from transcript:', error);
    throw error;
  }
}

/**
 * Format a transcript into readable text for the LLM
 */
function formatTranscript(transcript: VoiceTranscript): string {
  return transcript.conversation
    .map(
      (turn, i) =>
        `[${turn.role.toUpperCase()} @ ${turn.timestamp.toISOString()}]\n${turn.text}`
    )
    .join('\n\n');
}

/**
 * Build a reference of field descriptions for the LLM
 */
function buildFieldReference(schema: ValidationSchema): string {
  const lines: string[] = [];

  lines.push('PRODUCT:');
  lines.push(`  - slug: "${schema.product.slug}"`);
  lines.push(`  - name: "${schema.product.name}"`);
  lines.push(`  - one_line_pitch: "${schema.product.one_line_pitch}"`);
  lines.push(`  - promise_statement: "${schema.product.promise_statement}"`);

  lines.push('\nDISTRIBUTOR:');
  lines.push(`  - archetype: "${schema.distributor.archetype}"`);
  lines.push(`  - hypothesis: "${schema.distributor.hypothesis}"`);
  lines.push(`  - pain_point_solved: "${schema.distributor.pain_point_solved}"`);
  lines.push(`  - go_to_market: "${schema.distributor.go_to_market}"`);

  lines.push('\nEND_USER:');
  lines.push(`  - persona: "${schema.end_user.persona}"`);
  lines.push(`  - job_to_be_done: "${schema.end_user.job_to_be_done}"`);
  lines.push(`  - friction_before: "${schema.end_user.friction_before}"`);
  lines.push(`  - success_moment: "${schema.end_user.success_moment}"`);

  lines.push('\nFRICTION_POINT:');
  lines.push(`  - statement: "${schema.friction_point.statement}"`);
  lines.push(`  - today_workaround: "${schema.friction_point.today_workaround}"`);
  lines.push(`  - why_it_matters: "${schema.friction_point.why_it_matters}"`);

  lines.push('\nCOMMITMENT_SURFACE:');
  lines.push(`  - deployment_model: "${schema.commitment_surface.deployment_model}"`);
  lines.push(
    `  - output_format: "${schema.commitment_surface.output_format.primary_output}"`
  );

  return lines.join('\n');
}

/**
 * Calculate overall extraction confidence based on individual suggestion confidences
 */
export function calculateExtractionConfidence(confidences: number[]): number {
  if (confidences.length === 0) return 0;
  const average = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  return Math.round(average * 100) / 100;
}
