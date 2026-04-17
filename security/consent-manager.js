/**
 * Consent Manager
 *
 * Manages employee consent for AI agent data access.
 * Required by AU Workplace Surveillance Act 2005 (NSW) and Australian Privacy Act 1988.
 *
 * Usage:
 *   const consent = createConsentManager(supabaseServiceClient);
 *   await consent.requireConsent(userId, ['activity_tracking', 'email_access']);
 *   // throws ConsentError if not granted
 *
 * Reusable across any Node.js/Next.js project.
 */

// ============================================================
// Consent Types
// ============================================================

const CONSENT_TYPES = {
  ACTIVITY_TRACKING: 'activity_tracking',
  EMAIL_ACCESS: 'email_access',
  CRM_ACCESS: 'crm_access',
  COACHING: 'coaching',
  TASK_DELEGATION: 'task_delegation'
};

// Human-readable descriptions (for UI display)
const CONSENT_DESCRIPTIONS = {
  activity_tracking: {
    title: 'Activity Tracking',
    description: 'Allow your AI assistant and coach to observe which applications you use, ' +
      'how long you spend on tasks, and your general work patterns.',
    data_accessed: ['Application names and URLs', 'Time spent per task', 'Calendar events', 'Task completion patterns']
  },
  email_access: {
    title: 'Email Access',
    description: 'Allow your AI assistant to read email summaries (not full content) ' +
      'to understand your communication patterns and task-related correspondence.',
    data_accessed: ['Email subject lines', 'Sender/recipient names', 'Email categories', 'Response time patterns']
  },
  crm_access: {
    title: 'CRM Data Access',
    description: 'Allow your AI assistant to view your CRM activities including ' +
      'contacts, tasks, and workflow interactions.',
    data_accessed: ['Contact names and categories', 'Task assignments', 'Workflow status', 'Activity timeline']
  },
  coaching: {
    title: 'AI Coaching',
    description: 'Allow an AI coach to review your work patterns and provide ' +
      'suggestions for optimising your role and delegation opportunities.',
    data_accessed: ['Work pattern analysis', 'Task value assessments', 'Delegation recommendations', 'Coaching conversation history']
  },
  task_delegation: {
    title: 'Task Delegation to AI',
    description: 'Allow your AI assistant to take over routine tasks on your behalf ' +
      'after learning your processes.',
    data_accessed: ['Task procedures and steps', 'Decision criteria', 'Output templates', 'Handoff records']
  }
};

// ============================================================
// Consent Error
// ============================================================

class ConsentError extends Error {
  /**
   * @param {string} message
   * @param {string[]} missingConsents - Which consent types are not granted
   */
  constructor(message, missingConsents) {
    super(message);
    this.name = 'ConsentError';
    this.missingConsents = missingConsents;
  }
}

// ============================================================
// Factory
// ============================================================

/**
 * Create a consent manager instance.
 *
 * @param {object} supabaseClient - Supabase client (service role for writes, or user-scoped for reads)
 * @returns {ConsentManager}
 */
function createConsentManager(supabaseClient) {
  if (!supabaseClient) {
    throw new Error('[consent-manager] supabaseClient is required');
  }

  return {
    /**
     * Check if a user has granted a specific consent type.
     *
     * @param {string} userId - User UUID
     * @param {string} consentType - One of CONSENT_TYPES values
     * @returns {Promise<boolean>}
     */
    async hasConsent(userId, consentType) {
      const { data, error } = await supabaseClient
        .from('consent_records')
        .select('granted, revoked_at')
        .eq('user_id', userId)
        .eq('consent_type', consentType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return false;

      // Consent is valid if granted=true and not revoked
      return data.granted === true && !data.revoked_at;
    },

    /**
     * Grant consent for a data access type.
     *
     * @param {string} userId
     * @param {string} consentType
     * @param {object} [metadata] - IP address, user agent, etc.
     */
    async grantConsent(userId, consentType, metadata = {}) {
      // Get org_id from profile
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .single();

      if (!profile) {
        throw new Error(`[consent-manager] User ${userId} not found`);
      }

      const { error } = await supabaseClient
        .from('consent_records')
        .insert({
          org_id: profile.org_id,
          user_id: userId,
          consent_type: consentType,
          granted: true,
          granted_at: new Date().toISOString(),
          revoked_at: null,
          ip_address: metadata.ipAddress || null,
          user_agent: metadata.userAgent || null
        });

      if (error) {
        throw new Error(`[consent-manager] Failed to grant consent: ${error.message}`);
      }
    },

    /**
     * Revoke consent. This is IMMEDIATE — agents must stop accessing
     * this data type as soon as revocation is recorded.
     *
     * @param {string} userId
     * @param {string} consentType
     */
    async revokeConsent(userId, consentType) {
      // Find the most recent active consent record
      const { data: existing } = await supabaseClient
        .from('consent_records')
        .select('id')
        .eq('user_id', userId)
        .eq('consent_type', consentType)
        .eq('granted', true)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        // Mark as revoked
        await supabaseClient
          .from('consent_records')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', existing.id);
      }

      // Also insert a new record showing revocation (audit trail)
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .single();

      if (profile) {
        await supabaseClient
          .from('consent_records')
          .insert({
            org_id: profile.org_id,
            user_id: userId,
            consent_type: consentType,
            granted: false,
            revoked_at: new Date().toISOString()
          });
      }
    },

    /**
     * Get the full consent status for a user across all types.
     *
     * @param {string} userId
     * @returns {Promise<ConsentStatus[]>}
     */
    async getConsentStatus(userId) {
      const statuses = [];

      for (const consentType of Object.values(CONSENT_TYPES)) {
        const granted = await this.hasConsent(userId, consentType);

        // Get the most recent record for timing info
        const { data: record } = await supabaseClient
          .from('consent_records')
          .select('granted_at, revoked_at, created_at')
          .eq('user_id', userId)
          .eq('consent_type', consentType)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        statuses.push({
          consent_type: consentType,
          granted,
          granted_at: record?.granted_at || null,
          revoked_at: record?.revoked_at || null,
          description: CONSENT_DESCRIPTIONS[consentType] || null
        });
      }

      return statuses;
    },

    /**
     * Require that a user has granted ALL specified consent types.
     * Throws ConsentError if any are missing.
     * Use this as a gate before any data access.
     *
     * @param {string} userId
     * @param {string[]} consentTypes - Array of CONSENT_TYPES values
     * @throws {ConsentError}
     */
    async requireConsent(userId, consentTypes) {
      const missing = [];

      for (const ct of consentTypes) {
        const has = await this.hasConsent(userId, ct);
        if (!has) {
          missing.push(ct);
        }
      }

      if (missing.length > 0) {
        throw new ConsentError(
          `User ${userId} has not consented to: ${missing.join(', ')}. ` +
          `Agent access to these data types is blocked.`,
          missing
        );
      }
    },

    /**
     * Map a data resource to the consent type(s) it requires.
     * Use this to automatically determine what consent is needed
     * before accessing a resource.
     *
     * @param {string} resource - Table name or data category
     * @returns {string[]} - Required consent types
     */
    getRequiredConsents(resource) {
      const map = {
        activity_log: [CONSENT_TYPES.ACTIVITY_TRACKING],
        calendar_events: [CONSENT_TYPES.ACTIVITY_TRACKING],
        email_summaries: [CONSENT_TYPES.EMAIL_ACCESS],
        raw_emails: [CONSENT_TYPES.EMAIL_ACCESS],
        crm_contacts: [CONSENT_TYPES.CRM_ACCESS],
        crm_deals: [CONSENT_TYPES.CRM_ACCESS],
        coaching_notes: [CONSENT_TYPES.COACHING],
        delegation_history: [CONSENT_TYPES.COACHING, CONSENT_TYPES.TASK_DELEGATION],
        delegation_suggestions: [CONSENT_TYPES.COACHING],
        task_suggestions: [CONSENT_TYPES.TASK_DELEGATION],
        task_registry: [CONSENT_TYPES.TASK_DELEGATION]
      };

      return map[resource.toLowerCase()] || [];
    }
  };
}

/**
 * @typedef {object} ConsentStatus
 * @property {string} consent_type
 * @property {boolean} granted
 * @property {string|null} granted_at
 * @property {string|null} revoked_at
 * @property {object|null} description
 */

/**
 * @typedef {object} ConsentManager
 * @property {Function} hasConsent
 * @property {Function} grantConsent
 * @property {Function} revokeConsent
 * @property {Function} getConsentStatus
 * @property {Function} requireConsent
 * @property {Function} getRequiredConsents
 */

module.exports = {
  createConsentManager,
  ConsentError,
  CONSENT_TYPES,
  CONSENT_DESCRIPTIONS
};
