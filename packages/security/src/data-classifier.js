/**
 * Data Classification & Redaction
 *
 * Classifies content before it reaches an LLM. Redacts or blocks sensitive data.
 * Uses configurable patterns from classification-patterns.json.
 *
 * Usage:
 *   const classifier = createDataClassifier();  // uses default patterns
 *   const classifications = classifier.classifyContent(emailBody);
 *   if (classifier.shouldBlockForLLM(classifications)) { throw ... }
 *   const { redacted, redactions } = classifier.redactPII(emailBody);
 *
 * Reusable across any Node.js/Next.js project.
 */

const path = require('path');
const fs = require('fs');

// ============================================================
// Classification Categories
// ============================================================

const CATEGORIES = {
  PII: 'PII',
  FINANCIAL: 'FINANCIAL',
  CREDENTIAL: 'CREDENTIAL',
  PRIVILEGED: 'PRIVILEGED',
  COMMERCIAL: 'COMMERCIAL',
  GENERAL: 'GENERAL'
};

// Categories that should ALWAYS block LLM access
const ALWAYS_BLOCK = new Set([CATEGORIES.CREDENTIAL]);

// Categories that block by default unless explicitly allowed
const BLOCK_BY_DEFAULT = new Set([CATEGORIES.PRIVILEGED]);

// Categories that get redacted (not blocked)
const REDACT_BY_DEFAULT = new Set([CATEGORIES.PII, CATEGORIES.FINANCIAL]);

// ============================================================
// Pattern Loader
// ============================================================

/**
 * Load classification patterns from a JSON file.
 * Falls back to the bundled default patterns.
 *
 * @param {string} [patternsPath] - Path to custom patterns JSON file
 * @returns {object} Parsed patterns
 */
function loadPatterns(patternsPath) {
  const filePath = patternsPath || path.join(__dirname, 'classification-patterns.json');

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[data-classifier] Failed to load patterns from ${filePath}:`, err.message);
    return {};
  }
}

// ============================================================
// Classifier Factory
// ============================================================

/**
 * Create a data classifier instance.
 *
 * @param {object} [options]
 * @param {string} [options.patternsPath] - Custom patterns JSON file path
 * @param {string[]} [options.allowCategories] - Categories to allow through (e.g., ['PII'] to skip PII redaction)
 * @param {string[]} [options.blockCategories] - Additional categories to block
 * @returns {DataClassifier}
 */
function createDataClassifier(options = {}) {
  const patterns = loadPatterns(options.patternsPath);
  const allowSet = new Set((options.allowCategories || []).map(c => c.toUpperCase()));
  const extraBlockSet = new Set((options.blockCategories || []).map(c => c.toUpperCase()));

  // Pre-compile regex patterns for performance
  const compiledPatterns = {};
  for (const [category, config] of Object.entries(patterns)) {
    if (category.startsWith('_')) continue; // skip _comment etc.
    if (config.patterns) {
      compiledPatterns[category] = config.patterns.map(p => ({
        ...p,
        compiled: new RegExp(p.regex, 'gi'),
        contextKeywords: (p.context_keywords || []).map(k => k.toLowerCase())
      }));
    }
  }

  return {
    /**
     * Classify content and return all detected classification categories.
     *
     * @param {string} text - Content to classify
     * @returns {Classification[]}
     */
    classifyContent(text) {
      if (!text || typeof text !== 'string') return [{ category: CATEGORIES.GENERAL, matches: [] }];

      const results = [];
      const textLower = text.toLowerCase();

      // Check regex-based patterns (PII, FINANCIAL, CREDENTIAL)
      for (const [category, patternList] of Object.entries(compiledPatterns)) {
        const matches = [];

        for (const pattern of patternList) {
          // Reset regex lastIndex
          pattern.compiled.lastIndex = 0;

          // If pattern has context keywords, only match if keywords are present
          if (pattern.contextKeywords.length > 0) {
            const hasContext = pattern.contextKeywords.some(kw => textLower.includes(kw));
            if (!hasContext) continue;
          }

          let match;
          while ((match = pattern.compiled.exec(text)) !== null) {
            matches.push({
              pattern_name: pattern.name,
              value: match[0],
              index: match.index,
              redact_with: pattern.redact_with
            });
          }
        }

        if (matches.length > 0) {
          results.push({ category, matches });
        }
      }

      // Check keyword-based patterns (PRIVILEGED, COMMERCIAL)
      for (const [category, config] of Object.entries(patterns)) {
        if (category.startsWith('_')) continue;
        if (!config.keywords) continue;

        const matches = [];
        for (const keyword of config.keywords) {
          const idx = textLower.indexOf(keyword.toLowerCase());
          if (idx !== -1) {
            matches.push({
              pattern_name: 'keyword',
              value: keyword,
              index: idx,
              redact_with: null
            });
          }
        }

        if (matches.length > 0) {
          results.push({ category, matches });
        }
      }

      if (results.length === 0) {
        results.push({ category: CATEGORIES.GENERAL, matches: [] });
      }

      return results;
    },

    /**
     * Redact PII and financial data from text.
     * Returns the redacted text and a list of what was redacted.
     *
     * @param {string} text
     * @returns {{ redacted: string, redactions: Redaction[] }}
     */
    redactPII(text) {
      if (!text || typeof text !== 'string') return { redacted: text, redactions: [] };

      const redactions = [];
      let redacted = text;

      // Process CREDENTIAL patterns first (most critical)
      // Then PII, then FINANCIAL
      const categoryOrder = [CATEGORIES.CREDENTIAL, CATEGORIES.PII, CATEGORIES.FINANCIAL];

      for (const category of categoryOrder) {
        const patternList = compiledPatterns[category];
        if (!patternList) continue;

        for (const pattern of patternList) {
          pattern.compiled.lastIndex = 0;

          // Context keyword check
          if (pattern.contextKeywords.length > 0) {
            const hasContext = pattern.contextKeywords.some(kw =>
              redacted.toLowerCase().includes(kw)
            );
            if (!hasContext) continue;
          }

          redacted = redacted.replace(pattern.compiled, (match) => {
            redactions.push({
              category,
              pattern_name: pattern.name,
              original_length: match.length,
              replacement: pattern.redact_with
            });
            return pattern.redact_with;
          });
        }
      }

      return { redacted, redactions };
    },

    /**
     * Determine if content should be completely blocked from LLM access.
     *
     * @param {Classification[]} classifications - Output of classifyContent()
     * @returns {boolean}
     */
    shouldBlockForLLM(classifications) {
      for (const c of classifications) {
        const cat = c.category.toUpperCase();

        // Allowed categories are never blocked
        if (allowSet.has(cat)) continue;

        // Always-block categories
        if (ALWAYS_BLOCK.has(cat)) return true;

        // Extra block categories from config
        if (extraBlockSet.has(cat)) return true;

        // Default-block categories
        if (BLOCK_BY_DEFAULT.has(cat)) return true;
      }

      return false;
    },

    /**
     * Get a human-readable summary of classifications.
     *
     * @param {Classification[]} classifications
     * @returns {string}
     */
    summarize(classifications) {
      if (classifications.length === 1 && classifications[0].category === CATEGORIES.GENERAL) {
        return 'Content classified as GENERAL — no sensitive data detected.';
      }

      const parts = classifications.map(c => {
        const matchCount = c.matches.length;
        const patternNames = [...new Set(c.matches.map(m => m.pattern_name))];
        return `${c.category}: ${matchCount} match(es) [${patternNames.join(', ')}]`;
      });

      return `Sensitive data detected — ${parts.join('; ')}`;
    },

    /**
     * Process text for safe LLM consumption:
     * 1. Classify
     * 2. Block if needed
     * 3. Redact PII/financial
     * 4. Return safe text + metadata
     *
     * @param {string} text
     * @returns {{ safe: boolean, text: string, classifications: Classification[], redactions: Redaction[], blocked: boolean, blockReason?: string }}
     */
    processForLLM(text) {
      const classifications = this.classifyContent(text);
      const blocked = this.shouldBlockForLLM(classifications);

      if (blocked) {
        const blockingCategories = classifications
          .filter(c => ALWAYS_BLOCK.has(c.category) || BLOCK_BY_DEFAULT.has(c.category) || extraBlockSet.has(c.category))
          .map(c => c.category);

        return {
          safe: false,
          text: '',
          classifications,
          redactions: [],
          blocked: true,
          blockReason: `Content blocked due to: ${blockingCategories.join(', ')}`
        };
      }

      const { redacted, redactions } = this.redactPII(text);

      return {
        safe: true,
        text: redacted,
        classifications,
        redactions,
        blocked: false
      };
    }
  };
}

/**
 * @typedef {object} Classification
 * @property {string} category - CATEGORIES value
 * @property {ClassificationMatch[]} matches
 */

/**
 * @typedef {object} ClassificationMatch
 * @property {string} pattern_name
 * @property {string} value - The matched text
 * @property {number} index - Position in source text
 * @property {string|null} redact_with
 */

/**
 * @typedef {object} Redaction
 * @property {string} category
 * @property {string} pattern_name
 * @property {number} original_length
 * @property {string} replacement
 */

module.exports = {
  createDataClassifier,
  CATEGORIES,
  ALWAYS_BLOCK,
  BLOCK_BY_DEFAULT,
  REDACT_BY_DEFAULT
};
