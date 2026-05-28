/**
 * Store and retrieve voice transcripts and extracted suggestions from Supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  VoiceTranscript,
  VoiceSessionRecord,
  ExtractionResult,
  ConversationTurn,
} from './types.js';

export class TranscriptStorage {
  private supabase: SupabaseClient;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase URL and service role key are required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.'
      );
    }

    this.supabase = createClient(url, key);
  }

  /**
   * Store a new voice session with transcript
   */
  async storeVoiceSession(
    productId: string,
    sessionId: string,
    conversation: ConversationTurn[],
    durationSeconds?: number
  ): Promise<VoiceTranscript> {
    const transcript: VoiceTranscript = {
      id: crypto.randomUUID(),
      product_id: productId,
      session_id: sessionId,
      conversation,
      started_at: new Date(Math.min(...conversation.map(t => t.timestamp.getTime()))),
      ended_at: new Date(Math.max(...conversation.map(t => t.timestamp.getTime()))),
      duration_seconds: durationSeconds,
    };

    const { error } = await this.supabase
      .from('validation_voice_sessions')
      .insert({
        id: transcript.id,
        product_id: productId,
        session_id: sessionId,
        transcript: transcript,
      });

    if (error) {
      throw new Error(`Failed to store transcript: ${error.message}`);
    }

    return transcript;
  }

  /**
   * Update a session with extracted suggestions
   */
  async storeSuggestedChanges(
    sessionId: string,
    extractionResult: ExtractionResult
  ): Promise<void> {
    // Build confidence scores map
    const confidenceScores = extractionResult.suggested_edits.reduce(
      (acc, edit) => {
        acc[edit.field_name as string] = edit.confidence_score;
        return acc;
      },
      {} as Record<string, number>
    );

    const { error } = await this.supabase
      .from('validation_voice_sessions')
      .update({
        suggested_changes: extractionResult,
        confidence_scores: confidenceScores,
      })
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to store suggestions: ${error.message}`);
    }
  }

  /**
   * Get all suggestions for a product
   */
  async getSuggestionsForProduct(productId: string): Promise<VoiceSessionRecord[]> {
    const { data, error } = await this.supabase
      .from('validation_voice_sessions')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch suggestions: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a specific session by ID
   */
  async getSessionById(sessionId: string): Promise<VoiceSessionRecord | null> {
    const { data, error } = await this.supabase
      .from('validation_voice_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw new Error(`Failed to fetch session: ${error.message}`);
    }

    return data || null;
  }

  /**
   * Record which suggestions were accepted and applied
   */
  async recordAppliedChanges(
    sessionId: string,
    appliedFieldNames: string[],
    userId: string
  ): Promise<void> {
    const { data: session, error: fetchError } = await this.supabase
      .from('validation_voice_sessions')
      .select('suggested_changes, applied_changes')
      .eq('session_id', sessionId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch session for update: ${fetchError.message}`);
    }

    if (!session?.suggested_changes) {
      throw new Error('No suggestions found for this session');
    }

    // Filter to applied suggestions and build change records
    const suggestedChanges = session.suggested_changes as ExtractionResult;
    const appliedChanges = suggestedChanges.suggested_edits
      .filter(edit => appliedFieldNames.includes(edit.field_name as string))
      .map(edit => ({
        field_name: edit.field_name,
        old_value: edit.current_value,
        new_value: edit.proposed_value,
        applied_at: new Date().toISOString(),
        applied_by: userId,
      }));

    const { error: updateError } = await this.supabase
      .from('validation_voice_sessions')
      .update({
        applied_changes: appliedChanges,
        accepted_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (updateError) {
      throw new Error(`Failed to record applied changes: ${updateError.message}`);
    }
  }

  /**
   * Get high-confidence suggestions for a product (ready to apply)
   */
  async getHighConfidenceSuggestions(
    productId: string,
    minConfidence: number = 0.8
  ): Promise<ExtractionResult[]> {
    const { data, error } = await this.supabase
      .from('validation_voice_sessions')
      .select('suggested_changes')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch suggestions: ${error.message}`);
    }

    if (!data) return [];

    return data
      .map(row => row.suggested_changes as ExtractionResult)
      .filter(
        result =>
          result.suggested_edits.some(edit => edit.confidence_score >= minConfidence)
      );
  }

  /**
   * Clean up old sessions (optional, for maintenance)
   */
  async deleteOldSessions(productId: string, daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { count, error } = await this.supabase
      .from('validation_voice_sessions')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .eq('product_id', productId);

    if (error) {
      throw new Error(`Failed to delete old sessions: ${error.message}`);
    }

    return count || 0;
  }
}

/**
 * Singleton instance for use in API routes
 */
let storageInstance: TranscriptStorage | null = null;

export function getTranscriptStorage(): TranscriptStorage {
  if (!storageInstance) {
    storageInstance = new TranscriptStorage();
  }
  return storageInstance;
}
