'use client';

/**
 * ValidationSuggestionDiff Component
 * 
 * Displays a side-by-side or inline diff of a suggested field update
 * with confidence badge and action buttons.
 * 
 * Used in the admin/methodology page for reviewing voice-extracted suggestions.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check, X, MessageCircle } from 'lucide-react';

export interface SuggestedEdit {
  field_name: string;
  current_value: unknown;
  proposed_value: unknown;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_score: number;
  source_context: string;
  follow_up_question?: string;
  type: 'update' | 'refinement' | 'clarification';
}

export interface ValidationSuggestionDiffProps {
  suggestion: SuggestedEdit;
  onAccept?: (fieldName: string) => void;
  onReject?: (fieldName: string) => void;
  onDiscussFurther?: (fieldName: string) => void;
  isLoading?: boolean;
  hideActions?: boolean;
}

const confidenceColors = {
  high: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-red-100 text-red-800 border-red-300',
};

const typeLabels = {
  update: 'Update',
  refinement: 'Refinement',
  clarification: 'Clarification',
};

const typeBadgeColors = {
  update: 'bg-blue-50 text-blue-700',
  refinement: 'bg-purple-50 text-purple-700',
  clarification: 'bg-cyan-50 text-cyan-700',
};

/**
 * Format values for display (truncate long strings)
 */
function formatValue(value: unknown, maxLength: number = 100): string {
  if (value === null || value === undefined) {
    return '(empty)';
  }

  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'object') {
    str = JSON.stringify(value, null, 2);
  } else {
    str = String(value);
  }

  if (str.length > maxLength) {
    return str.substring(0, maxLength) + '...';
  }

  return str;
}

/**
 * Render a diff-style display of old vs. new value
 */
function DiffViewer({
  oldValue,
  newValue,
  expanded,
}: {
  oldValue: unknown;
  newValue: unknown;
  expanded: boolean;
}) {
  const oldStr = formatValue(oldValue, expanded ? 500 : 80);
  const newStr = formatValue(newValue, expanded ? 500 : 80);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
      {/* Current Value */}
      <div>
        <div className="text-xs font-semibold text-gray-600 uppercase mb-1">
          Current
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap break-words">
          {oldStr || '(no value)'}
        </div>
      </div>

      {/* Proposed Value */}
      <div>
        <div className="text-xs font-semibold text-green-700 uppercase mb-1">
          Proposed
        </div>
        <div className="bg-green-50 border border-green-200 rounded p-3 text-sm font-mono text-green-700 whitespace-pre-wrap break-words">
          {newStr || '(empty)'}
        </div>
      </div>
    </div>
  );
}

export function ValidationSuggestionDiff({
  suggestion,
  onAccept,
  onReject,
  onDiscussFurther,
  isLoading = false,
  hideActions = false,
}: ValidationSuggestionDiffProps) {
  const [expanded, setExpanded] = useState(false);

  const handleAccept = () => {
    onAccept?.(suggestion.field_name);
  };

  const handleReject = () => {
    onReject?.(suggestion.field_name);
  };

  const handleDiscuss = () => {
    onDiscussFurther?.(suggestion.field_name);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white hover:shadow-md transition-shadow">
      {/* Header with field name and confidence badge */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-lg">{suggestion.field_name}</h3>
          <p className="text-sm text-gray-600 mt-1">{typeLabels[suggestion.type]}</p>
        </div>

        <div className="flex flex-wrap gap-2 items-start">
          {/* Confidence badge */}
          <div
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${confidenceColors[suggestion.confidence]}`}
          >
            <span>{suggestion.confidence.charAt(0).toUpperCase() + suggestion.confidence.slice(1)}</span>
            <span>{Math.round(suggestion.confidence_score * 100)}%</span>
          </div>

          {/* Type badge */}
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${typeBadgeColors[suggestion.type]}`}>
            {suggestion.type}
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-gray-700 mb-3 bg-blue-50 border-l-4 border-blue-300 p-2 rounded">
        <span className="font-semibold">Reasoning:</span> {suggestion.reasoning}
      </p>

      {/* Source context */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-600 uppercase mb-1">
          From conversation
        </p>
        <p className="text-sm text-gray-600 italic p-2 bg-gray-50 rounded border border-gray-200">
          "{suggestion.source_context}"
        </p>
      </div>

      {/* Diff viewer */}
      <DiffViewer
        oldValue={suggestion.current_value}
        newValue={suggestion.proposed_value}
        expanded={expanded}
      />

      {/* Expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:text-blue-700 mt-2 flex items-center gap-1"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Show less
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Show more
          </>
        )}
      </button>

      {/* Follow-up question (if present) */}
      {suggestion.follow_up_question && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-2">
          <p className="text-xs font-semibold text-amber-900 uppercase mb-1">
            Follow-up question
          </p>
          <p className="text-sm text-amber-800">{suggestion.follow_up_question}</p>
        </div>
      )}

      {/* Action buttons */}
      {!hideActions && (
        <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-3 border-t border-gray-200">
          <button
            onClick={handleAccept}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded font-semibold text-sm transition-colors"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>

          <button
            onClick={handleReject}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded font-semibold text-sm transition-colors"
          >
            <X className="w-4 h-4" />
            Dismiss
          </button>

          {onDiscussFurther && (
            <button
              onClick={handleDiscuss}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded font-semibold text-sm transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Discuss
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 rounded-lg flex items-center justify-center">
          <div className="animate-spin">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Multi-suggestion view component
 */
export interface ValidationSuggestionListProps {
  suggestions: SuggestedEdit[];
  onAcceptField?: (fieldName: string) => void;
  onRejectField?: (fieldName: string) => void;
  onDiscussField?: (fieldName: string) => void;
  isLoading?: boolean;
  acceptedFields?: Set<string>;
  rejectedFields?: Set<string>;
}

export function ValidationSuggestionList({
  suggestions,
  onAcceptField,
  onRejectField,
  onDiscussField,
  isLoading = false,
  acceptedFields = new Set(),
  rejectedFields = new Set(),
}: ValidationSuggestionListProps) {
  const highConfidenceSuggestions = suggestions.filter(
    s => s.confidence_score >= 0.8
  );
  const mediumConfidenceSuggestions = suggestions.filter(
    s => s.confidence_score >= 0.5 && s.confidence_score < 0.8
  );

  return (
    <div className="space-y-6">
      {highConfidenceSuggestions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            High Confidence Suggestions ({highConfidenceSuggestions.length})
          </h3>
          <div className="space-y-3">
            {highConfidenceSuggestions.map(suggestion => (
              <ValidationSuggestionDiff
                key={suggestion.field_name}
                suggestion={suggestion}
                onAccept={onAcceptField}
                onReject={onRejectField}
                onDiscussFurther={onDiscussField}
                isLoading={isLoading}
                hideActions={acceptedFields.has(suggestion.field_name) || rejectedFields.has(suggestion.field_name)}
              />
            ))}
          </div>
        </div>
      )}

      {mediumConfidenceSuggestions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Medium Confidence Suggestions ({mediumConfidenceSuggestions.length})
          </h3>
          <div className="space-y-3">
            {mediumConfidenceSuggestions.map(suggestion => (
              <ValidationSuggestionDiff
                key={suggestion.field_name}
                suggestion={suggestion}
                onAccept={onAcceptField}
                onReject={onRejectField}
                onDiscussFurther={onDiscussField}
                isLoading={isLoading}
                hideActions={acceptedFields.has(suggestion.field_name) || rejectedFields.has(suggestion.field_name)}
              />
            ))}
          </div>
        </div>
      )}

      {suggestions.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No suggestions found.</p>
        </div>
      )}
    </div>
  );
}
